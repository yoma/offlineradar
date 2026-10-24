/**
 * Instagram EventSlide blurb helpers.
 * Keep render text and approval fingerprint on the same sanitized value.
 */

import { ACTIVITY_LABEL } from "@/lib/format";
import type { ActivityId } from "@/types/event";

export type InstagramBlurbSource = {
  shortDescription?: string | null;
  city?: string | null;
  region?: string | null;
  activities?: readonly string[] | null;
};

/**
 * Satori treats newlines poorly in flex text (stacked/overlapping glyphs).
 * Scraped page dumps often ship multiline "Adres / Datum" blocks — reject those.
 */
export function sanitizeInstagramBlurb(raw: string): string | null {
  const original = String(raw ?? "");
  const newlineCount = (original.match(/\r\n|\r|\n/g) ?? []).length;
  const collapsed = original
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) return null;
  if (newlineCount >= 4) return null;
  if (/\bAdres\b/i.test(collapsed)) return null;
  if (/\bDatum\s*&\s*tijd\b/i.test(collapsed)) return null;
  if (/\|\s*available\s*\|/i.test(collapsed) && /https?:\/\//i.test(collapsed)) {
    return null;
  }
  return collapsed.length > 140 ? `${collapsed.slice(0, 137)}…` : collapsed;
}

function locationLine(source: InstagramBlurbSource): string {
  const city = String(source.city ?? "").trim();
  const region = String(source.region ?? "").trim();
  if (!region) return city;
  if (region.toLowerCase() === city.toLowerCase()) return city;
  if (/brussel|bruxelles/i.test(city) && /brussel|bruxelles/i.test(region)) {
    return city;
  }
  return city;
}

function activityText(source: InstagramBlurbSource): string | null {
  const id = source.activities?.[0] as ActivityId | undefined;
  if (id && ACTIVITY_LABEL[id]) return ACTIVITY_LABEL[id];
  return null;
}

export function fallbackInstagramBlurb(source: InstagramBlurbSource): string {
  const act = activityText(source);
  const city = locationLine(source);
  if (act && city) {
    return `Ontmoet andere singles tijdens deze ${act.toLowerCase()} in ${city}.`;
  }
  return "Ontdek dit singles-event via DateOfflineHub.";
}

/** Exact blurb string shown on EventSlide (and bound into content fingerprint). */
export function effectiveInstagramBlurb(source: InstagramBlurbSource): string {
  return (
    sanitizeInstagramBlurb(source.shortDescription || "") ??
    fallbackInstagramBlurb(source)
  );
}
