/**
 * Batched data for /interne-aanvoer cockpit (no N+1).
 */
import { getEventsSql } from "@/lib/events/db";
import {
  listCatalogSources,
  type CatalogSourceRecord,
  type CatalogSourceStatus,
  type CatalogSourceType,
} from "@/lib/events/catalog-sources";
import { isUserSuppliedNotes } from "@/lib/discovery/user-supplied";
import { normalizeRefreshUrl } from "@/lib/source-refresh/normalize";

export type CockpitLinkedEvent = {
  id: string;
  title: string;
  startsAt: string;
  city: string;
  publicationStatus: string;
};

export type CockpitSourceRow = CatalogSourceRecord & {
  userSupplied: boolean;
  intakeSourceType: "website" | "social" | "ticket" | "handmatig" | "onbekend";
  futureEventCount: number;
  linkedFutureEvents: CockpitLinkedEvent[];
  domain: string;
};

export type CockpitCandidateRow = {
  id: string;
  slug: string;
  title: string;
  organizerName: string | null;
  city: string;
  startsAt: string;
  publicationStatus: string;
  eligibilityRoute: string | null;
  singlesOnly: boolean | null;
  singlesOriented: boolean | null;
  priceNote: string | null;
  ageRule: string | null;
  minAge: number | null;
  maxAge: number | null;
  internalNotes: string | null;
  sourceUrl: string | null;
  hasScreenshot: boolean;
  fromIntake: boolean;
  createdAt: string;
  tags: string[];
};

export type AanvoerCockpitData = {
  sources: CockpitSourceRow[];
  candidates: CockpitCandidateRow[];
  counts: {
    sources: number;
    userSupplied: number;
    candidates: number;
    reviewNeeded: number;
    added: number;
    dismissed: number;
  };
};

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

/** Neon may return Date objects; client UI needs plain ISO strings. */
function toIsoString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  return String(value);
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const iso = toIsoString(value);
  return iso || null;
}

function intakeTypeFromNotes(
  notes: string | null,
  sourceType: CatalogSourceType,
): CockpitSourceRow["intakeSourceType"] {
  const n = (notes ?? "").toLowerCase();
  if (n.includes("intake_source_type=website_first")) return "website";
  if (n.includes("intake_source_type=social_first")) return "social";
  if (n.includes("intake_source_type=ticket_platform_first")) return "ticket";
  if (n.includes("intake_source_type=manual_only")) return "handmatig";
  if (sourceType === "ticket_platform") return "ticket";
  if (sourceType === "community") return "social";
  if (sourceType === "organizer") return "website";
  if (sourceType === "other") return "handmatig";
  return "onbekend";
}

export async function loadAanvoerCockpitData(): Promise<AanvoerCockpitData> {
  const sources = await listCatalogSources();
  const sql = getEventsSql();

  const empty: AanvoerCockpitData = {
    sources: sources.map((s) => ({
      ...s,
      createdAt: toIsoString(s.createdAt),
      updatedAt: toIsoString(s.updatedAt),
      lastCheckedAt: toIsoOrNull(s.lastCheckedAt),
      userSupplied: isUserSuppliedNotes(s.notes),
      intakeSourceType: intakeTypeFromNotes(s.notes, s.sourceType),
      futureEventCount: 0,
      linkedFutureEvents: [],
      domain: domainFromUrl(s.officialUrl),
    })),
    candidates: [],
    counts: {
      sources: sources.length,
      userSupplied: sources.filter((s) => isUserSuppliedNotes(s.notes)).length,
      candidates: 0,
      reviewNeeded: 0,
      added: 0,
      dismissed: 0,
    },
  };

  if (!sql) return empty;

  const futureRows = (await sql`
    SELECT
      e.id,
      e.title,
      e.starts_at,
      e.city,
      e.organizer_id,
      e.publication_status,
      s.normalized_url
    FROM event_editions e
    LEFT JOIN LATERAL (
      SELECT normalized_url
      FROM event_sources
      WHERE event_edition_id = e.id
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    ) s ON true
    WHERE e.starts_at >= (now() - interval '1 day')
      AND e.publication_status IN ('published', 'draft', 'under_review', 'candidate', 'approved')
  `) as {
    id: string;
    title: string;
    starts_at: string;
    city: string;
    organizer_id: string | null;
    publication_status: string;
    normalized_url: string | null;
  }[];

  const byOrganizer = new Map<string, CockpitLinkedEvent[]>();
  const byNormUrl = new Map<string, CockpitLinkedEvent[]>();

  for (const row of futureRows) {
    const item: CockpitLinkedEvent = {
      id: row.id,
      title: row.title,
      startsAt: toIsoString(row.starts_at),
      city: row.city,
      publicationStatus: row.publication_status,
    };
    if (row.organizer_id) {
      const list = byOrganizer.get(row.organizer_id) ?? [];
      list.push(item);
      byOrganizer.set(row.organizer_id, list);
    }
    if (row.normalized_url) {
      const list = byNormUrl.get(row.normalized_url) ?? [];
      list.push(item);
      byNormUrl.set(row.normalized_url, list);
    }
  }

  const cockpitSources: CockpitSourceRow[] = sources.map((source) => {
    const linked = new Map<string, CockpitLinkedEvent>();
    if (source.organizerId) {
      for (const ev of byOrganizer.get(source.organizerId) ?? []) {
        linked.set(ev.id, ev);
      }
    }
    const normCatalog = source.normalizedUrl;
    const normRefresh = normalizeRefreshUrl(source.officialUrl);
    for (const key of [normCatalog, normRefresh]) {
      for (const ev of byNormUrl.get(key) ?? []) {
        linked.set(ev.id, ev);
      }
    }
    const linkedFutureEvents = [...linked.values()].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    return {
      ...source,
      createdAt: toIsoString(source.createdAt),
      updatedAt: toIsoString(source.updatedAt),
      lastCheckedAt: toIsoOrNull(source.lastCheckedAt),
      userSupplied: isUserSuppliedNotes(source.notes),
      intakeSourceType: intakeTypeFromNotes(source.notes, source.sourceType),
      futureEventCount: linkedFutureEvents.length,
      linkedFutureEvents,
      domain: domainFromUrl(source.officialUrl),
    };
  });

  const candidateRows = (await sql`
    SELECT
      e.id,
      e.slug,
      e.title,
      e.city,
      e.starts_at,
      e.publication_status,
      e.eligibility_route,
      e.singles_only,
      e.singles_oriented,
      e.price_note,
      e.age_rule,
      e.min_age,
      e.max_age,
      e.internal_notes,
      e.tags,
      e.created_at,
      o.name AS organizer_name,
      s.url AS source_url
    FROM event_editions e
    LEFT JOIN organizers o ON o.id = e.organizer_id
    LEFT JOIN LATERAL (
      SELECT url
      FROM event_sources
      WHERE event_edition_id = e.id
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    ) s ON true
    WHERE
      e.publication_status IN ('draft', 'under_review', 'candidate', 'published', 'rejected')
      AND (
        e.tags @> '["admin-intake"]'::jsonb
        OR e.publication_status IN ('draft', 'under_review', 'candidate')
      )
    ORDER BY e.created_at DESC
    LIMIT 150
  `) as {
    id: string;
    slug: string;
    title: string;
    city: string;
    starts_at: string;
    publication_status: string;
    eligibility_route: string | null;
    singles_only: boolean | null;
    singles_oriented: boolean | null;
    price_note: string | null;
    age_rule: string | null;
    min_age: number | null;
    max_age: number | null;
    internal_notes: string | null;
    tags: unknown;
    created_at: string;
    organizer_name: string | null;
    source_url: string | null;
  }[];

  const candidates: CockpitCandidateRow[] = candidateRows.map((row) => {
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((t): t is string => typeof t === "string")
      : [];
    const notes = row.internal_notes ?? "";
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      organizerName: row.organizer_name,
      city: row.city,
      startsAt: toIsoString(row.starts_at),
      publicationStatus: row.publication_status,
      eligibilityRoute: row.eligibility_route,
      singlesOnly: row.singles_only,
      singlesOriented: row.singles_oriented,
      priceNote: row.price_note,
      ageRule: row.age_rule,
      minAge: row.min_age,
      maxAge: row.max_age,
      internalNotes: row.internal_notes,
      sourceUrl: row.source_url,
      hasScreenshot: /intake_asset=/.test(notes),
      fromIntake: tags.includes("admin-intake"),
      createdAt: toIsoString(row.created_at),
      tags,
    };
  });

  const reviewNeeded = candidates.filter(
    (c) =>
      c.publicationStatus === "draft" ||
      c.publicationStatus === "under_review" ||
      c.publicationStatus === "candidate",
  ).length;
  const added = candidates.filter(
    (c) => c.publicationStatus === "published",
  ).length;
  const dismissed = candidates.filter(
    (c) => c.publicationStatus === "rejected",
  ).length;

  return {
    sources: cockpitSources,
    candidates,
    counts: {
      sources: cockpitSources.length,
      userSupplied: cockpitSources.filter((s) => s.userSupplied).length,
      candidates: reviewNeeded,
      reviewNeeded,
      added,
      dismissed,
    },
  };
}

export const SOURCE_STATUS_LABEL: Record<CatalogSourceStatus, string> = {
  active: "Actief",
  promising: "Promising",
  low_yield: "Low yield",
  inactive: "Inactief",
};
