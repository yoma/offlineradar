import type {
  NormalizedCandidate,
  OccurrenceStatus,
  RawCandidate,
  RegionScope,
} from "@/types/screening";

/**
 * Districts / municipalities treated as the Antwerp pilot region.
 * Antwerp city districts count as in scope; separate municipalities do not.
 * NOTE: this is the deliberately narrow PILOT region, not OfflineRadar's
 * eventual distance/travel-time radius (which would be wider).
 */
const ANTWERP_SCOPE = new Set([
  "antwerpen",
  "antwerp",
  "borgerhout",
  "berchem",
  "deurne",
  "hoboken",
  "wilrijk",
  "merksem",
  "ekeren",
  "berendrecht",
  "zandvliet",
  "lillo",
]);

function normalizeCity(city: string | null): string | null {
  if (!city) return null;
  const trimmed = city.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function regionScope(city: string | null): RegionScope {
  if (!city) return "unknown";
  const key = city.trim().toLowerCase();
  if (ANTWERP_SCOPE.has(key)) return "in_scope";
  return "out_of_scope";
}

/** Infer how the occurrence is established when the source did not label it. */
function inferOccurrenceStatus(raw: RawCandidate): OccurrenceStatus {
  if (raw.occurrenceStatus) return raw.occurrenceStatus;
  if (raw.statedStartDate) return "announced_edition";
  if (raw.signals.recurring === true) return "derived_from_schedule";
  return "community_no_next";
}

/**
 * Raw source facts -> structured candidate.
 * Never invents facts: unknown age/gender/end time stay unknown.
 */
export function normalizeCandidate(raw: RawCandidate): NormalizedCandidate {
  const city = normalizeCity(raw.statedCity);

  // Age rule stays "unknown" when no bounds are stated; never widen to all ages.
  const hasBounds = raw.statedAgeMin != null || raw.statedAgeMax != null;
  const ageRule = hasBounds ? raw.statedAgeRule : "unknown";

  return {
    id: raw.id,
    provenance: raw.provenance,
    title: raw.statedTitle.trim(),
    startDate: raw.statedStartDate,
    startTime: raw.statedStartTime,
    endTime: raw.statedEndTime,
    city,
    region: regionScope(city),
    venue: raw.statedVenue,
    organizer: raw.statedOrganizer,
    ageMin: raw.statedAgeMin,
    ageMax: raw.statedAgeMax,
    ageRule,
    price: raw.priceKnown ? raw.statedPrice : null,
    priceKnown: raw.priceKnown,
    signals: raw.signals,
    occurrenceStatus: inferOccurrenceStatus(raw),
    restrictedAudience: raw.restrictedAudience ?? null,
    uncertainties: [...raw.uncertainties],
  };
}

export function normalizeAll(raws: RawCandidate[]): NormalizedCandidate[] {
  return raws.map(normalizeCandidate);
}
