"use server";

import { headers } from "next/headers";
import { auth } from "@/auth";
import {
  FEEDBACK_CATEGORIES,
  countRecentFeedback,
  insertBetaFeedback,
  type FeedbackCategory,
} from "@/lib/feedback/store";
import {
  clientIpFromRequest,
  consumeTipSubmitRateLimit,
} from "@/lib/tips/rate-limit";

export type FeedbackResult =
  | { ok: true }
  | { ok: false; error: string };

function clean(value: FormDataEntryValue | null, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseCategory(raw: string): FeedbackCategory {
  return FEEDBACK_CATEGORIES.includes(raw as FeedbackCategory)
    ? (raw as FeedbackCategory)
    : "other";
}

function safePathname(raw: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw.slice(0, 300);
}

function safeQuery(raw: string): string | null {
  if (!raw) return null;
  // Never store cookies/tokens; strip common sensitive keys.
  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
    for (const key of [...params.keys()]) {
      if (/token|secret|code|password|auth|session/i.test(key)) {
        params.delete(key);
      }
    }
    const next = params.toString();
    return next ? next.slice(0, 500) : null;
  } catch {
    return null;
  }
}

export async function submitBetaFeedback(
  formData: FormData,
): Promise<FeedbackResult> {
  const category = parseCategory(clean(formData.get("category"), 40));
  const message = clean(formData.get("message"), 2000);
  const contactEmail = clean(formData.get("contactEmail"), 200);
  const userAgent = clean(formData.get("userAgent"), 400);
  const pathname = safePathname(clean(formData.get("pathname"), 300));
  const queryString = safeQuery(clean(formData.get("queryString"), 500));

  // Honeypot: bots fill this; humans leave empty.
  if (clean(formData.get("website"), 100)) {
    return { ok: true };
  }

  if (!message || message.length < 3) {
    return {
      ok: false,
      error: "Vertel kort wat er gebeurde of wat je mist.",
    };
  }

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false, error: "Dat e-mailadres lijkt ongeldig." };
  }

  // Reuse durable tip rate-limit table when available.
  try {
    const h = await headers();
    const req = new Request("https://offlineradar.local/feedback", {
      headers: h,
    });
    // Touch IP helper so dead-code elimination keeps import useful in tests.
    void clientIpFromRequest(req);
    const limit = await consumeTipSubmitRateLimit(req);
    if (!limit.ok && limit.status === 429) {
      return {
        ok: false,
        error: "Te veel berichten. Probeer het later opnieuw.",
      };
    }
  } catch {
    // Fall through to row-count soft limit.
  }

  const recent = await countRecentFeedback(15);
  if (recent >= 40) {
    return {
      ok: false,
      error: "Dat lukte even niet. Probeer opnieuw.",
    };
  }

  let appUserId: string | null = null;
  try {
    const session = await auth();
    if (typeof session?.user?.id === "string") {
      appUserId = session.user.id;
    }
  } catch {
    appUserId = null;
  }

  const inserted = await insertBetaFeedback({
    category,
    message,
    contactEmail: contactEmail || null,
    appUserId,
    pathname,
    queryString,
    userAgent: userAgent || null,
  });

  if (!inserted.ok) {
    return {
      ok: false,
      error: "Dat lukte even niet. Probeer opnieuw.",
    };
  }

  return { ok: true };
}
