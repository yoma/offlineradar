/**
 * Apply an admin-approved field change from a refresh item onto a canonical edition.
 * Only patches fields explicitly present in change_summary.
 */
import { getEventsSql } from "@/lib/events/db";
import type { RefreshFieldChange } from "@/lib/source-refresh/types";
import type { EventEditionRecord } from "@/types/event-catalog";
import { getEditionById } from "@/lib/events/neon-store";

/** Fields safe to auto-apply in thorough scans (no title/date/city moves). */
export const SAFE_AUTO_APPLY_FIELDS = new Set([
  "availability",
  "genderAvailability",
  "availabilityNote",
  "price",
]);

export function filterSafeAutoApplyChanges(
  changes: RefreshFieldChange[],
): RefreshFieldChange[] {
  return changes.filter((c) => SAFE_AUTO_APPLY_FIELDS.has(c.field));
}

export async function applyRefreshChangesToEdition(input: {
  editionId: string;
  changes: RefreshFieldChange[];
}): Promise<EventEditionRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  if (input.changes.length === 0) {
    const bundle = await getEditionById(input.editionId);
    return bundle?.edition ?? null;
  }

  let startsAt: string | null = null;
  let city: string | null = null;
  let venue: string | null = null;
  let price: number | null = null;
  let availability: string | null = null;
  let genderAvailability: string | null = null;
  let availabilityNote: string | null = null;
  let touchGender = false;
  let touchNote = false;
  let minAge: number | null = null;
  let maxAge: number | null = null;
  let touchAge = false;

  for (const change of input.changes) {
    if (change.field === "startsAt" && typeof change.after === "string") {
      startsAt = change.after;
    }
    if (change.field === "city" && typeof change.after === "string") {
      city = change.after;
    }
    if (change.field === "venue" && typeof change.after === "string") {
      venue = change.after;
    }
    if (change.field === "price" && typeof change.after === "number") {
      price = change.after;
    }
    if (change.field === "availability" && typeof change.after === "string") {
      availability = change.after;
    }
    if (
      change.field === "genderAvailability" &&
      typeof change.after === "string"
    ) {
      touchGender = true;
      genderAvailability = change.after;
    }
    if (
      change.field === "availabilityNote" &&
      typeof change.after === "string"
    ) {
      touchNote = true;
      availabilityNote = change.after;
    }
    if (change.field === "age" && typeof change.after === "string") {
      const m = /^(\d+|\?)-(\d+|\?)$/.exec(change.after);
      if (m) {
        touchAge = true;
        minAge = m[1] === "?" ? null : Number(m[1]);
        maxAge = m[2] === "?" ? null : Number(m[2]);
      }
    }
  }

  const rows = (await sql`
    UPDATE event_editions SET
      starts_at = COALESCE(${startsAt}, starts_at),
      city = COALESCE(${city}, city),
      venue_name = COALESCE(${venue}, venue_name),
      price_amount = COALESCE(${price}, price_amount),
      availability_status = COALESCE(${availability}, availability_status),
      gender_availability = CASE
        WHEN ${touchGender} THEN ${genderAvailability}
        ELSE gender_availability
      END,
      availability_note = CASE
        WHEN ${touchNote} THEN ${availabilityNote}
        ELSE availability_note
      END,
      min_age = CASE WHEN ${touchAge} THEN ${minAge} ELSE min_age END,
      max_age = CASE WHEN ${touchAge} THEN ${maxAge} ELSE max_age END,
      updated_at = now()
    WHERE id = ${input.editionId}
    RETURNING id
  `) as { id: string }[];

  if (!rows[0]) return null;
  const bundle = await getEditionById(input.editionId);
  return bundle?.edition ?? null;
}
