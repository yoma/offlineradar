import { randomUUID } from "node:crypto";
import { tipsStorageMode } from "@/lib/tips/config";
import {
  neonFindTipByNormalizedUrl,
  neonInsertTip,
  neonLoadSnapshot,
  neonUpdateExistingDuplicate,
  neonUpdateTipStatus,
} from "@/lib/tips/neon-store";
import { getTipsStore } from "@/lib/tips/storage";
import { isValidEmail, validateAndNormalizeTipUrl } from "@/lib/tips/url";
import type {
  TipCreateInput,
  TipReview,
  TipStatus,
  TipSubmission,
  TipsStoreSnapshot,
} from "@/types/tips";

export type TipCreateResult =
  | {
      ok: true;
      tip: TipSubmission;
      review: TipReview;
      duplicate: boolean;
    }
  | {
      ok: false;
      error: string;
      code: "validation" | "storage_disabled" | "storage_error";
    };

function emptyReview(tipId: string): TipReview {
  return {
    tipId,
    checkedAt: null,
    sourceUrlChecked: null,
    aiPrep: null,
    missingOrConflicts: [],
    adminDecision: null,
    decisionReason: null,
    decidedAt: null,
    publishedAt: null,
    publishedEventPath: null,
    emailSentForStatuses: [],
  };
}

function validateCreateInput(input: TipCreateInput):
  | {
      ok: true;
      originalUrl: string;
      normalizedUrl: string;
      note: string | null;
      notifyRequested: boolean;
      email: string | null;
    }
  | { ok: false; error: string } {
  const urlResult = validateAndNormalizeTipUrl(input.url);
  if (!urlResult.ok) return { ok: false, error: urlResult.error };

  const notifyRequested = input.notifyRequested === true;
  const note = input.note?.trim() ? input.note.trim().slice(0, 2000) : null;

  let email: string | null = null;
  if (notifyRequested) {
    const rawEmail = input.email?.trim() ?? "";
    if (!rawEmail) {
      return {
        ok: false,
        error: "Vul je e-mailadres in om een update te ontvangen.",
      };
    }
    if (!isValidEmail(rawEmail)) {
      return { ok: false, error: "Dit e-mailadres lijkt ongeldig." };
    }
    email = rawEmail.toLowerCase();
  } else if (input.email?.trim()) {
    return {
      ok: false,
      error:
        "E-mailadres mag alleen worden meegestuurd als je om een update vraagt.",
    };
  }

  return {
    ok: true,
    originalUrl: urlResult.originalUrl,
    normalizedUrl: urlResult.normalizedUrl,
    note,
    notifyRequested,
    email,
  };
}

async function createTipNeon(
  validated: Extract<ReturnType<typeof validateCreateInput>, { ok: true }>,
  userAgent: string | null | undefined,
): Promise<TipCreateResult> {
  try {
    const existing = await neonFindTipByNormalizedUrl(validated.normalizedUrl);
    if (existing) {
      const duplicateNotes = [...existing.tip.duplicateNotes];
      if (validated.note) {
        duplicateNotes.push(`${new Date().toISOString()}: ${validated.note}`);
      }
      let notifyRequested = existing.tip.notifyRequested;
      let email = existing.tip.email;
      if (
        validated.notifyRequested &&
        validated.email &&
        !existing.tip.notifyRequested &&
        existing.tip.email == null
      ) {
        notifyRequested = true;
        email = validated.email;
      }
      const status: TipStatus =
        existing.tip.status === "received" ? "duplicate" : existing.tip.status;

      await neonUpdateExistingDuplicate({
        tipId: existing.tip.id,
        duplicateNotes: duplicateNotes.slice(-20),
        status,
        notifyRequested,
        email,
      });

      const tip: TipSubmission = {
        ...existing.tip,
        duplicateNotes: duplicateNotes.slice(-20),
        status,
        notifyRequested,
        email,
      };
      return { ok: true, tip, review: existing.review, duplicate: true };
    }

    const tip: TipSubmission = {
      id: randomUUID(),
      originalUrl: validated.originalUrl,
      normalizedUrl: validated.normalizedUrl,
      note: validated.note,
      receivedAt: new Date().toISOString(),
      notifyRequested: validated.notifyRequested,
      email: validated.email,
      status: "received",
      duplicateOfTipId: null,
      linkedEventId: null,
      linkedSourceId: null,
      duplicateNotes: [],
      submitterMeta: {
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    };
    const review = emptyReview(tip.id);
    await neonInsertTip({ tip, review });
    return { ok: true, tip, review, duplicate: false };
  } catch {
    return {
      ok: false,
      code: "storage_error",
      error: "Opslaan mislukt. Probeer het later opnieuw.",
    };
  }
}

async function createTipLocal(
  validated: Extract<ReturnType<typeof validateCreateInput>, { ok: true }>,
  userAgent: string | null | undefined,
): Promise<TipCreateResult> {
  const store = getTipsStore();
  if (!store) {
    return {
      ok: false,
      code: "storage_disabled",
      error:
        "Tips kunnen nu nog niet duurzaam worden opgeslagen. Verzenden is uitgeschakeld.",
    };
  }

  try {
    const snapshot = await store.read();
    const existing = snapshot.tips.find(
      (tip) => tip.normalizedUrl === validated.normalizedUrl,
    );

    if (existing) {
      if (validated.note) {
        existing.duplicateNotes = [
          ...existing.duplicateNotes,
          `${new Date().toISOString()}: ${validated.note}`,
        ].slice(-20);
      }
      if (
        validated.notifyRequested &&
        validated.email &&
        !existing.notifyRequested &&
        existing.email == null
      ) {
        existing.notifyRequested = true;
        existing.email = validated.email;
      }
      if (existing.status === "received") existing.status = "duplicate";
      const review =
        snapshot.reviews.find((item) => item.tipId === existing.id) ??
        emptyReview(existing.id);
      if (!snapshot.reviews.some((item) => item.tipId === existing.id)) {
        snapshot.reviews.push(review);
      }
      await store.write(snapshot);
      return { ok: true, tip: existing, review, duplicate: true };
    }

    const tip: TipSubmission = {
      id: randomUUID(),
      originalUrl: validated.originalUrl,
      normalizedUrl: validated.normalizedUrl,
      note: validated.note,
      receivedAt: new Date().toISOString(),
      notifyRequested: validated.notifyRequested,
      email: validated.email,
      status: "received",
      duplicateOfTipId: null,
      linkedEventId: null,
      linkedSourceId: null,
      duplicateNotes: [],
      submitterMeta: {
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    };
    const review = emptyReview(tip.id);
    snapshot.tips.unshift(tip);
    snapshot.reviews.push(review);
    await store.write(snapshot);
    return { ok: true, tip, review, duplicate: false };
  } catch {
    return {
      ok: false,
      code: "storage_error",
      error: "Opslaan mislukt. Probeer het later opnieuw.",
    };
  }
}

/**
 * Persist a tip only when a durable store is explicitly enabled.
 */
export async function createTip(
  input: TipCreateInput,
): Promise<TipCreateResult> {
  const mode = tipsStorageMode();
  if (mode === "disabled") {
    return {
      ok: false,
      code: "storage_disabled",
      error:
        "Tips kunnen nu nog niet duurzaam worden opgeslagen. Verzenden is uitgeschakeld.",
    };
  }

  const validated = validateCreateInput(input);
  if (!validated.ok) {
    return { ok: false, code: "validation", error: validated.error };
  }

  if (mode === "neon") {
    return createTipNeon(validated, input.userAgent);
  }
  return createTipLocal(validated, input.userAgent);
}

export async function listTips(): Promise<TipsStoreSnapshot | null> {
  const mode = tipsStorageMode();
  if (mode === "neon") return neonLoadSnapshot();
  if (mode === "local_file") {
    const store = getTipsStore();
    if (!store) return null;
    return store.read();
  }
  return null;
}

export async function updateTipStatus(input: {
  tipId: string;
  status: TipStatus;
  decisionReason?: string | null;
  publishedEventPath?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const mode = tipsStorageMode();
  if (mode === "disabled") {
    return { ok: false, error: "Opslag niet beschikbaar." };
  }

  if (mode === "neon") {
    const ok = await neonUpdateTipStatus({
      tipId: input.tipId,
      status: input.status,
      decisionReason: input.decisionReason?.trim() || null,
      publishedEventPath: input.publishedEventPath?.trim() || null,
    });
    return ok ? { ok: true } : { ok: false, error: "Melding niet gevonden." };
  }

  const store = getTipsStore();
  if (!store) return { ok: false, error: "Opslag niet beschikbaar." };

  const snapshot = await store.read();
  const tip = snapshot.tips.find((item) => item.id === input.tipId);
  if (!tip) return { ok: false, error: "Melding niet gevonden." };

  tip.status = input.status;

  let review = snapshot.reviews.find((item) => item.tipId === tip.id);
  if (!review) {
    review = emptyReview(tip.id);
    snapshot.reviews.push(review);
  }

  review.adminDecision = input.status;
  review.decisionReason = input.decisionReason?.trim() || null;
  review.decidedAt = new Date().toISOString();
  review.checkedAt = review.checkedAt ?? review.decidedAt;
  review.sourceUrlChecked = review.sourceUrlChecked ?? tip.normalizedUrl;

  if (input.status === "published") {
    review.publishedAt = review.decidedAt;
    review.publishedEventPath = input.publishedEventPath?.trim() || null;
  }

  await store.write(snapshot);
  return { ok: true };
}
