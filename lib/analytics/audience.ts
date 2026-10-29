/**
 * "Wie zijn je bezoekers": unique visitors, where they come from, device,
 * place, new vs returning, engagement, plus a live view. Reads
 * analytics_events_visible, so the admin's own devices never count.
 *
 * A visitor = one anonymous device id (one browser on one device).
 * A visit = one visitor on one day (Brussels time).
 */

import { getEventsSql } from "@/lib/events/db";
import { ensureAnalyticsSchemaV2 } from "@/lib/analytics/schema";
import {
  classifySource,
  countryLabel,
  sourceLabel,
} from "@/lib/analytics/visitor-context";

export type CountRow = { label: string; count: number };

export type AudienceData = {
  visitors: number;
  visits: number;
  newVisitors: number;
  returningVisitors: number;
  pagesPerVisit: number | null;
  /** Median visit length in seconds (visits with 2+ pages). */
  medianVisitSeconds: number | null;
  clickedOutVisitors: number;
  sources: CountRow[];
  devices: CountRow[];
  systems: CountRow[];
  cities: CountRow[];
  countries: CountRow[];
  /** Per day: visitors per source (top sources + "Andere"). */
  byDay: { day: string; total: number; perSource: Record<string, number> }[];
  daySources: string[];
  excludedDevices: number;
};

export const EMPTY_AUDIENCE: AudienceData = {
  visitors: 0,
  visits: 0,
  newVisitors: 0,
  returningVisitors: 0,
  pagesPerVisit: null,
  medianVisitSeconds: null,
  clickedOutVisitors: 0,
  sources: [],
  devices: [],
  systems: [],
  cities: [],
  countries: [],
  byDay: [],
  daySources: [],
  excludedDevices: 0,
};

type Meta = Record<string, unknown> | null;

type VisitRow = {
  sid: string;
  day: string;
  first_at: string | Date;
  last_at: string | Date;
  pages: number;
  clicked_out: boolean;
  first_meta: Meta;
  ctx_meta: Meta;
  seen_before: boolean;
};

function str(meta: Meta, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Source label of a visit: stored src, else derived from the old referrer field. */
export function visitSourceLabel(meta: Meta): string {
  const src =
    str(meta, "src") ??
    classifySource({
      referrerHost: str(meta, "referrer_host"),
      utmSource: str(meta, "utm_source"),
    });
  return sourceLabel(src);
}

const DEVICE_LABELS: Record<string, string> = {
  gsm: "Gsm",
  tablet: "Tablet",
  computer: "Computer",
};

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function top(map: Map<string, number>, limit = 8): CountRow[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function ms(value: string | Date): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

/** Pure aggregation of visit rows (exported for tests). */
export function aggregateAudience(rows: VisitRow[], excludedDevices = 0): AudienceData {
  if (rows.length === 0) return { ...EMPTY_AUDIENCE, excludedDevices };

  const firstVisit = new Map<string, VisitRow>();
  const ctx = new Map<string, Meta>();
  const clicked = new Set<string>();
  const returning = new Set<string>();
  for (const row of rows) {
    const prev = firstVisit.get(row.sid);
    if (!prev || ms(row.first_at) < ms(prev.first_at)) firstVisit.set(row.sid, row);
    if (row.ctx_meta) ctx.set(row.sid, row.ctx_meta);
    if (row.clicked_out) clicked.add(row.sid);
    if (row.seen_before) returning.add(row.sid);
  }
  // Visited on an earlier day inside the period = returning as well.
  for (const row of rows) {
    if (firstVisit.get(row.sid) !== row) returning.add(row.sid);
  }

  const sources = new Map<string, number>();
  for (const visit of firstVisit.values()) bump(sources, visitSourceLabel(visit.first_meta));

  const devices = new Map<string, number>();
  const systems = new Map<string, number>();
  const cities = new Map<string, number>();
  const countries = new Map<string, number>();
  for (const sid of firstVisit.keys()) {
    const meta = ctx.get(sid) ?? null;
    const device = str(meta, "device");
    bump(devices, device ? (DEVICE_LABELS[device] ?? device) : "Onbekend");
    const os = str(meta, "os");
    const browser = str(meta, "browser");
    bump(systems, os ? `${os}${browser ? ` · ${browser}` : ""}` : "Onbekend");
    const country = str(meta, "country");
    const city = str(meta, "city");
    bump(countries, countryLabel(country));
    bump(cities, city ? `${city}${country && country !== "BE" ? ` (${country})` : ""}` : "Onbekend");
  }

  const durations = rows
    .filter((r) => r.pages >= 2)
    .map((r) => Math.min(2 * 3600, (ms(r.last_at) - ms(r.first_at)) / 1000))
    .sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)]! : null;
  const totalPages = rows.reduce((sum, r) => sum + r.pages, 0);

  const sourceOrder = top(sources, 3).map((r) => r.label);
  const byDayMap = new Map<string, { total: Set<string>; perSource: Map<string, Set<string>> }>();
  for (const row of rows) {
    const entry =
      byDayMap.get(row.day) ?? { total: new Set<string>(), perSource: new Map<string, Set<string>>() };
    entry.total.add(row.sid);
    const label = visitSourceLabel(row.first_meta);
    const bucket = sourceOrder.includes(label) ? label : "Andere";
    const set = entry.perSource.get(bucket) ?? new Set<string>();
    set.add(row.sid);
    entry.perSource.set(bucket, set);
    byDayMap.set(row.day, entry);
  }
  const daySources = [...sourceOrder];
  const byDay = [...byDayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, entry]) => {
      const perSource: Record<string, number> = {};
      for (const [label, set] of entry.perSource) perSource[label] = set.size;
      if (perSource.Andere && !daySources.includes("Andere")) daySources.push("Andere");
      return { day, total: entry.total.size, perSource };
    });

  return {
    visitors: firstVisit.size,
    visits: rows.length,
    newVisitors: firstVisit.size - returning.size,
    returningVisitors: returning.size,
    pagesPerVisit: rows.length > 0 ? Math.round((totalPages / rows.length) * 10) / 10 : null,
    medianVisitSeconds: median == null ? null : Math.round(median),
    clickedOutVisitors: clicked.size,
    sources: top(sources),
    devices: top(devices),
    systems: top(systems, 6),
    cities: top(cities, 10),
    countries: top(countries, 6),
    byDay,
    daySources,
    excludedDevices,
  };
}

export async function loadAudience(range: { start: Date; end: Date }): Promise<AudienceData> {
  const sql = getEventsSql();
  if (!sql) return EMPTY_AUDIENCE;
  try {
    await ensureAnalyticsSchemaV2();
    const start = range.start.toISOString();
    const end = range.end.toISOString();
    const [rows, excluded] = await Promise.all([
      sql`
        WITH v AS (
          SELECT
            anonymous_session_id AS sid,
            to_char((created_at AT TIME ZONE 'Europe/Brussels')::date, 'YYYY-MM-DD') AS day,
            min(created_at) AS first_at,
            max(created_at) AS last_at,
            count(*) FILTER (WHERE event_name = 'page_view')::int AS pages,
            bool_or(event_name = 'external_source_click') AS clicked_out,
            (array_agg(metadata ORDER BY created_at)
              FILTER (WHERE event_name = 'page_view'))[1] AS first_meta,
            (array_agg(metadata ORDER BY created_at DESC)
              FILTER (WHERE event_name = 'page_view' AND metadata ? 'device'))[1] AS ctx_meta
          FROM analytics_events_visible
          WHERE created_at >= ${start} AND created_at <= ${end}
          GROUP BY 1, 2
        )
        SELECT v.*, EXISTS (
          SELECT 1 FROM analytics_events_visible p
          WHERE p.anonymous_session_id = v.sid AND p.created_at < ${start}
        ) AS seen_before
        FROM v
        WHERE v.pages > 0
        ORDER BY v.first_at
        LIMIT 50000
      ` as unknown as Promise<VisitRow[]>,
      sql`SELECT count(*)::int AS n FROM analytics_excluded_sessions` as unknown as Promise<
        { n: number }[]
      >,
    ]);
    return aggregateAudience(rows, Number(excluded[0]?.n ?? 0));
  } catch (error) {
    console.error("[analytics/audience]", error instanceof Error ? error.message : error);
    return EMPTY_AUDIENCE;
  }
}

export type LiveVisitor = {
  lastSeen: string;
  page: string;
  source: string;
  device: string;
  place: string;
  pagesToday: number;
};

/** Visitors with activity in the last `minutes` minutes. */
export async function loadLiveVisitors(minutes = 5): Promise<LiveVisitor[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  await ensureAnalyticsSchemaV2();
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const dayStart = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = (await sql`
    WITH active AS (
      SELECT anonymous_session_id AS sid, max(created_at) AS last_seen
      FROM analytics_events_visible
      WHERE created_at >= ${since}
      GROUP BY 1
    )
    SELECT
      a.sid,
      a.last_seen,
      (SELECT COALESCE(NULLIF(e.path, ''), '/') FROM analytics_events_visible e
        WHERE e.anonymous_session_id = a.sid AND e.event_name = 'page_view'
        ORDER BY e.created_at DESC LIMIT 1) AS page,
      (SELECT e.metadata FROM analytics_events_visible e
        WHERE e.anonymous_session_id = a.sid AND e.event_name = 'page_view'
          AND e.created_at >= ${dayStart}
        ORDER BY e.created_at ASC LIMIT 1) AS first_meta,
      (SELECT e.metadata FROM analytics_events_visible e
        WHERE e.anonymous_session_id = a.sid AND e.event_name = 'page_view'
          AND e.metadata ? 'device'
        ORDER BY e.created_at DESC LIMIT 1) AS ctx_meta,
      (SELECT count(*)::int FROM analytics_events_visible e
        WHERE e.anonymous_session_id = a.sid AND e.event_name = 'page_view'
          AND e.created_at >= ${dayStart}) AS pages_today
    FROM active a
    ORDER BY a.last_seen DESC
    LIMIT 50
  `) as {
    last_seen: string | Date;
    page: string | null;
    first_meta: Meta;
    ctx_meta: Meta;
    pages_today: number;
  }[];
  return rows.map((row) => {
    const device = str(row.ctx_meta, "device");
    const city = str(row.ctx_meta, "city");
    const country = str(row.ctx_meta, "country");
    return {
      lastSeen: new Date(row.last_seen).toISOString(),
      page: row.page ?? "/",
      source: visitSourceLabel(row.first_meta),
      device: device ? (DEVICE_LABELS[device] ?? device) : "Onbekend",
      place: city ? `${city}${country ? `, ${countryLabel(country)}` : ""}` : countryLabel(country),
      pagesToday: Number(row.pages_today ?? 0),
    };
  });
}
