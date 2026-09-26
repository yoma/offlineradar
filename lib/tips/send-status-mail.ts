/**
 * Explicit admin tip status-mail orchestration.
 * Recipient always from stored tip. Never auto-sends on status change.
 */
import { appPublicBaseUrl } from "@/lib/email/app-brand";
import {
  buildTipStatusEmail,
  emailKindForStatus,
  maskEmail,
  sendTipEmail,
  type TipEmailDraft,
  type TipEmailKind,
} from "@/lib/tips/email";
import {
  neonClearTipEmail,
  neonFindTipById,
  neonHasEmailLog,
  neonListEmailLogsForTip,
  neonRecordEmailAttempt,
} from "@/lib/tips/neon-store";
import { getEditionById } from "@/lib/events/neon-store";
import type { TipStatus } from "@/types/tips";

export type TipMailPreview = {
  kind: TipEmailKind;
  subject: string;
  toMasked: string;
  bodyPreview: string;
  idempotencyKey: string;
  alreadySent: boolean;
};

export async function previewTipStatusMail(input: {
  tipId: string;
  mailStatus?: TipStatus | null;
  requestOrigin?: string | null;
}): Promise<
  | { ok: true; preview: TipMailPreview; draft: TipEmailDraft }
  | { ok: false; error: string; code: string }
> {
  const found = await neonFindTipById(input.tipId);
  if (!found) return { ok: false, code: "not_found", error: "Tip niet gevonden." };
  if (!found.tip.notifyRequested || !found.tip.email) {
    return {
      ok: false,
      code: "no_opt_in",
      error: "Geen opt-in e-mail voor deze tip.",
    };
  }

  const status = input.mailStatus ?? found.tip.status;
  const kind = emailKindForStatus(status);
  if (!kind) {
    return {
      ok: false,
      code: "invalid_status",
      error: "Deze tipstatus heeft geen statusmail.",
    };
  }

  let publishedAbsoluteUrl: string | null = null;
  let eventTitle: string | null = null;
  let linkedEventId: string | null = found.tip.linkedEventId;

  if (status === "published") {
    if (!found.tip.linkedEventId) {
      return {
        ok: false,
        code: "no_linked_event",
        error: "Geen gekoppeld published event voor publicatiemail.",
      };
    }
    const bundle = await getEditionById(found.tip.linkedEventId);
    if (!bundle || bundle.edition.publicationStatus !== "published") {
      return {
        ok: false,
        code: "event_not_published",
        error: "Gekoppeld event is niet published.",
      };
    }
    const base = appPublicBaseUrl(input.requestOrigin);
    publishedAbsoluteUrl = `${base}/event/${bundle.edition.slug}`;
    eventTitle = bundle.edition.title;
    linkedEventId = bundle.edition.id;
  }

  const draft = buildTipStatusEmail({
    tipId: found.tip.id,
    status,
    email: found.tip.email,
    reason: found.review.decisionReason,
    publishedAbsoluteUrl,
    eventTitle,
    linkedEventId,
  });
  if (!draft) {
    return {
      ok: false,
      code: "no_template",
      error: "Geen mailtemplate voor deze status.",
    };
  }

  const alreadySent = await neonHasEmailLog(draft.idempotencyKey);
  return {
    ok: true,
    draft,
    preview: {
      kind: draft.kind,
      subject: draft.subject,
      toMasked: maskEmail(draft.to),
      bodyPreview: draft.body.slice(0, 280),
      idempotencyKey: draft.idempotencyKey,
      alreadySent,
    },
  };
}

export async function sendTipStatusMailExplicit(input: {
  tipId: string;
  mailStatus?: TipStatus | null;
  requestOrigin?: string | null;
}): Promise<
  | {
      ok: true;
      sent: boolean;
      skipped?: "already_sent";
      messageId?: string;
      preview: TipMailPreview;
    }
  | { ok: false; error: string; code: string; preview?: TipMailPreview }
> {
  const prepared = await previewTipStatusMail(input);
  if (!prepared.ok) {
    return { ok: false, error: prepared.error, code: prepared.code };
  }

  if (prepared.preview.alreadySent) {
    return {
      ok: true,
      sent: false,
      skipped: "already_sent",
      preview: prepared.preview,
    };
  }

  const found = await neonFindTipById(input.tipId);
  const statusForLog = input.mailStatus ?? found?.tip.status;
  if (!statusForLog) {
    return {
      ok: false,
      code: "not_found",
      error: "Tip niet gevonden.",
      preview: prepared.preview,
    };
  }

  const sent = await sendTipEmail(prepared.draft);
  if (!sent.sent) {
    return {
      ok: false,
      code: sent.reason,
      error: sent.error,
      preview: prepared.preview,
    };
  }

  // Log after provider success. Unique key + Resend Idempotency-Key block duplicates.
  await neonRecordEmailAttempt({
    tipId: input.tipId,
    status: statusForLog,
    idempotencyKey: sent.idempotencyKey,
    providerMessageId: sent.messageId,
  });

  return {
    ok: true,
    sent: true,
    messageId: sent.messageId,
    preview: { ...prepared.preview, alreadySent: true },
  };
}

export async function clearTipContactEmail(tipId: string): Promise<
  | { ok: true }
  | { ok: false; error: string; code: string }
> {
  const found = await neonFindTipById(tipId);
  if (!found) return { ok: false, code: "not_found", error: "Tip niet gevonden." };
  const cleared = await neonClearTipEmail(tipId);
  if (!cleared) {
    return { ok: false, code: "storage_error", error: "Kon e-mail niet wissen." };
  }
  return { ok: true };
}

export async function listTipEmailHistory(tipId: string) {
  return neonListEmailLogsForTip(tipId);
}
