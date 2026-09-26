/**
 * Canonical event catalog Neon store (Phase 1).
 * Server-side only. Does not touch tips tables or public feed loaders.
 */

import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import type {
  AttachImageInput,
  AttachSourceInput,
  CreateEditionInput,
  CreateOrganizerInput,
  CreateSeriesInput,
  EventEditionBundle,
  EventEditionRecord,
  EventImageRecord,
  EventImageType,
  EventPublicationStatus,
  EventSeriesRecord,
  EventSourceRecord,
  EventSourceType,
  EligibilityRoute,
  OrganizerRecord,
} from "@/types/event-catalog";
import type {
  ActivityId,
  CapacityStatus,
  EligibilityAgeRule,
  EventCategory,
  EventEligibility,
  ParticipantGender,
  SocialSuitability,
} from "@/types/event";

function iso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asActivities(value: unknown): ActivityId[] {
  return asStringArray(value) as ActivityId[];
}

function asGenders(value: unknown): ParticipantGender[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter(
    (item): item is ParticipantGender => item === "man" || item === "woman",
  );
  return list.length ? list : null;
}

type OrganizerRow = {
  id: string;
  slug: string;
  name: string;
  website_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type SeriesRow = {
  id: string;
  organizer_id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type EditionRow = {
  id: string;
  slug: string;
  organizer_id: string | null;
  series_id: string | null;
  title: string;
  starts_at: string | Date;
  ends_at: string | Date | null;
  timezone: string;
  venue_name: string | null;
  address: string | null;
  city: string;
  postal_code: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  eligibility_route: EligibilityRoute;
  singles_oriented: boolean | null;
  singles_only: boolean | null;
  singles_only_evidence: string | null;
  meet_formula: string | null;
  meet_formula_evidence: string | null;
  min_age: number | null;
  max_age: number | null;
  age_rule: EligibilityAgeRule;
  eligibility_json: EventEligibility | null;
  category: EventCategory;
  sub_category: string | null;
  activities: unknown;
  tags: unknown;
  price_amount: string | number | null;
  price_currency: string | null;
  price_note: string | null;
  price_is_from: boolean;
  availability_status: CapacityStatus | null;
  spots_remaining: number | null;
  booking_deadline: string | Date | null;
  availability_note: string | null;
  short_description: string | null;
  description: string | null;
  internal_notes: string | null;
  practical_info: unknown;
  publication_status: EventPublicationStatus;
  approved_at: string | Date | null;
  published_at: string | Date | null;
  rejected_at: string | Date | null;
  expired_at: string | Date | null;
  last_checked_at: string | Date | null;
  source_checked_at: string | Date | null;
  next_check_at: string | Date | null;
  social_suitability: SocialSuitability | null;
  gender_availability: string | null;
  start_time_display_note: string | null;
  known_audience_genders: unknown;
  preferred_audience_age_min: number | null;
  preferred_audience_age_max: number | null;
  audience_age_from_source: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type SourceRow = {
  id: string;
  event_edition_id: string;
  source_type: EventSourceType;
  source_name: string | null;
  url: string;
  normalized_url: string;
  is_primary: boolean;
  checked_at: string | Date | null;
  evidence_note: string | null;
  created_at: string | Date;
};

type ImageRow = {
  id: string;
  event_edition_id: string;
  url_or_path: string;
  image_type: EventImageType;
  source_url: string | null;
  rights_note: string | null;
  is_primary: boolean;
  alt_text: string | null;
  created_at: string | Date;
};

function mapOrganizer(row: OrganizerRow): OrganizerRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    websiteUrl: row.website_url,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapSeries(row: SeriesRow): EventSeriesRecord {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapEdition(row: EditionRow): EventEditionRecord {
  const price =
    row.price_amount == null
      ? null
      : typeof row.price_amount === "number"
        ? row.price_amount
        : Number(row.price_amount);
  return {
    id: row.id,
    slug: row.slug,
    organizerId: row.organizer_id,
    seriesId: row.series_id,
    title: row.title,
    startsAt: iso(row.starts_at)!,
    endsAt: iso(row.ends_at),
    timezone: row.timezone,
    venueName: row.venue_name,
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    region: row.region,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    eligibilityRoute: row.eligibility_route,
    singlesOriented: row.singles_oriented,
    singlesOnly: row.singles_only,
    singlesOnlyEvidence: row.singles_only_evidence,
    meetFormula: row.meet_formula,
    meetFormulaEvidence: row.meet_formula_evidence,
    minAge: row.min_age,
    maxAge: row.max_age,
    ageRule: row.age_rule,
    eligibilityJson: row.eligibility_json ?? null,
    category: row.category,
    subCategory: row.sub_category,
    activities: asActivities(row.activities),
    tags: asStringArray(row.tags),
    priceAmount: Number.isFinite(price as number) ? (price as number) : null,
    priceCurrency: row.price_currency,
    priceNote: row.price_note,
    priceIsFrom: row.price_is_from === true,
    availabilityStatus: row.availability_status,
    spotsRemaining: row.spots_remaining,
    bookingDeadline: iso(row.booking_deadline),
    availabilityNote: row.availability_note,
    shortDescription: row.short_description,
    description: row.description,
    internalNotes: row.internal_notes,
    practicalInfo: asStringArray(row.practical_info),
    publicationStatus: row.publication_status,
    approvedAt: iso(row.approved_at),
    publishedAt: iso(row.published_at),
    rejectedAt: iso(row.rejected_at),
    expiredAt: iso(row.expired_at),
    lastCheckedAt: iso(row.last_checked_at),
    sourceCheckedAt: iso(row.source_checked_at),
    nextCheckAt: iso(row.next_check_at),
    socialSuitability: row.social_suitability,
    genderAvailability: row.gender_availability,
    startTimeDisplayNote: row.start_time_display_note,
    knownAudienceGenders: asGenders(row.known_audience_genders),
    preferredAudienceAgeMin: row.preferred_audience_age_min,
    preferredAudienceAgeMax: row.preferred_audience_age_max,
    audienceAgeFromSource: row.audience_age_from_source === true,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapSource(row: SourceRow): EventSourceRecord {
  return {
    id: row.id,
    eventEditionId: row.event_edition_id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    url: row.url,
    normalizedUrl: row.normalized_url,
    isPrimary: row.is_primary === true,
    checkedAt: iso(row.checked_at),
    evidenceNote: row.evidence_note,
    createdAt: iso(row.created_at)!,
  };
}

function mapImage(row: ImageRow): EventImageRecord {
  return {
    id: row.id,
    eventEditionId: row.event_edition_id,
    urlOrPath: row.url_or_path,
    imageType: row.image_type,
    sourceUrl: row.source_url,
    rightsNote: row.rights_note,
    isPrimary: row.is_primary === true,
    altText: row.alt_text,
    createdAt: iso(row.created_at)!,
  };
}

async function loadBundle(editionId: string): Promise<EventEditionBundle | null> {
  const sql = getEventsSql();
  if (!sql) return null;

  const editionRows = (await sql`
    SELECT * FROM event_editions WHERE id = ${editionId} LIMIT 1
  `) as EditionRow[];
  if (editionRows.length === 0) return null;
  const edition = mapEdition(editionRows[0]);

  let organizer: OrganizerRecord | null = null;
  if (edition.organizerId) {
    const rows = (await sql`
      SELECT * FROM organizers WHERE id = ${edition.organizerId} LIMIT 1
    `) as OrganizerRow[];
    organizer = rows[0] ? mapOrganizer(rows[0]) : null;
  }

  let series: EventSeriesRecord | null = null;
  if (edition.seriesId) {
    const rows = (await sql`
      SELECT * FROM event_series WHERE id = ${edition.seriesId} LIMIT 1
    `) as SeriesRow[];
    series = rows[0] ? mapSeries(rows[0]) : null;
  }

  const sourceRows = (await sql`
    SELECT * FROM event_sources
    WHERE event_edition_id = ${editionId}
    ORDER BY is_primary DESC, created_at ASC
  `) as SourceRow[];

  const imageRows = (await sql`
    SELECT * FROM event_images
    WHERE event_edition_id = ${editionId}
    ORDER BY is_primary DESC, created_at ASC
  `) as ImageRow[];

  return {
    edition,
    organizer,
    series,
    sources: sourceRows.map(mapSource),
    images: imageRows.map(mapImage),
  };
}

export async function createOrganizer(
  input: CreateOrganizerInput,
): Promise<OrganizerRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO organizers (id, slug, name, website_url)
    VALUES (
      ${id},
      ${input.slug},
      ${input.name},
      ${input.websiteUrl ?? null}
    )
    RETURNING *
  `) as OrganizerRow[];
  return rows[0] ? mapOrganizer(rows[0]) : null;
}

export async function getOrganizerById(
  id: string,
): Promise<OrganizerRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM organizers WHERE id = ${id} LIMIT 1
  `) as OrganizerRow[];
  return rows[0] ? mapOrganizer(rows[0]) : null;
}

export async function createSeries(
  input: CreateSeriesInput,
): Promise<EventSeriesRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO event_series (id, organizer_id, slug, name, description)
    VALUES (
      ${id},
      ${input.organizerId},
      ${input.slug},
      ${input.name},
      ${input.description ?? null}
    )
    RETURNING *
  `) as SeriesRow[];
  return rows[0] ? mapSeries(rows[0]) : null;
}

export async function getSeriesById(
  id: string,
): Promise<EventSeriesRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM event_series WHERE id = ${id} LIMIT 1
  `) as SeriesRow[];
  return rows[0] ? mapSeries(rows[0]) : null;
}

export async function createEdition(
  input: CreateEditionInput,
): Promise<EventEditionRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;

  const publicationStatus = input.publicationStatus ?? "candidate";
  if (publicationStatus === "published" && !input.publishedAt) {
    throw new Error("published editions require publishedAt");
  }

  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO event_editions (
      id, slug, organizer_id, series_id, title,
      starts_at, ends_at, timezone,
      venue_name, address, city, postal_code, region, country,
      latitude, longitude,
      eligibility_route, singles_oriented, singles_only,
      singles_only_evidence, meet_formula, meet_formula_evidence,
      min_age, max_age, age_rule, eligibility_json,
      category, sub_category, activities, tags,
      price_amount, price_currency, price_note, price_is_from,
      availability_status, spots_remaining, booking_deadline, availability_note,
      short_description, description, internal_notes, practical_info,
      publication_status, approved_at, published_at, rejected_at, expired_at,
      last_checked_at, source_checked_at, next_check_at,
      social_suitability, gender_availability, start_time_display_note,
      known_audience_genders, preferred_audience_age_min, preferred_audience_age_max,
      audience_age_from_source
    ) VALUES (
      ${id},
      ${input.slug},
      ${input.organizerId ?? null},
      ${input.seriesId ?? null},
      ${input.title},
      ${input.startsAt},
      ${input.endsAt ?? null},
      ${input.timezone ?? "Europe/Brussels"},
      ${input.venueName ?? null},
      ${input.address ?? null},
      ${input.city},
      ${input.postalCode ?? null},
      ${input.region ?? null},
      ${input.country ?? "BE"},
      ${input.latitude ?? null},
      ${input.longitude ?? null},
      ${input.eligibilityRoute ?? "unknown"},
      ${input.singlesOriented ?? null},
      ${input.singlesOnly ?? null},
      ${input.singlesOnlyEvidence ?? null},
      ${input.meetFormula ?? null},
      ${input.meetFormulaEvidence ?? null},
      ${input.minAge ?? null},
      ${input.maxAge ?? null},
      ${input.ageRule ?? "unknown"},
      ${input.eligibilityJson ? JSON.stringify(input.eligibilityJson) : null},
      ${input.category ?? "dating"},
      ${input.subCategory ?? null},
      ${JSON.stringify(input.activities ?? [])},
      ${JSON.stringify(input.tags ?? [])},
      ${input.priceAmount ?? null},
      ${input.priceCurrency ?? "EUR"},
      ${input.priceNote ?? null},
      ${input.priceIsFrom ?? false},
      ${input.availabilityStatus ?? null},
      ${input.spotsRemaining ?? null},
      ${input.bookingDeadline ?? null},
      ${input.availabilityNote ?? null},
      ${input.shortDescription ?? null},
      ${input.description ?? null},
      ${input.internalNotes ?? null},
      ${JSON.stringify(input.practicalInfo ?? [])},
      ${publicationStatus},
      ${input.approvedAt ?? null},
      ${input.publishedAt ?? null},
      ${input.rejectedAt ?? null},
      ${input.expiredAt ?? null},
      ${input.lastCheckedAt ?? null},
      ${input.sourceCheckedAt ?? null},
      ${input.nextCheckAt ?? null},
      ${input.socialSuitability ?? null},
      ${input.genderAvailability ?? null},
      ${input.startTimeDisplayNote ?? null},
      ${input.knownAudienceGenders ? JSON.stringify(input.knownAudienceGenders) : null},
      ${input.preferredAudienceAgeMin ?? null},
      ${input.preferredAudienceAgeMax ?? null},
      ${input.audienceAgeFromSource ?? false}
    )
    RETURNING *
  `) as EditionRow[];
  return rows[0] ? mapEdition(rows[0]) : null;
}

export async function updateEditionPublication(input: {
  id: string;
  publicationStatus: EventPublicationStatus;
  publishedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  expiredAt?: string | null;
}): Promise<EventEditionRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  if (input.publicationStatus === "published" && !input.publishedAt) {
    throw new Error("published editions require publishedAt");
  }
  const rows = (await sql`
    UPDATE event_editions
    SET
      publication_status = ${input.publicationStatus},
      published_at = ${input.publishedAt ?? null},
      approved_at = COALESCE(${input.approvedAt ?? null}, approved_at),
      rejected_at = ${input.rejectedAt ?? null},
      expired_at = ${input.expiredAt ?? null},
      updated_at = now()
    WHERE id = ${input.id}
    RETURNING *
  `) as EditionRow[];
  return rows[0] ? mapEdition(rows[0]) : null;
}

export async function getEditionById(
  id: string,
): Promise<EventEditionBundle | null> {
  return loadBundle(id);
}

export async function getEditionBySlug(
  slug: string,
): Promise<EventEditionBundle | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT id FROM event_editions WHERE slug = ${slug} LIMIT 1
  `) as { id: string }[];
  if (!rows[0]) return null;
  return loadBundle(rows[0].id);
}

export async function listEditions(limit = 100): Promise<EventEditionRecord[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT * FROM event_editions
    ORDER BY starts_at ASC
    LIMIT ${limit}
  `) as EditionRow[];
  return rows.map(mapEdition);
}

/**
 * Public-feed candidate query. ONLY publication_status = published.
 * approved / draft / candidate are never returned here.
 */
export async function listPublishedEditions(
  limit = 100,
): Promise<EventEditionRecord[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT * FROM event_editions
    WHERE publication_status = 'published'
    ORDER BY starts_at ASC
    LIMIT ${limit}
  `) as EditionRow[];
  return rows.map(mapEdition);
}

export async function attachSource(
  input: AttachSourceInput,
): Promise<EventSourceRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;

  if (input.isPrimary) {
    await sql`
      UPDATE event_sources
      SET is_primary = false
      WHERE event_edition_id = ${input.eventEditionId}
        AND is_primary = true
    `;
  }

  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO event_sources (
      id, event_edition_id, source_type, source_name, url, normalized_url,
      is_primary, checked_at, evidence_note
    ) VALUES (
      ${id},
      ${input.eventEditionId},
      ${input.sourceType},
      ${input.sourceName ?? null},
      ${input.url},
      ${input.normalizedUrl},
      ${input.isPrimary ?? false},
      ${input.checkedAt ?? null},
      ${input.evidenceNote ?? null}
    )
    ON CONFLICT (event_edition_id, normalized_url) DO UPDATE SET
      source_type = EXCLUDED.source_type,
      source_name = EXCLUDED.source_name,
      url = EXCLUDED.url,
      is_primary = EXCLUDED.is_primary,
      checked_at = EXCLUDED.checked_at,
      evidence_note = EXCLUDED.evidence_note
    RETURNING *
  `) as SourceRow[];
  return rows[0] ? mapSource(rows[0]) : null;
}

export async function attachImage(
  input: AttachImageInput,
): Promise<EventImageRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;

  if (input.isPrimary) {
    await sql`
      UPDATE event_images
      SET is_primary = false
      WHERE event_edition_id = ${input.eventEditionId}
        AND is_primary = true
    `;
  }

  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO event_images (
      id, event_edition_id, url_or_path, image_type, source_url,
      rights_note, is_primary, alt_text
    ) VALUES (
      ${id},
      ${input.eventEditionId},
      ${input.urlOrPath},
      ${input.imageType},
      ${input.sourceUrl ?? null},
      ${input.rightsNote ?? null},
      ${input.isPrimary ?? false},
      ${input.altText ?? null}
    )
    RETURNING *
  `) as ImageRow[];
  return rows[0] ? mapImage(rows[0]) : null;
}

export async function deleteEditionHard(id: string): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  const rows = (await sql`
    DELETE FROM event_editions WHERE id = ${id} RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function deleteOrganizerHard(id: string): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  const rows = (await sql`
    DELETE FROM organizers WHERE id = ${id} RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}
