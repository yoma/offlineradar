/**
 * Neon store for source refresh runs + review items.
 */
import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import type {
  RefreshNormalizedCandidate,
  RefreshParserKey,
  SourceRefreshDetectionType,
  SourceRefreshItemRecord,
  SourceRefreshItemStatus,
  SourceRefreshMatchConfidence,
  SourceRefreshRunRecord,
  SourceRefreshRunStatus,
  RefreshFieldChange,
} from "@/lib/source-refresh/types";

type RunRow = {
  id: string;
  catalog_source_id: string;
  status: SourceRefreshRunStatus;
  started_at: string | Date;
  completed_at: string | Date | null;
  fetched_url: string | null;
  http_status: number | null;
  fetch_state: string | null;
  parser_key: string;
  parser_version: string;
  candidate_count: number;
  new_count: number;
  unchanged_count: number;
  changed_count: number;
  removed_count: number;
  error: string | null;
  triggered_by: string | null;
  created_at: string | Date;
};

type ItemRow = {
  id: string;
  refresh_run_id: string;
  catalog_source_id: string;
  detected_external_key: string;
  normalized_url: string | null;
  detected_title: string | null;
  detected_start: string | Date | null;
  detected_location: string | null;
  detected_min_age: number | null;
  detected_max_age: number | null;
  detected_age_rule: string | null;
  detected_price: string | number | null;
  detected_availability: string | null;
  detected_source_url: string | null;
  match_event_edition_id: string | null;
  detection_type: SourceRefreshDetectionType;
  match_confidence: SourceRefreshMatchConfidence | null;
  change_summary: RefreshFieldChange[] | null;
  proposed_data: RefreshNormalizedCandidate | Record<string, unknown>;
  status: SourceRefreshItemStatus;
  created_at: string | Date;
  reviewed_at: string | Date | null;
  reviewed_by: string | null;
};

function iso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapRun(row: RunRow): SourceRefreshRunRecord {
  return {
    id: row.id,
    catalogSourceId: row.catalog_source_id,
    status: row.status,
    startedAt: iso(row.started_at)!,
    completedAt: iso(row.completed_at),
    fetchedUrl: row.fetched_url,
    httpStatus: row.http_status,
    fetchState: row.fetch_state,
    parserKey: row.parser_key,
    parserVersion: row.parser_version,
    candidateCount: Number(row.candidate_count),
    newCount: Number(row.new_count),
    unchangedCount: Number(row.unchanged_count),
    changedCount: Number(row.changed_count),
    removedCount: Number(row.removed_count),
    error: row.error,
    triggeredBy: row.triggered_by,
    createdAt: iso(row.created_at)!,
  };
}

function mapItem(row: ItemRow): SourceRefreshItemRecord {
  return {
    id: row.id,
    refreshRunId: row.refresh_run_id,
    catalogSourceId: row.catalog_source_id,
    detectedExternalKey: row.detected_external_key,
    normalizedUrl: row.normalized_url,
    detectedTitle: row.detected_title,
    detectedStart: iso(row.detected_start),
    detectedLocation: row.detected_location,
    detectedMinAge: row.detected_min_age,
    detectedMaxAge: row.detected_max_age,
    detectedAgeRule: row.detected_age_rule,
    detectedPrice:
      row.detected_price == null ? null : Number(row.detected_price),
    detectedAvailability: row.detected_availability,
    detectedSourceUrl: row.detected_source_url,
    matchEventEditionId: row.match_event_edition_id,
    detectionType: row.detection_type,
    matchConfidence: row.match_confidence,
    changeSummary: row.change_summary,
    proposedData: row.proposed_data,
    status: row.status,
    createdAt: iso(row.created_at)!,
    reviewedAt: iso(row.reviewed_at),
    reviewedBy: row.reviewed_by,
  };
}

export async function getActiveRefreshRun(
  catalogSourceId: string,
): Promise<SourceRefreshRunRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM source_refresh_runs
    WHERE catalog_source_id = ${catalogSourceId}
      AND status IN ('pending', 'running')
    ORDER BY started_at DESC
    LIMIT 1
  `) as RunRow[];
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function getLatestRefreshRun(
  catalogSourceId: string,
): Promise<SourceRefreshRunRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM source_refresh_runs
    WHERE catalog_source_id = ${catalogSourceId}
    ORDER BY started_at DESC
    LIMIT 1
  `) as RunRow[];
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function listLatestRunsBySourceIds(
  sourceIds: string[],
): Promise<Map<string, SourceRefreshRunRecord>> {
  const map = new Map<string, SourceRefreshRunRecord>();
  if (sourceIds.length === 0) return map;
  const sql = getEventsSql();
  if (!sql) return map;
  for (const id of sourceIds) {
    const latest = await getLatestRefreshRun(id);
    if (latest) map.set(id, latest);
  }
  return map;
}

export async function createRefreshRun(input: {
  catalogSourceId: string;
  parserKey: RefreshParserKey | string;
  parserVersion: string;
  triggeredBy: string | null;
}): Promise<SourceRefreshRunRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO source_refresh_runs (
      id, catalog_source_id, status, parser_key, parser_version, triggered_by
    ) VALUES (
      ${id},
      ${input.catalogSourceId},
      'running',
      ${input.parserKey},
      ${input.parserVersion},
      ${input.triggeredBy}
    )
    RETURNING *
  `) as RunRow[];
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function completeRefreshRun(input: {
  id: string;
  status: SourceRefreshRunStatus;
  fetchedUrl?: string | null;
  httpStatus?: number | null;
  fetchState?: string | null;
  candidateCount?: number;
  newCount?: number;
  unchangedCount?: number;
  changedCount?: number;
  removedCount?: number;
  error?: string | null;
}): Promise<SourceRefreshRunRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    UPDATE source_refresh_runs SET
      status = ${input.status},
      completed_at = now(),
      fetched_url = COALESCE(${input.fetchedUrl ?? null}, fetched_url),
      http_status = COALESCE(${input.httpStatus ?? null}, http_status),
      fetch_state = COALESCE(${input.fetchState ?? null}, fetch_state),
      candidate_count = COALESCE(${input.candidateCount ?? null}, candidate_count),
      new_count = COALESCE(${input.newCount ?? null}, new_count),
      unchanged_count = COALESCE(${input.unchangedCount ?? null}, unchanged_count),
      changed_count = COALESCE(${input.changedCount ?? null}, changed_count),
      removed_count = COALESCE(${input.removedCount ?? null}, removed_count),
      error = ${input.error ?? null}
    WHERE id = ${input.id}
    RETURNING *
  `) as RunRow[];
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function insertRefreshItem(input: {
  refreshRunId: string;
  catalogSourceId: string;
  candidate?: RefreshNormalizedCandidate | null;
  detectionType: SourceRefreshDetectionType;
  matchEventEditionId?: string | null;
  matchConfidence?: SourceRefreshMatchConfidence | null;
  changeSummary?: RefreshFieldChange[] | null;
  status?: SourceRefreshItemStatus;
  /** For possibly_removed without a candidate payload */
  removedEditionTitle?: string | null;
  removedEditionStart?: string | null;
  removedExternalKey?: string | null;
}): Promise<SourceRefreshItemRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const id = randomUUID();
  const c = input.candidate;
  const rows = (await sql`
    INSERT INTO source_refresh_items (
      id, refresh_run_id, catalog_source_id,
      detected_external_key, normalized_url, detected_title, detected_start,
      detected_location, detected_min_age, detected_max_age, detected_age_rule,
      detected_price, detected_availability, detected_source_url,
      match_event_edition_id, detection_type, match_confidence,
      change_summary, proposed_data, status
    ) VALUES (
      ${id},
      ${input.refreshRunId},
      ${input.catalogSourceId},
      ${c?.externalKey ?? input.removedExternalKey ?? "unknown"},
      ${c ? c.officialUrl.toLowerCase().replace(/\/$/, "") : null},
      ${c?.title ?? input.removedEditionTitle ?? null},
      ${c?.startsAt ?? input.removedEditionStart ?? null},
      ${c ? [c.venue, c.city].filter(Boolean).join(", ") : null},
      ${c?.minAge ?? null},
      ${c?.maxAge ?? null},
      ${c?.ageRule ?? null},
      ${c?.price ?? null},
      ${c?.availability ?? null},
      ${c?.officialUrl ?? null},
      ${input.matchEventEditionId ?? null},
      ${input.detectionType},
      ${input.matchConfidence ?? null},
      ${JSON.stringify(input.changeSummary ?? [])},
      ${JSON.stringify(c ?? {})},
      ${input.status ?? (input.detectionType === "existing_unchanged" ? "ignored" : "needs_review")}
    )
    RETURNING *
  `) as ItemRow[];
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function listRefreshItemsForRun(
  refreshRunId: string,
): Promise<SourceRefreshItemRecord[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT * FROM source_refresh_items
    WHERE refresh_run_id = ${refreshRunId}
    ORDER BY
      CASE detection_type
        WHEN 'existing_changed' THEN 1
        WHEN 'new' THEN 2
        WHEN 'possibly_removed' THEN 3
        ELSE 4
      END,
      detected_start ASC NULLS LAST
  `) as ItemRow[];
  return rows.map(mapItem);
}

export async function getRefreshItem(
  id: string,
): Promise<SourceRefreshItemRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM source_refresh_items WHERE id = ${id} LIMIT 1
  `) as ItemRow[];
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function updateRefreshItemStatus(input: {
  id: string;
  status: SourceRefreshItemStatus;
  reviewedBy: string | null;
}): Promise<SourceRefreshItemRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    UPDATE source_refresh_items SET
      status = ${input.status},
      reviewed_at = now(),
      reviewed_by = ${input.reviewedBy}
    WHERE id = ${input.id}
    RETURNING *
  `) as ItemRow[];
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function touchEditionSourceCheckedAt(
  editionId: string,
  checkedAt: string,
): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  const rows = await sql`
    UPDATE event_editions
    SET source_checked_at = ${checkedAt}, updated_at = now()
    WHERE id = ${editionId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function listFutureEditionsForOrganizerSlug(
  organizerSlug: string,
): Promise<EventEditionBundleLite[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT e.id, e.slug, e.title, e.starts_at, e.city, e.min_age, e.max_age,
           e.price_amount, e.availability_status, e.venue_name,
           e.publication_status, o.slug AS organizer_slug
    FROM event_editions e
    JOIN organizers o ON o.id = e.organizer_id
    WHERE o.slug = ${organizerSlug}
      AND e.starts_at >= now() - interval '1 day'
      AND e.publication_status NOT IN ('rejected', 'cancelled', 'expired')
    ORDER BY e.starts_at ASC
  `) as {
    id: string;
    slug: string;
    title: string;
    starts_at: string | Date;
    city: string;
    min_age: number | null;
    max_age: number | null;
    price_amount: number | null;
    availability_status: string | null;
    venue_name: string | null;
    publication_status: string;
    organizer_slug: string;
  }[];

  const out: EventEditionBundleLite[] = [];
  for (const row of rows) {
    const sources = (await sql`
      SELECT normalized_url, url FROM event_sources
      WHERE event_edition_id = ${row.id}
    `) as { normalized_url: string; url: string }[];
    out.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      startsAt: iso(row.starts_at)!,
      city: row.city,
      minAge: row.min_age,
      maxAge: row.max_age,
      priceAmount: row.price_amount == null ? null : Number(row.price_amount),
      availabilityStatus: row.availability_status,
      venueName: row.venue_name,
      publicationStatus: row.publication_status,
      organizerSlug: row.organizer_slug,
      sourceUrls: sources.map((s) => s.normalized_url || s.url),
    });
  }
  return out;
}

export type EventEditionBundleLite = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  city: string;
  minAge: number | null;
  maxAge: number | null;
  priceAmount: number | null;
  availabilityStatus: string | null;
  venueName: string | null;
  publicationStatus: string;
  organizerSlug: string;
  sourceUrls: string[];
};
