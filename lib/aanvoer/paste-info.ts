/**
 * Extract and classify URLs from pasted admin intake text (FASE 26.17).
 * Pasted text is untrusted evidence, not verified truth.
 */
import { INTAKE_MAX_TEXT_CHARS } from "@/lib/aanvoer/types";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";

export { INTAKE_MAX_TEXT_CHARS };

export type ExtractedIntakeUrlKind =
  | "official"
  | "instagram"
  | "facebook"
  | "ticket"
  | "aggregator"
  | "other";

export type ExtractedIntakeUrl = {
  url: string;
  kind: ExtractedIntakeUrlKind;
};

function classifyUrl(url: string): ExtractedIntakeUrlKind {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("facebook.com") || host.includes("fb.com")) return "facebook";
    if (
      host.includes("eventbrite") ||
      host.includes("ticketmaster") ||
      host.includes("ticket") ||
      host.includes("paylogic")
    ) {
      return "ticket";
    }
    if (
      host.includes("allevents") ||
      host.includes("meetup.com") ||
      host.includes("uitinvlaanderen") ||
      host.includes("facebook.com/events")
    ) {
      return "aggregator";
    }
    return "official";
  } catch {
    return "other";
  }
}

const KIND_PRIORITY: Record<ExtractedIntakeUrlKind, number> = {
  official: 1,
  ticket: 2,
  aggregator: 3,
  instagram: 4,
  facebook: 5,
  other: 6,
};

/** Pull http(s) URLs from free text; SSRF-validated. */
export function extractUrlsFromPastedText(text: string): ExtractedIntakeUrl[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const out: ExtractedIntakeUrl[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,);]+$/g, "");
    const validated = validateAndNormalizeTipUrl(cleaned);
    if (!validated.ok) continue;
    if (seen.has(validated.normalizedUrl)) continue;
    seen.add(validated.normalizedUrl);
    out.push({
      url: validated.normalizedUrl,
      kind: classifyUrl(validated.normalizedUrl),
    });
  }
  return out.sort(
    (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
  );
}

/** Best candidate source URL from pasted text (prefer official). */
export function preferredSourceUrlFromPaste(text: string): string | null {
  const urls = extractUrlsFromPastedText(text);
  return urls[0]?.url ?? null;
}

export function validatePastedIntakeText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Plak eerst info over het event.";
  }
  if (trimmed.length > INTAKE_MAX_TEXT_CHARS) {
    return `Tekst is te lang (max ${INTAKE_MAX_TEXT_CHARS.toLocaleString("nl-BE")} tekens).`;
  }
  return null;
}
