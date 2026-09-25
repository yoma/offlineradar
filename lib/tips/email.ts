import type { TipStatus } from "@/types/tips";

/**
 * Transactional tip status emails — prepared only.
 * No mail provider is activated in this phase.
 */

export type TipEmailKind = "published" | "rejected" | "needs_info";

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
  // approved_for_publication intentionally has no “online” claim mail.
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
    const linkLine = link
      ? `\n\nBekijk de activiteit: ${link}`
      : "\n\n(De publicatielink ontbreekt nog; voeg die toe vóór verzending.)";
    return {
      kind,
      to: input.email,
      subject: "Je tip staat op OfflineRadar",
      body:
        "Bedankt voor je tip! We hebben de activiteit gecontroleerd en ze staat nu op OfflineRadar." +
        linkLine,
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

  return {
    kind: "rejected",
    to: input.email,
    subject: "Update over je OfflineRadar-tip",
    body:
      "Bedankt voor je tip. We nemen deze activiteit momenteel niet op in OfflineRadar." +
      (input.reason ? `\n\nReden: ${input.reason}` : ""),
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
