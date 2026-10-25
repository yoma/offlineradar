/**
 * Fill missing facts on an existing edition from a fresh intake draft.
 * Never blanks fields; only adds or replaces placeholders.
 */
import { revalidatePath } from "next/cache";
import { revalidateCatalog } from "@/lib/events";
import { isPlaceholderStartsAt } from "@/lib/aanvoer/admin-status";
import {
  buildIntakeEndsAt,
  buildIntakeStartsAt,
  normalizeIntakeDateToYmd,
} from "@/lib/aanvoer/dates";
import type { IntakeEditableDraft, IntakeMatch } from "@/lib/aanvoer/types";
import { getEventsSql } from "@/lib/events/db";
import { attachSource, getEditionById } from "@/lib/events/neon-store";
import { resolveCoordsForWrite } from "@/lib/geo-cities";
import { normalizeRefreshUrl } from "@/lib/source-refresh/normalize";

function isBlankText(value: string | null | undefined): boolean {
  if (value == null) return true;
  const t = value.trim();
  return !t || /^onbekend$/i.test(t) || /^n\/?a$/i.test(t) || t === "-";
}

function parsePriceAmount(notes: string): number | null {
  const m = notes.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Prefer strong URL / title+date matches; soft title only if unique. */
export function pickEnrichableEditionMatch(
  matches: IntakeMatch[],
): IntakeMatch | null {
  const editions = matches.filter((m) => m.kind === "event_edition");
  if (editions.length === 0) return null;

  const byUrl = editions.find((m) =>
    /Zelfde eventbron-URL/i.test(m.matchReason),
  );
  if (byUrl) return byUrl;

  const byTitleDate = editions.find((m) =>
    /Zelfde titel \+ datum/i.test(m.matchReason),
  );
  if (byTitleDate) return byTitleDate;

  if (
    editions.length === 1 &&
    /Vergelijkbare titel/i.test(editions[0]!.matchReason)
  ) {
    return editions[0]!;
  }
  return null;
}

export type EnrichEditionResult =
  | {
      ok: true;
      editionId: string;
      slug: string;
      publicationStatus: string;
      filledFields: string[];
      message: string;
    }
  | { ok: false; error: string };

export async function enrichEditionFromIntakeDraft(input: {
  editionId: string;
  draft: IntakeEditableDraft;
  sourceUrl?: string | null;
}): Promise<EnrichEditionResult> {
  const sql = getEventsSql();
  if (!sql) return { ok: false, error: "Database niet beschikbaar." };

  const bundle = await getEditionById(input.editionId);
  if (!bundle) return { ok: false, error: "Event niet gevonden." };

  const row = bundle.edition;
  const draft = input.draft;
  const filled: string[] = [];

  const nextTitle =
    isBlankText(row.title) && draft.title.trim()
      ? draft.title.trim()
      : row.title;
  if (nextTitle !== row.title) filled.push("titel");

  const draftCity = draft.city.trim();
  const nextCity =
    (isBlankText(row.city) || /^onbekend$/i.test(row.city)) && draftCity
      ? draftCity
      : row.city;
  if (nextCity !== row.city) filled.push("plaats");

  const draftVenue = draft.venue.trim();
  const nextVenue =
    isBlankText(row.venueName) && draftVenue ? draftVenue : row.venueName;
  if (nextVenue !== row.venueName) filled.push("locatie");

  const draftAddress = draft.location.trim();
  const nextAddress =
    isBlankText(row.address) && draftAddress ? draftAddress : row.address;
  if (nextAddress !== row.address) filled.push("adres");

  const builtStart = buildIntakeStartsAt({
    startDate: draft.startDate,
    startTime: draft.startTime,
  });
  let nextStartsAt = row.startsAt;
  if (builtStart && isPlaceholderStartsAt(row.startsAt)) {
    nextStartsAt = builtStart.startsAt;
    filled.push("datum");
  } else if (
    builtStart &&
    draft.startTime &&
    /^\d{2}:\d{2}/.test(draft.startTime) &&
    !isPlaceholderStartsAt(row.startsAt)
  ) {
    // Keep calendar day; fill missing clock time when stored as noon placeholder.
    const existingDay = String(row.startsAt).slice(0, 10);
    const draftDay = normalizeIntakeDateToYmd(draft.startDate);
    if (draftDay === existingDay && /T12:00:00/.test(String(row.startsAt))) {
      nextStartsAt = builtStart.startsAt;
      filled.push("starttijd");
    }
  }

  const builtEnd = buildIntakeEndsAt({
    startDate: draft.startDate || String(row.startsAt).slice(0, 10),
    startTime: draft.startTime,
    endTime: draft.endTime,
  });
  let nextEndsAt = row.endsAt;
  if (!row.endsAt && builtEnd) {
    nextEndsAt = builtEnd;
    filled.push("eindtijd");
  }

  const draftPrice = draft.priceNotes.trim();
  let nextPriceNote = row.priceNote;
  let nextPriceAmount = row.priceAmount;
  if (isBlankText(row.priceNote) && draftPrice) {
    nextPriceNote = draftPrice;
    filled.push("prijs");
    if (row.priceAmount == null) {
      nextPriceAmount = parsePriceAmount(draftPrice);
    }
  } else if (row.priceAmount == null && draftPrice) {
    const amount = parsePriceAmount(draftPrice);
    if (amount != null) {
      nextPriceAmount = amount;
      filled.push("prijs");
    }
  }

  const draftAvail = draft.availability.trim();
  const nextAvailNote =
    isBlankText(row.availabilityNote) && draftAvail
      ? draftAvail
      : row.availabilityNote;
  if (nextAvailNote !== row.availabilityNote) filled.push("beschikbaarheid");

  let nextRoute = row.eligibilityRoute;
  let nextSinglesOriented = row.singlesOriented;
  let nextSinglesOnly = row.singlesOnly;
  if (
    (row.eligibilityRoute === "unknown" || !row.eligibilityRoute) &&
    (draft.routeAdvice === "route_a" || draft.routeAdvice === "route_b")
  ) {
    nextRoute = draft.routeAdvice;
    filled.push("route");
  }
  if (row.singlesOriented == null && draft.singlesOriented === "true") {
    nextSinglesOriented = true;
    filled.push("singlesgericht");
  }
  if (row.singlesOnly == null && draft.singlesOnly === "true") {
    nextSinglesOnly = true;
    filled.push("singles-only");
  }

  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === "string")
    : [];
  const dateKnown = !isPlaceholderStartsAt(nextStartsAt);
  const nextTags = dateKnown
    ? tags.filter((t) => t !== "date_unknown")
    : tags;

  const geo = resolveCoordsForWrite({
    latitude: row.latitude,
    longitude: row.longitude,
    city: nextCity,
  });

  const stamp = [
    `enriched_from_intake_at=${new Date().toISOString()}`,
    filled.length
      ? `enriched_fields=${filled.join(",")}`
      : "enriched_fields=none",
    input.sourceUrl ? `enriched_source_url=${input.sourceUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const nextNotes = `${row.internalNotes ?? ""}\n${stamp}`.trim();

  if (filled.length === 0) {
    // Still attach source URL if missing.
    const sourceUrl = (input.sourceUrl || draft.sourceUrl).trim();
    if (sourceUrl) {
      await attachSourceIfUseful({
        editionId: row.id,
        url: sourceUrl,
        hasPrimary: bundle.sources.some((s) => s.isPrimary),
      });
    }
    return {
      ok: true,
      editionId: row.id,
      slug: row.slug,
      publicationStatus: row.publicationStatus,
      filledFields: [],
      message: "Event bestond al; geen nieuwe velden om aan te vullen.",
    };
  }

  try {
    await sql`
      UPDATE event_editions SET
        title = ${nextTitle},
        city = ${nextCity},
        venue_name = ${nextVenue},
        address = ${nextAddress},
        starts_at = ${nextStartsAt}::timestamptz,
        ends_at = ${nextEndsAt}::timestamptz,
        latitude = ${geo.latitude},
        longitude = ${geo.longitude},
        price_note = ${nextPriceNote},
        price_amount = ${nextPriceAmount},
        availability_note = ${nextAvailNote},
        eligibility_route = ${nextRoute},
        singles_oriented = ${nextSinglesOriented},
        singles_only = ${nextSinglesOnly},
        tags = ${JSON.stringify(nextTags)}::jsonb,
        internal_notes = ${nextNotes},
        updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Bijwerken mislukt: ${error.message}`
          : "Bijwerken mislukt.",
    };
  }

  const sourceUrl = (input.sourceUrl || draft.sourceUrl).trim();
  if (sourceUrl) {
    await attachSourceIfUseful({
      editionId: row.id,
      url: sourceUrl,
      hasPrimary: bundle.sources.some((s) => s.isPrimary),
    });
  }

  revalidatePath("/ontdek");
  revalidateCatalog();
  revalidatePath(`/event/${row.slug}`);
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  revalidatePath("/interne-preview");

  return {
    ok: true,
    editionId: row.id,
    slug: row.slug,
    publicationStatus: row.publicationStatus,
    filledFields: filled,
    message: `Bestaand event bijgewerkt met: ${filled.join(", ")}.`,
  };
}

async function attachSourceIfUseful(input: {
  editionId: string;
  url: string;
  hasPrimary: boolean;
}): Promise<void> {
  if (!/^https?:\/\//i.test(input.url)) return;
  try {
    let host = "bron";
    try {
      host = new URL(input.url).hostname.replace(/^www\./, "");
    } catch {
      /* keep */
    }
    await attachSource({
      eventEditionId: input.editionId,
      sourceType: "other",
      sourceName: host,
      url: input.url,
      normalizedUrl: normalizeRefreshUrl(input.url),
      isPrimary: !input.hasPrimary,
      checkedAt: new Date().toISOString(),
      evidenceNote: "URL uit Assistent/intake enrich",
    });
  } catch (error) {
    console.error("[enrich-edition] attachSource failed", error);
  }
}
