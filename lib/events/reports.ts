/**
 * Public "Geen singlesevent? Meld het" — signal store only.
 * Never mutates event publication or eligibility.
 */
import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import {
  clientIpFromRequest,
  hashClientIp,
} from "@/lib/tips/rate-limit";

export const EVENT_REPORT_TYPES = ["not_singles_event"] as const;
export type EventReportType = (typeof EVENT_REPORT_TYPES)[number];

export const EVENT_REPORT_STATUSES = [
  "new",
  "reviewing",
  "confirmed",
  "dismissed",
  "resolved",
] as const;
export type EventReportStatus = (typeof EVENT_REPORT_STATUSES)[number];

export const OPEN_REPORT_STATUSES: EventReportStatus[] = ["new", "reviewing"];

export const EVENT_REPORT_RATE_LIMIT = {
  windowMinutes: 15,
  maxReports: 10,
} as const;

export const EVENT_REPORT_DEDUPE_HOURS = 24;

export type EventReportRecord = {
  id: string;
  eventEditionId: string;
  reportType: EventReportType;
  status: EventReportStatus;
  reporterHash: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resolutionNote: string | null;
};

export type EventReportSummary = {
  eventEditionId: string;
  title: string;
  slug: string;
  publicationStatus: string;
  city: string | null;
  eligibilityRoute: string | null;
  singlesOnly: boolean | null;
  singlesOriented: boolean | null;
  primarySourceUrl: string | null;
  openCount: number;
  totalCount: number;
  firstReportAt: string | null;
  lastReportAt: string | null;
};

type ReportRow = {
  id: string;
  event_edition_id: string;
  report_type: EventReportType;
  status: EventReportStatus;
  reporter_hash: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution_note: string | null;
};

function mapReport(row: ReportRow): EventReportRecord {
  return {
    id: row.id,
    eventEditionId: row.event_edition_id,
    reportType: row.report_type,
    status: row.status,
    reporterHash: row.reporter_hash,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    resolutionNote: row.resolution_note,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function rateWindowStart(now = new Date()): Date {
  const ms = EVENT_REPORT_RATE_LIMIT.windowMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export async function consumeEventReportRateLimit(
  request: Request,
): Promise<
  | { ok: true; reporterHash: string; remaining: number }
  | { ok: false; status: 429 | 503; error: string }
> {
  const sql = getEventsSql();
  if (!sql) {
    return {
      ok: false,
      status: 503,
      error: "Melding tijdelijk niet beschikbaar.",
    };
  }

  const reporterHash = hashClientIp(clientIpFromRequest(request));
  if (!reporterHash) {
    return {
      ok: false,
      status: 503,
      error: "Melding tijdelijk niet beschikbaar.",
    };
  }

  const start = rateWindowStart();
  try {
    await sql`
      DELETE FROM event_report_rate
      WHERE window_start < now() - interval '2 days'
    `;
    const rows = await sql`
      INSERT INTO event_report_rate (ip_hash, window_start, hit_count, updated_at)
      VALUES (${reporterHash}, ${start.toISOString()}, 1, now())
      ON CONFLICT (ip_hash, window_start)
      DO UPDATE SET
        hit_count = event_report_rate.hit_count + 1,
        updated_at = now()
      RETURNING hit_count
    `;
    const hitCount = Number((rows[0] as { hit_count: number }).hit_count);
    if (
      !Number.isFinite(hitCount) ||
      hitCount > EVENT_REPORT_RATE_LIMIT.maxReports
    ) {
      return {
        ok: false,
        status: 429,
        error: "Te veel meldingen. Probeer het later opnieuw.",
      };
    }
    return {
      ok: true,
      reporterHash,
      remaining: Math.max(0, EVENT_REPORT_RATE_LIMIT.maxReports - hitCount),
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Melding tijdelijk niet beschikbaar.",
    };
  }
}

export type SubmitReportResult =
  | { ok: true; created: boolean }
  | { ok: false; status: 400 | 404 | 429 | 503; error: string };

/**
 * Submit a public report. Always returns friendly success for duplicates.
 * NEVER changes event publication status.
 */
export async function submitEventReport(input: {
  eventEditionId: string;
  reportType?: EventReportType;
  request: Request;
}): Promise<SubmitReportResult> {
  const sql = getEventsSql();
  if (!sql) {
    return { ok: false, status: 503, error: "Melding tijdelijk niet beschikbaar." };
  }

  const id = input.eventEditionId.trim();
  if (!isUuid(id)) {
    return { ok: false, status: 404, error: "Event niet gevonden." };
  }

  const reportType = input.reportType ?? "not_singles_event";
  if (!EVENT_REPORT_TYPES.includes(reportType)) {
    return { ok: false, status: 400, error: "Ongeldige melding." };
  }

  const rate = await consumeEventReportRateLimit(input.request);
  if (!rate.ok) {
    return { ok: false, status: rate.status, error: rate.error };
  }

  const edition = (await sql`
    SELECT id, publication_status
    FROM event_editions
    WHERE id = ${id}
    LIMIT 1
  `) as { id: string; publication_status: string }[];

  if (!edition[0]) {
    return { ok: false, status: 404, error: "Event niet gevonden." };
  }
  if (edition[0].publication_status !== "published") {
    return { ok: false, status: 404, error: "Event niet gevonden." };
  }

  // Dedupe: same hash + event + type within 24h → friendly ok, no new row.
  const existing = (await sql`
    SELECT id FROM event_reports
    WHERE event_edition_id = ${id}
      AND report_type = ${reportType}
      AND reporter_hash = ${rate.reporterHash}
      AND created_at >= now() - interval '24 hours'
    LIMIT 1
  `) as { id: string }[];

  if (existing[0]) {
    return { ok: true, created: false };
  }

  const reportId = randomUUID();
  await sql`
    INSERT INTO event_reports (
      id, event_edition_id, report_type, status, reporter_hash
    ) VALUES (
      ${reportId},
      ${id},
      ${reportType},
      'new',
      ${rate.reporterHash}
    )
  `;

  return { ok: true, created: true };
}

export async function listEventReportSummaries(): Promise<EventReportSummary[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT
      e.id AS event_edition_id,
      e.title,
      e.slug,
      e.publication_status,
      e.city,
      e.eligibility_route,
      e.singles_only,
      e.singles_oriented,
      (
        SELECT s.url FROM event_sources s
        WHERE s.event_edition_id = e.id
        ORDER BY s.is_primary DESC, s.created_at ASC
        LIMIT 1
      ) AS primary_source_url,
      count(*) FILTER (
        WHERE r.status IN ('new', 'reviewing')
      )::int AS open_count,
      count(*)::int AS total_count,
      min(r.created_at) AS first_report_at,
      max(r.created_at) AS last_report_at
    FROM event_reports r
    JOIN event_editions e ON e.id = r.event_edition_id
    GROUP BY e.id
    ORDER BY
      count(*) FILTER (WHERE r.status IN ('new', 'reviewing')) DESC,
      max(r.created_at) DESC
  `) as {
    event_edition_id: string;
    title: string;
    slug: string;
    publication_status: string;
    city: string | null;
    eligibility_route: string | null;
    singles_only: boolean | null;
    singles_oriented: boolean | null;
    primary_source_url: string | null;
    open_count: number;
    total_count: number;
    first_report_at: string | null;
    last_report_at: string | null;
  }[];

  return rows.map((row) => ({
    eventEditionId: row.event_edition_id,
    title: row.title,
    slug: row.slug,
    publicationStatus: row.publication_status,
    city: row.city,
    eligibilityRoute: row.eligibility_route,
    singlesOnly: row.singles_only,
    singlesOriented: row.singles_oriented,
    primarySourceUrl: row.primary_source_url,
    openCount: Number(row.open_count),
    totalCount: Number(row.total_count),
    firstReportAt: row.first_report_at,
    lastReportAt: row.last_report_at,
  }));
}

export async function countOpenReportsByEditionIds(
  editionIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (editionIds.length === 0) return map;
  const sql = getEventsSql();
  if (!sql) return map;
  const rows = (await sql`
    SELECT event_edition_id, count(*)::int AS n
    FROM event_reports
    WHERE event_edition_id = ANY(${editionIds})
      AND status IN ('new', 'reviewing')
    GROUP BY event_edition_id
  `) as { event_edition_id: string; n: number }[];
  for (const row of rows) {
    map.set(row.event_edition_id, Number(row.n));
  }
  return map;
}

export async function updateOpenReportsForEdition(input: {
  eventEditionId: string;
  status: EventReportStatus;
  reviewedBy: string;
  resolutionNote?: string | null;
}): Promise<number> {
  const sql = getEventsSql();
  if (!sql) return 0;
  if (!EVENT_REPORT_STATUSES.includes(input.status)) return 0;
  if (input.status === "new") return 0;

  const rows = (await sql`
    UPDATE event_reports SET
      status = ${input.status},
      reviewed_at = now(),
      reviewed_by = ${input.reviewedBy},
      resolution_note = ${input.resolutionNote ?? null}
    WHERE event_edition_id = ${input.eventEditionId}
      AND status IN ('new', 'reviewing')
    RETURNING id
  `) as { id: string }[];
  return rows.length;
}

export async function getReportsForEdition(
  eventEditionId: string,
): Promise<EventReportRecord[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT * FROM event_reports
    WHERE event_edition_id = ${eventEditionId}
    ORDER BY created_at DESC
  `) as ReportRow[];
  return rows.map(mapReport);
}
