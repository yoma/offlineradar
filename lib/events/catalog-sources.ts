/**
 * Catalog Source Map store (canonical). Separate from tip source_watchlist.
 */
import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";

export const CATALOG_SOURCE_STATUSES = [
  "active",
  "promising",
  "low_yield",
  "inactive",
] as const;
export type CatalogSourceStatus = (typeof CATALOG_SOURCE_STATUSES)[number];

export const CATALOG_SOURCE_KINDS = [
  "organizer_source",
  "discovery_platform",
  "other",
] as const;
export type CatalogSourceKind = (typeof CATALOG_SOURCE_KINDS)[number];

export const CATALOG_SOURCE_TYPES = [
  "organizer",
  "ticket_platform",
  "event_series",
  "community",
  "venue_with_singles_program",
  "discovery_platform",
  "other",
] as const;
export type CatalogSourceType = (typeof CATALOG_SOURCE_TYPES)[number];

export type CatalogSourceRecord = {
  id: string;
  organizerId: string | null;
  name: string;
  officialUrl: string;
  normalizedUrl: string;
  sourceKind: CatalogSourceKind;
  sourceType: CatalogSourceType;
  regions: string[];
  formats: string[];
  status: CatalogSourceStatus;
  lastCheckedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  editionCount?: number;
};

export type UpsertCatalogSourceInput = {
  name: string;
  officialUrl: string;
  organizerId?: string | null;
  sourceKind?: CatalogSourceKind;
  sourceType?: CatalogSourceType;
  regions?: string[];
  formats?: string[];
  status?: CatalogSourceStatus;
  lastCheckedAt?: string | null;
  notes?: string | null;
};

type Row = {
  id: string;
  organizer_id: string | null;
  name: string;
  official_url: string;
  normalized_url: string;
  source_kind: CatalogSourceKind;
  source_type: CatalogSourceType;
  regions: string[] | null;
  formats: string[] | null;
  status: CatalogSourceStatus;
  last_checked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  edition_count?: number | string | null;
};

export function normalizeCatalogSourceUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

function mapRow(row: Row): CatalogSourceRecord {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    name: row.name,
    officialUrl: row.official_url,
    normalizedUrl: row.normalized_url,
    sourceKind: row.source_kind,
    sourceType: row.source_type,
    regions: row.regions ?? [],
    formats: row.formats ?? [],
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editionCount:
      row.edition_count == null ? undefined : Number(row.edition_count),
  };
}

export async function upsertCatalogSourceByUrl(
  input: UpsertCatalogSourceInput,
): Promise<{ record: CatalogSourceRecord; created: boolean } | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const normalized = normalizeCatalogSourceUrl(input.officialUrl);
  const existing = (await sql`
    SELECT * FROM catalog_sources WHERE normalized_url = ${normalized} LIMIT 1
  `) as Row[];

  if (existing[0]) {
    const rows = (await sql`
      UPDATE catalog_sources SET
        organizer_id = COALESCE(${input.organizerId ?? null}, organizer_id),
        name = ${input.name},
        official_url = ${input.officialUrl.trim()},
        source_kind = ${input.sourceKind ?? existing[0].source_kind},
        source_type = ${input.sourceType ?? existing[0].source_type},
        regions = ${input.regions ?? existing[0].regions ?? []},
        formats = ${input.formats ?? existing[0].formats ?? []},
        status = ${input.status ?? existing[0].status},
        last_checked_at = COALESCE(${input.lastCheckedAt ?? null}, last_checked_at),
        notes = COALESCE(${input.notes ?? null}, notes),
        updated_at = now()
      WHERE id = ${existing[0].id}
      RETURNING *
    `) as Row[];
    return rows[0] ? { record: mapRow(rows[0]), created: false } : null;
  }

  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO catalog_sources (
      id, organizer_id, name, official_url, normalized_url,
      source_kind, source_type, regions, formats, status,
      last_checked_at, notes
    ) VALUES (
      ${id},
      ${input.organizerId ?? null},
      ${input.name},
      ${input.officialUrl.trim()},
      ${normalized},
      ${input.sourceKind ?? "organizer_source"},
      ${input.sourceType ?? "organizer"},
      ${input.regions ?? []},
      ${input.formats ?? []},
      ${input.status ?? "promising"},
      ${input.lastCheckedAt ?? null},
      ${input.notes ?? null}
    )
    RETURNING *
  `) as Row[];
  return rows[0] ? { record: mapRow(rows[0]), created: true } : null;
}

export async function listCatalogSources(): Promise<CatalogSourceRecord[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT
      cs.*,
      (
        SELECT count(*)::int
        FROM event_editions e
        WHERE e.organizer_id IS NOT NULL
          AND e.organizer_id = cs.organizer_id
      ) AS edition_count
    FROM catalog_sources cs
    ORDER BY
      CASE cs.status
        WHEN 'active' THEN 0
        WHEN 'promising' THEN 1
        WHEN 'low_yield' THEN 2
        ELSE 3
      END,
      cs.name ASC
  `) as Row[];
  return rows.map(mapRow);
}

export async function updateCatalogSourceFields(input: {
  id: string;
  status?: CatalogSourceStatus;
  notes?: string | null;
  touchChecked?: boolean;
}): Promise<CatalogSourceRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const now = input.touchChecked ? new Date().toISOString() : null;
  const rows = (await sql`
    UPDATE catalog_sources SET
      status = COALESCE(${input.status ?? null}, status),
      notes = COALESCE(${input.notes ?? null}, notes),
      last_checked_at = COALESCE(${now}, last_checked_at),
      updated_at = now()
    WHERE id = ${input.id}
    RETURNING *
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}
