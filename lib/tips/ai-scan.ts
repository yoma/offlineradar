/**
 * Tip AI scan orchestration (admin-triggered only).
 * Never auto-publishes. Never overwrites human decision fields.
 */

import {
  clonePrepForReuse,
  findReusableAiPrep,
  isAiPrepFresh,
} from "@/lib/tips/ai-prep";
import { AiScreenerError } from "@/lib/screening/ai/anthropic-screener";
import { safeFetchTipSource } from "@/lib/tips/safe-fetch";
import { tipsStorageMode } from "@/lib/tips/config";
import {
  neonFindTipById,
  neonFindReusableAiPrep,
  neonSaveAiPrep,
  neonSetTipStatusIfCurrent,
} from "@/lib/tips/neon-store";
import { getTipsStore } from "@/lib/tips/storage";
import { runTipClaudeScreening } from "@/lib/tips/tip-screener";
import type { TipAiPrep, TipReview, TipSubmission } from "@/types/tips";

const inflight = new Set<string>();

export type TipAiScanResult =
  | {
      ok: true;
      reused: boolean;
      prep: TipAiPrep;
      tip: TipSubmission;
      review: TipReview;
    }
  | {
      ok: false;
      error: string;
      code:
        | "not_found"
        | "storage"
        | "inflight"
        | "source_unavailable"
        | "missing_key"
        | "ai_error"
        | "fresh";
      prep?: TipAiPrep;
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

function failedPrep(partial: Partial<TipAiPrep> & { scanError: string }): TipAiPrep {
  return {
    preparedAt: new Date().toISOString(),
    modelHint: null,
    sourceContentHash: null,
    reusedFromTipId: null,
    sourceUrlsUsed: [],
    proposedTitle: null,
    proposedOrganizer: null,
    proposedStartDate: null,
    proposedStartTime: null,
    proposedEndTime: null,
    proposedCity: null,
    proposedVenue: null,
    proposedPriceNotes: null,
    singlesRoute: null,
    routeSuggestion: null,
    routeReason: null,
    confidence: null,
    singlesEvidence: null,
    singlesOnly: null,
    ageNotes: null,
    ageRule: null,
    priceNotes: null,
    availabilityNotes: null,
    bookingUrl: null,
    gaps: [],
    conflicts: [],
    suggestsListable: null,
    suggestSourceWatch: false,
    suggestSourceWatchReason: null,
    rawNotes: null,
    ...partial,
  };
}

async function loadTipAndReview(
  tipId: string,
): Promise<{ tip: TipSubmission; review: TipReview } | null> {
  const mode = tipsStorageMode();
  if (mode === "neon") {
    return neonFindTipById(tipId);
  }
  if (mode === "local_file") {
    const store = getTipsStore();
    if (!store) return null;
    const snapshot = await store.read();
    const tip = snapshot.tips.find((item) => item.id === tipId);
    if (!tip) return null;
    const review =
      snapshot.reviews.find((item) => item.tipId === tipId) ?? emptyReview(tipId);
    return { tip, review };
  }
  return null;
}

async function persistAiPrep(input: {
  tipId: string;
  prep: TipAiPrep;
  sourceUrlChecked: string;
  setInReview: boolean;
}): Promise<{ tip: TipSubmission; review: TipReview } | null> {
  const mode = tipsStorageMode();
  if (mode === "neon") {
    await neonSaveAiPrep({
      tipId: input.tipId,
      prep: input.prep,
      sourceUrlChecked: input.sourceUrlChecked,
    });
    if (input.setInReview) {
      await neonSetTipStatusIfCurrent({
        tipId: input.tipId,
        fromStatuses: ["received", "duplicate", "needs_info"],
        toStatus: "in_review",
      });
    }
    return neonFindTipById(input.tipId);
  }

  if (mode === "local_file") {
    const store = getTipsStore();
    if (!store) return null;
    const snapshot = await store.read();
    const tip = snapshot.tips.find((item) => item.id === input.tipId);
    if (!tip) return null;
    let review = snapshot.reviews.find((item) => item.tipId === input.tipId);
    if (!review) {
      review = emptyReview(input.tipId);
      snapshot.reviews.push(review);
    }
    // Never overwrite human decision fields.
    review.aiPrep = input.prep;
    review.checkedAt = input.prep.preparedAt;
    review.sourceUrlChecked = input.sourceUrlChecked;
    review.missingOrConflicts = [
      ...input.prep.gaps,
      ...input.prep.conflicts,
    ].slice(0, 40);
    if (
      input.setInReview &&
      (tip.status === "received" ||
        tip.status === "duplicate" ||
        tip.status === "needs_info")
    ) {
      tip.status = "in_review";
    }
    await store.write(snapshot);
    return { tip, review };
  }

  return null;
}

async function findReuseCandidate(
  tip: TipSubmission,
  contentHash: string,
): Promise<{ tipId: string; prep: TipAiPrep } | null> {
  const mode = tipsStorageMode();
  if (mode === "neon") {
    return neonFindReusableAiPrep({
      normalizedUrl: tip.normalizedUrl,
      contentHash,
      excludeTipId: tip.id,
    });
  }
  if (mode === "local_file") {
    const store = getTipsStore();
    if (!store) return null;
    const snapshot = await store.read();
    const map = new Map(
      snapshot.reviews.map((review) => [review.tipId, review.aiPrep]),
    );
    return findReusableAiPrep(
      snapshot.tips,
      map,
      tip.normalizedUrl,
      contentHash,
    );
  }
  return null;
}

/**
 * Admin-only tip AI scan. Cost-aware: reuse hash/fresh prep; one inflight per tip.
 */
export async function runTipAiScan(tipId: string): Promise<TipAiScanResult> {
  if (inflight.has(tipId)) {
    return {
      ok: false,
      code: "inflight",
      error: "Er loopt al een AI-controle voor deze tip.",
    };
  }

  const loaded = await loadTipAndReview(tipId);
  if (!loaded) {
    return { ok: false, code: "not_found", error: "Melding niet gevonden." };
  }

  const { tip, review } = loaded;

  if (isAiPrepFresh(review.aiPrep)) {
    return {
      ok: true,
      reused: true,
      prep: review.aiPrep!,
      tip,
      review,
    };
  }

  inflight.add(tipId);
  try {
    // Mark in_review early so the queue reflects activity (human decision untouched).
    if (
      tip.status === "received" ||
      tip.status === "duplicate" ||
      tip.status === "needs_info"
    ) {
      const mode = tipsStorageMode();
      if (mode === "neon") {
        await neonSetTipStatusIfCurrent({
          tipId,
          fromStatuses: ["received", "duplicate", "needs_info"],
          toStatus: "in_review",
        });
      } else if (mode === "local_file") {
        const store = getTipsStore();
        if (store) {
          const snapshot = await store.read();
          const t = snapshot.tips.find((item) => item.id === tipId);
          if (
            t &&
            (t.status === "received" ||
              t.status === "duplicate" ||
              t.status === "needs_info")
          ) {
            t.status = "in_review";
            await store.write(snapshot);
          }
        }
      }
    }

    const fetched = await safeFetchTipSource(tip.originalUrl);
    if (!fetched.ok) {
      const prep = failedPrep({
        scanError: `source_unavailable: ${fetched.error}`,
        bookingUrl: tip.normalizedUrl,
        sourceUrlsUsed: [tip.normalizedUrl],
        gaps: ["Bron kon niet veilig worden opgehaald."],
      });
      // Do not wipe a previous successful prep on failure.
      if (review.aiPrep?.routeSuggestion && !review.aiPrep.scanError) {
        return {
          ok: false,
          code: "source_unavailable",
          error: fetched.error,
          prep: review.aiPrep,
        };
      }
      await persistAiPrep({
        tipId,
        prep,
        sourceUrlChecked: tip.normalizedUrl,
        setInReview: false,
      });
      return {
        ok: false,
        code: "source_unavailable",
        error: fetched.error,
        prep,
      };
    }

    const ownReusable =
      review.aiPrep?.sourceContentHash === fetched.contentHash &&
      review.aiPrep.routeSuggestion &&
      !review.aiPrep.scanError
        ? { tipId: tip.id, prep: review.aiPrep }
        : null;
    const reuse =
      ownReusable ?? (await findReuseCandidate(tip, fetched.contentHash));
    if (reuse) {
      const prep = clonePrepForReuse(reuse.prep, reuse.tipId);
      prep.sourceUrlsUsed = Array.from(
        new Set([fetched.finalUrl, ...prep.sourceUrlsUsed]),
      );
      const saved = await persistAiPrep({
        tipId,
        prep,
        sourceUrlChecked: fetched.finalUrl,
        setInReview: true,
      });
      if (!saved) {
        return { ok: false, code: "storage", error: "Opslaan mislukt." };
      }
      return {
        ok: true,
        reused: true,
        prep,
        tip: saved.tip,
        review: saved.review,
      };
    }

    try {
      const { prep } = await runTipClaudeScreening({
        tipUrl: tip.originalUrl,
        sourceUrl: fetched.finalUrl,
        sourceText: fetched.text,
        contentHash: fetched.contentHash,
        submitterNote: tip.note,
      });
      const saved = await persistAiPrep({
        tipId,
        prep,
        sourceUrlChecked: fetched.finalUrl,
        setInReview: true,
      });
      if (!saved) {
        return { ok: false, code: "storage", error: "Opslaan mislukt." };
      }
      return {
        ok: true,
        reused: false,
        prep,
        tip: saved.tip,
        review: saved.review,
      };
    } catch (err) {
      if (err instanceof AiScreenerError && err.kind === "missing_key") {
        return {
          ok: false,
          code: "missing_key",
          error:
            "AI-controle is nog niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt op de server).",
        };
      }
      const message =
        err instanceof AiScreenerError
          ? err.message
          : "AI-controle mislukt door een onbekende fout.";
      // Keep previous successful prep if any.
      if (review.aiPrep?.routeSuggestion && !review.aiPrep.scanError) {
        return {
          ok: false,
          code: "ai_error",
          error: message,
          prep: review.aiPrep,
        };
      }
      const prep = failedPrep({
        scanError: message,
        sourceContentHash: fetched.contentHash,
        sourceUrlsUsed: [fetched.finalUrl],
        bookingUrl: tip.normalizedUrl,
        gaps: ["AI-controle mislukt; probeer later opnieuw."],
      });
      await persistAiPrep({
        tipId,
        prep,
        sourceUrlChecked: fetched.finalUrl,
        setInReview: false,
      });
      return { ok: false, code: "ai_error", error: message, prep };
    }
  } finally {
    inflight.delete(tipId);
  }
}
