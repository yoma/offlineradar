import type { TipStatus } from "@/types/tips";

/**
 * Transactional tip status emails — templates + idempotency.
 *
 * Provider: NOT configured. sendTipEmail always returns provider_not_configured.
 * Do not activate Resend/Postmark/SES without explicit product approval.
 *
 * Retention advice (no auto-cron this phase):
 * - Clear tip.email after successful status mail or after 90 days if unused.
 * - Keep tip URL + status for dedupe/audit without PII email.
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

export function buildTipStatusEmail(input: {
  tipId: string;
  status: TipStatus;
  email: string;
  reason?: string | null;
  publishedAbsoluteUrl?: string | null;
}): TipEmailDraft | null {
  const kind = emailKindForStatus(input.status);
  if (!kind) return null;

  const idempotencyKey = `tip:${input.tipId}:status:${input.status}`;

  if (kind === "published") {
    const link = input.publishedAbsoluteUrl?.trim();
    if (!link) return null;
    return {
      kind,
      to: input.email,
      subject: "Je tip staat op OfflineRadar",
      body:
        "Bedankt voor je tip! We hebben de activiteit gecontroleerd en ze staat nu op OfflineRadar." +
        `\n\nBekijk de activiteit: ${link}`,
      idempotencyKey,
    };
  }

  if (kind === "needs_info") {
    return {
      kind,
      to: input.email,
      subject: "Nog iets nodig voor je OfflineRadar-tip",
      body:
        "Bedankt voor je tip. We hebben nog informatie nodig om de activiteit verder te controleren. Dit is geen definitieve afwijzing." +
        (input.reason ? `\n\n${input.reason}` : ""),
      idempotencyKey,
    };
  }

  if (kind === "approved_prep") {
    return {
      kind,
      to: input.email,
      subject: "Je tip is goedgekeurd en wordt nog voorbereid",
      body:
        "Bedankt voor je tip. We hebben je tip goedgekeurd en bereiden de activiteit nog voor op OfflineRadar. Ze staat nog niet live.",
      idempotencyKey,
    };
  }

  return {
    kind: "rejected",
    to: input.email,
    subject: "We hebben je tip bekeken",
    body:
      "Bedankt voor je tip. We nemen deze activiteit momenteel niet op in OfflineRadar." +
      (input.reason ? `\n\nReden: ${input.reason}` : "") +
      "\n\nKen je een andere officiële link? Je mag die altijd opnieuw tippen.",
    idempotencyKey,
  };
}

/**
 * Provider stub: always reports not configured.
 * Call only after explicit product-owner approval of a mail service.
 */
export async function sendTipEmail(
  _draft: TipEmailDraft,
): Promise<{ sent: false; reason: "provider_not_configured" }> {
  return { sent: false, reason: "provider_not_configured" };
}
