import type { TipStatus } from "@/types/tips";
import { appDisplayName, isResendConfigured } from "@/lib/email/app-brand";
import { sendViaResend } from "@/lib/email/resend";

/**
 * Transactional tip status emails.
 *
 * Retention (no auto-cron): clear tip.email after successful final mail
 * or within ~90 days after final handling; keep tip URL/status for dedupe.
 */

export type TipEmailKind =
  | "published"
  | "rejected"
  | "needs_info"
  | "approved_prep";

export type TipEmailDraft = {
  kind: TipEmailKind;
  to: string;
  subject: string;
  body: string;
  /** Dedupes retries / repeated status transitions. */
  idempotencyKey: string;
};

export function emailKindForStatus(status: TipStatus): TipEmailKind | null {
  if (status === "published") return "published";
  if (status === "rejected") return "rejected";
  if (status === "needs_info") return "needs_info";
  if (status === "approved_for_publication") return "approved_prep";
  return null;
}

export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at < 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function buildTipStatusEmail(input: {
  tipId: string;
  status: TipStatus;
  email: string;
  reason?: string | null;
  publishedAbsoluteUrl?: string | null;
  eventTitle?: string | null;
  linkedEventId?: string | null;
  appName?: string;
}): TipEmailDraft | null {
  const kind = emailKindForStatus(input.status);
  if (!kind) return null;

  const appName = input.appName?.trim() || appDisplayName();
  const eventKey = input.linkedEventId?.trim() || "none";
  const idempotencyKey =
    kind === "published"
      ? `tip:${input.tipId}:mail:published:event:${eventKey}`
      : `tip:${input.tipId}:mail:${kind}`;

  if (kind === "published") {
    const link = input.publishedAbsoluteUrl?.trim();
    if (!link) return null;
    const title = input.eventTitle?.trim();
    return {
      kind,
      to: input.email,
      subject: `Je tip staat op ${appName}`,
      body:
        `Bedankt voor je tip! We hebben de activiteit gecontroleerd en ze staat nu op ${appName}.` +
        (title ? `\n\nEvent: ${title}` : "") +
        `\n\nBekijk event: ${link}`,
      idempotencyKey,
    };
  }

  if (kind === "needs_info") {
    return {
      kind,
      to: input.email,
      subject: `Nog iets nodig voor je ${appName}-tip`,
      body:
        `Bedankt voor je tip. We hebben nog informatie nodig om de activiteit verder te controleren. Dit is geen definitieve afwijzing.` +
        (input.reason ? `\n\n${input.reason}` : "") +
        `\n\nJe kunt een completere officiële link opnieuw tippen via ${appName}.`,
      idempotencyKey,
    };
  }

  if (kind === "approved_prep") {
    return {
      kind,
      to: input.email,
      subject: "Je tip is goedgekeurd en wordt nog voorbereid",
      body:
        `Bedankt voor je tip. We hebben je tip goedgekeurd en bereiden de activiteit nog voor op ${appName}. Ze staat nog niet live.`,
      idempotencyKey,
    };
  }

  return {
    kind: "rejected",
    to: input.email,
    subject: "We hebben je tip bekeken",
    body:
      `Bedankt voor je tip. We nemen deze activiteit momenteel niet op in ${appName}.` +
      (input.reason ? `\n\nReden: ${input.reason}` : "") +
      "\n\nKen je een andere officiële link? Je mag die altijd opnieuw tippen.",
    idempotencyKey,
  };
}

export type SendTipEmailResult =
  | { sent: true; messageId: string; idempotencyKey: string }
  | {
      sent: false;
      reason: "provider_not_configured" | "provider_error";
      error: string;
      idempotencyKey: string;
    };

/**
 * Send via Resend when configured; otherwise report not configured.
 */
export async function sendTipEmail(
  draft: TipEmailDraft,
): Promise<SendTipEmailResult> {
  if (!isResendConfigured()) {
    return {
      sent: false,
      reason: "provider_not_configured",
      error:
        "Mailprovider niet geconfigureerd (RESEND_API_KEY + OFFLINERADAR_EMAIL_FROM).",
      idempotencyKey: draft.idempotencyKey,
    };
  }

  const result = await sendViaResend({
    to: draft.to,
    subject: draft.subject,
    text: draft.body,
    idempotencyKey: draft.idempotencyKey,
  });

  if (!result.ok) {
    return {
      sent: false,
      reason: result.reason,
      error: result.error,
      idempotencyKey: draft.idempotencyKey,
    };
  }

  return {
    sent: true,
    messageId: result.messageId,
    idempotencyKey: draft.idempotencyKey,
  };
}

export { isResendConfigured };
