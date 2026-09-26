/**
 * Resend transactional sender for tip status mails only.
 * No marketing. No Gmail API.
 */
import { Resend } from "resend";
import {
  isResendConfigured,
  transactionalFromAddress,
} from "@/lib/email/app-brand";

export type ResendSendResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason: "provider_not_configured" | "provider_error";
      error: string;
    };

export async function sendViaResend(input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = transactionalFromAddress();
  if (!apiKey || !from || !isResendConfigured()) {
    return {
      ok: false,
      reason: "provider_not_configured",
      error:
        "Mailprovider niet geconfigureerd (RESEND_API_KEY + OFFLINERADAR_EMAIL_FROM).",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send(
      {
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (result.error) {
      return {
        ok: false,
        reason: "provider_error",
        error: result.error.message || "Resend weigerde de mail.",
      };
    }

    const messageId = result.data?.id;
    if (!messageId) {
      return {
        ok: false,
        reason: "provider_error",
        error: "Resend gaf geen message id terug.",
      };
    }

    return { ok: true, messageId };
  } catch (error) {
    return {
      ok: false,
      reason: "provider_error",
      error:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "Onbekende Resend-fout.",
    };
  }
}
