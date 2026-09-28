"use server";

import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";

export type FeedbackResult =
  | { ok: true }
  | { ok: false; error: string };

function clean(value: FormDataEntryValue | null, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function submitBetaFeedback(
  formData: FormData,
): Promise<FeedbackResult> {
  const whatWentWell = clean(formData.get("whatWentWell"));
  const whatUnclear = clean(formData.get("whatUnclear"));
  const whatMissing = clean(formData.get("whatMissing"));
  const contactEmail = clean(formData.get("contactEmail"), 200);
  const userAgent = clean(formData.get("userAgent"), 400);

  if (!whatWentWell && !whatUnclear && !whatMissing) {
    return {
      ok: false,
      error: "Vul minstens één veld in zodat we iets concreets kunnen verbeteren.",
    };
  }

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false, error: "Dat e-mailadres lijkt ongeldig." };
  }

  const sql = getEventsSql();
  if (!sql) {
    return {
      ok: false,
      error: "Feedback opslaan lukt tijdelijk niet. Probeer het later opnieuw.",
    };
  }

  try {
    await sql`
      INSERT INTO beta_feedback (
        id, what_went_well, what_unclear, what_missing, contact_email, user_agent
      ) VALUES (
        ${randomUUID()},
        ${whatWentWell || null},
        ${whatUnclear || null},
        ${whatMissing || null},
        ${contactEmail || null},
        ${userAgent || null}
      )
    `;
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Feedback opslaan mislukt. Probeer het later opnieuw.",
    };
  }
}
