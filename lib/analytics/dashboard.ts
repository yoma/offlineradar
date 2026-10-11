/**
 * Period helpers + dashboard aggregates for /interne-dashboard (FASE 26.18).
 */
import { ANALYTICS_DATA_SINCE } from "@/lib/analytics/types";
import { getEventsSql } from "@/lib/events/db";

export type DashboardPeriodKey =
  | "today"
  | "7d"
  | "30d"
  | "month"
  | "prev_month"
  | "custom";

export type DashboardPeriod = {
  key: DashboardPeriodKey;
  label: string;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function resolveDashboardPeriod(input: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): DashboardPeriod {
  const now = input.now ?? new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const key = (input.period ?? "7d") as DashboardPeriodKey;

  if (key === "today") {
    return {
      key,
      label: "Vandaag",
      start: todayStart,
      end: todayEnd,
      prevStart: addDays(todayStart, -1),
      prevEnd: endOfDay(addDays(todayStart, -1)),
    };
  }

  if (key === "30d") {
    const start = addDays(todayStart, -29);
    return {
      key,
      label: "30 dagen",
      start,
      end: todayEnd,
      prevStart: addDays(start, -30),
      prevEnd: endOfDay(addDays(start, -1)),
    };
  }

  if (key === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return {
      key,
      label: "Deze maand",
      start,
      end: todayEnd,
      prevStart,
      prevEnd,
    };
  }

  if (key === "prev_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevEnd = endOfDay(
      new Date(now.getFullYear(), now.getMonth() - 1, 0),
    );
    return { key, label: "Vorige maand", start, end, prevStart, prevEnd };
  }

  if (key === "custom" && input.from && input.to) {
    const start = startOfDay(new Date(input.from));
    const end = endOfDay(new Date(input.to));
    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start <= end
    ) {
      const days =
        Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) +
        1;
      return {
        key,
        label: "Custom periode",
        start,
        end,
        prevStart: addDays(start, -days),
        prevEnd: endOfDay(addDays(start, -1)),
      };
    }
  }

  const start = addDays(todayStart, -6);
  return {
    key: "7d",
    label: "7 dagen",
    start,
    end: todayEnd,
    prevStart: addDays(start, -7),
    prevEnd: endOfDay(addDays(start, -1)),
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function originFromTagsNotes(tags: unknown, notes: string | null): string {
  const list = Array.isArray(tags)
    ? tags.map((t) => String(t))
    : typeof tags === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(tags);
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })()
      : [];
  const n = notes ?? "";
  if (list.includes("admin-intake") || /intake_asset=|intake_mode=/i.test(n)) {
    return "admin_intake";
  }
  if (list.includes("from-tip") || /tip_id=|from_tip/i.test(n)) return "user_tip";
  if (list.includes("parser") || /parser_|source_refresh/i.test(n)) {
    return "parser_refresh";
  }
  if (list.includes("ai-scan") || /ai_scan|discovery/i.test(n)) {
    return "ai_discovery";
  }
  return "manual_legacy";
}

export type KpiWithDelta = {
  value: number;
  previous: number;
  deltaPct: number | null;
};

export type DashboardData = {
  period: DashboardPeriod;
  dataSince: string;
  kpis: {
    uniqueVisitors: KpiWithDelta;
    uniqueVisitorsToday: number;
    uniqueVisitors7d: number;
    uniqueVisitors30d: number;
    pageviews: KpiWithDelta;
    newEvents: KpiWithDelta;
    externalClicks: KpiWithDelta;
    attentionNeeded: number;
  };
  visitorsByDay: { day: string; visitors: number; pageviews: number }[];
  supply: {
    aiDiscovery: number;
    adminIntake: number;
    userTip: number;
    autoPublished: number;
    attentionNeeded: number;
    rejected: number;
    byOrigin: { origin: string; label: string; count: number }[];
  };
  discoveryActivity: {
    aiFound: number;
    confirmedExisting: number;
    newSources: number;
    autoPublished: number;
    attention: number;
    rejected: number;
  };
  topEvents: {
    id: string;
    slug: string;
    title: string;
    organizer: string;
    startsAt: string | null;
    views: number;
    saves: number;
    externalClicks: number;
    ctr: number | null;
  }[];
  lowInterestEvents: {
    id: string;
    slug: string;
    title: string;
    organizer: string;
    views: number;
  }[];
  topSaved: {
    id: string;
    slug: string;
    title: string;
    organizer: string;
    saves: number;
  }[];
  organizers: {
    id: string;
    name: string;
    views: number;
    saves: number;
    externalClicks: number;
    activeEvents: number;
    follows: number;
  }[];
  categories: { category: string; views: number; filterHits: number }[];
  searchTerms: { term: string; count: number }[];
  sources: {
    activeFollowed: number;
    newDiscovered: number;
    needsAttention: number;
    manual: number;
    successfulScans: number;
    top: {
      id: string;
      name: string;
      newEvents: number;
      published: number;
      lastScanAt: string | null;
    }[];
  };
  recentActivity: {
    at: string;
    kind: string;
    title: string;
    detail: string;
  }[];
  /** Plain-language user glance for non-technical admin reading. */
  peopleGlance: {
    whatTheyDo: {
      visitors: number;
      pageViews: number;
      searches: number;
      eventViews: number;
      saves: number;
      externalClicks: number;
    };
    whereStuck: {
      noResults: number;
      openBugReports: number;
      openFeedback: number;
      cardClicks: number;
      eventViewsFromCards: number;
    };
    errors: {
      count: number;
      recent: { at: string; path: string; message: string }[];
    };
    whereFrom: {
      landings: { label: string; count: number }[];
      referrers: { label: string; count: number }[];
      topPages: { label: string; count: number }[];
    };
  };
};

function pathLabel(path: string | null | undefined): string {
  const raw = (path ?? "/").trim() || "/";
  if (raw === "/") return "Home";
  if (raw.startsWith("/ontdek")) return "Ontdek";
  if (raw.startsWith("/bewaard")) return "Bewaard";
  if (raw.startsWith("/over")) return "Over";
  if (raw.startsWith("/event/")) return "Eventpagina";
  if (raw.startsWith("/inloggen")) return "Inloggen";
  if (raw.startsWith("/account")) return "Mijn account";
  if (raw.startsWith("/feedback")) return "Feedback";
  if (raw.startsWith("/privacy")) return "Privacy";
  return raw.length > 40 ? `${raw.slice(0, 37)}…` : raw;
}

function referrerLabel(host: string | null | undefined): string {
  const h = (host ?? "direct").trim().toLowerCase() || "direct";
  if (h === "direct" || h === "(direct)") return "Direct (of onbekend)";
  if (h.includes("google.")) return "Google";
  if (h.includes("bing.")) return "Bing";
  if (h.includes("instagram.") || h === "l.instagram.com") return "Instagram";
  if (h.includes("facebook.") || h.includes("fb.") || h === "m.facebook.com") {
    return "Facebook";
  }
  if (h.includes("linkedin.")) return "LinkedIn";
  if (h.includes("tiktok.")) return "TikTok";
  if (h.includes("x.com") || h.includes("twitter.")) return "X / Twitter";
  if (h.includes("duckduckgo.")) return "DuckDuckGo";
  return h;
}

const EMPTY_PEOPLE_GLANCE: DashboardData["peopleGlance"] = {
  whatTheyDo: {
    visitors: 0,
    pageViews: 0,
    searches: 0,
    eventViews: 0,
    saves: 0,
    externalClicks: 0,
  },
  whereStuck: {
    noResults: 0,
    openBugReports: 0,
    openFeedback: 0,
    cardClicks: 0,
    eventViewsFromCards: 0,
  },
  errors: { count: 0, recent: [] },
  whereFrom: { landings: [], referrers: [], topPages: [] },
};

const ORIGIN_LABELS: Record<string, string> = {
  ai_discovery: "AI discovery",
  admin_intake: "Admin intake",
  user_tip: "User tip",
  parser_refresh: "Parser / source refresh",
  manual_legacy: "Handmatig / legacy",
};

async function safeQuery<T>(
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error("[dashboard] query failed", error);
    return fallback;
  }
}

export async function loadDashboardData(
  period: DashboardPeriod,
): Promise<DashboardData> {
  const sql = getEventsSql();
  const empty: DashboardData = {
    period,
    dataSince: ANALYTICS_DATA_SINCE,
    kpis: {
      uniqueVisitors: { value: 0, previous: 0, deltaPct: null },
      uniqueVisitorsToday: 0,
      uniqueVisitors7d: 0,
      uniqueVisitors30d: 0,
      pageviews: { value: 0, previous: 0, deltaPct: null },
      newEvents: { value: 0, previous: 0, deltaPct: null },
      externalClicks: { value: 0, previous: 0, deltaPct: null },
      attentionNeeded: 0,
    },
    visitorsByDay: [],
    supply: {
      aiDiscovery: 0,
      adminIntake: 0,
      userTip: 0,
      autoPublished: 0,
      attentionNeeded: 0,
      rejected: 0,
      byOrigin: [],
    },
    discoveryActivity: {
      aiFound: 0,
      confirmedExisting: 0,
      newSources: 0,
      autoPublished: 0,
      attention: 0,
      rejected: 0,
    },
    topEvents: [],
    lowInterestEvents: [],
    topSaved: [],
    organizers: [],
    categories: [],
    searchTerms: [],
    sources: {
      activeFollowed: 0,
      newDiscovered: 0,
      needsAttention: 0,
      manual: 0,
      successfulScans: 0,
      top: [],
    },
    recentActivity: [],
    peopleGlance: EMPTY_PEOPLE_GLANCE,
  };

  if (!sql) return empty;

  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();
  const prevStartIso = period.prevStart.toISOString();
  const prevEndIso = period.prevEnd.toISOString();
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const d7 = addDays(startOfDay(now), -6).toISOString();
  const d30 = addDays(startOfDay(now), -29).toISOString();
  const endNow = endOfDay(now).toISOString();

  const [
    visitorWindows,
    periodTraffic,
    prevTraffic,
    visitorsByDay,
    editionsInPeriod,
    prevEditions,
    attentionRows,
    rejectedRows,
    publishedInPeriod,
    eventPerf,
    categoryViews,
    filterRows,
    searchRows,
    sourceStats,
    sourceTop,
    scanSuccess,
    followCounts,
    recentEditions,
    recentTips,
    recentScans,
    confirmedExisting,
    orgPerf,
    productCounts,
    landingRows,
    referrerRows,
    topPageRows,
    recentErrorRows,
    openBugRows,
    openFeedbackRows,
  ] = await Promise.all([
    safeQuery(
      () => sql`
        SELECT
          count(DISTINCT anonymous_session_id) FILTER (
            WHERE created_at >= ${todayStart} AND created_at <= ${endNow}
              AND event_name = 'page_view'
          )::int AS today,
          count(DISTINCT anonymous_session_id) FILTER (
            WHERE created_at >= ${d7} AND created_at <= ${endNow}
              AND event_name = 'page_view'
          )::int AS d7,
          count(DISTINCT anonymous_session_id) FILTER (
            WHERE created_at >= ${d30} AND created_at <= ${endNow}
              AND event_name = 'page_view'
          )::int AS d30
        FROM analytics_events
      `,
      [{ today: 0, d7: 0, d30: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT
          count(DISTINCT anonymous_session_id) FILTER (WHERE event_name = 'page_view')::int AS visitors,
          count(*) FILTER (WHERE event_name = 'page_view')::int AS pageviews,
          count(*) FILTER (WHERE event_name = 'external_source_click')::int AS external_clicks
        FROM analytics_events
        WHERE created_at >= ${startIso} AND created_at <= ${endIso}
      `,
      [{ visitors: 0, pageviews: 0, external_clicks: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT
          count(DISTINCT anonymous_session_id) FILTER (WHERE event_name = 'page_view')::int AS visitors,
          count(*) FILTER (WHERE event_name = 'page_view')::int AS pageviews,
          count(*) FILTER (WHERE event_name = 'external_source_click')::int AS external_clicks
        FROM analytics_events
        WHERE created_at >= ${prevStartIso} AND created_at <= ${prevEndIso}
      `,
      [{ visitors: 0, pageviews: 0, external_clicks: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT
          to_char(date_trunc('day', created_at AT TIME ZONE 'Europe/Brussels'), 'YYYY-MM-DD') AS day,
          count(DISTINCT anonymous_session_id) FILTER (WHERE event_name = 'page_view')::int AS visitors,
          count(*) FILTER (WHERE event_name = 'page_view')::int AS pageviews
        FROM analytics_events
        WHERE created_at >= ${startIso} AND created_at <= ${endIso}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT id, title, tags, internal_notes, publication_status, created_at, published_at, organizer_id
        FROM event_editions
        WHERE created_at >= ${startIso} AND created_at <= ${endIso}
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM event_editions
        WHERE created_at >= ${prevStartIso} AND created_at <= ${prevEndIso}
      `,
      [{ n: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM event_editions
        WHERE publication_status IN ('draft', 'under_review', 'candidate', 'approved')
          AND NOT (COALESCE(tags, '[]'::jsonb) @> '["manual_suppressed"]'::jsonb)
      `,
      [{ n: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM event_editions
        WHERE publication_status IN ('rejected', 'expired')
          AND COALESCE(rejected_at, expired_at, updated_at) >= ${startIso}
          AND COALESCE(rejected_at, expired_at, updated_at) <= ${endIso}
      `,
      [{ n: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM event_editions
        WHERE publication_status = 'published'
          AND published_at >= ${startIso}
          AND published_at <= ${endIso}
      `,
      [{ n: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT
          e.id,
          e.slug,
          e.title,
          e.starts_at,
          COALESCE(o.name, 'Onbekend') AS organizer,
          count(*) FILTER (WHERE a.event_name = 'event_view')::int AS views,
          count(*) FILTER (WHERE a.event_name = 'event_saved')::int AS saves,
          count(*) FILTER (WHERE a.event_name = 'external_source_click')::int AS external_clicks
        FROM analytics_events a
        JOIN event_editions e ON e.id = a.event_edition_id
        LEFT JOIN organizers o ON o.id = e.organizer_id
        WHERE a.created_at >= ${startIso}
          AND a.created_at <= ${endIso}
          AND a.event_name IN ('event_view', 'event_saved', 'external_source_click')
        GROUP BY e.id, e.slug, e.title, e.starts_at, o.name
        HAVING count(*) FILTER (WHERE a.event_name = 'event_view') > 0
        ORDER BY views DESC
        LIMIT 25
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT
          COALESCE(e.category, a.category, 'onbekend') AS category,
          count(*)::int AS views
        FROM analytics_events a
        LEFT JOIN event_editions e ON e.id = a.event_edition_id
        WHERE a.created_at >= ${startIso}
          AND a.created_at <= ${endIso}
          AND a.event_name = 'event_view'
        GROUP BY 1
        ORDER BY views DESC
        LIMIT 12
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT
          COALESCE(metadata->>'categories', '') AS category,
          count(*)::int AS hits
        FROM analytics_events
        WHERE created_at >= ${startIso}
          AND created_at <= ${endIso}
          AND event_name = 'filter_change'
          AND COALESCE(metadata->>'categories', '') <> ''
        GROUP BY 1
        ORDER BY hits DESC
        LIMIT 20
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT
          lower(trim(COALESCE(metadata->>'q', metadata->>'query', metadata->>'term', ''))) AS term,
          count(*)::int AS n
        FROM analytics_events
        WHERE created_at >= ${startIso}
          AND created_at <= ${endIso}
          AND event_name = 'discovery_search'
        GROUP BY 1
        HAVING length(lower(trim(COALESCE(metadata->>'q', metadata->>'query', metadata->>'term', '')))) >= 2
          AND count(*) >= 2
          AND lower(trim(COALESCE(metadata->>'q', metadata->>'query', metadata->>'term', ''))) NOT LIKE '%@%'
        ORDER BY n DESC
        LIMIT 15
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT
          count(*) FILTER (
            WHERE COALESCE(refresh_enabled, false) = true
              AND status = 'active'
              AND COALESCE(notes, '') NOT ILIKE '%follow_status=disabled%'
              AND COALESCE(notes, '') NOT ILIKE '%follow_status=paused%'
          )::int AS active_followed,
          count(*) FILTER (
            WHERE created_at >= ${startIso} AND created_at <= ${endIso}
          )::int AS new_discovered,
          count(*) FILTER (
            WHERE COALESCE(notes, '') ILIKE '%follow_status=attention%'
               OR COALESCE(notes, '') ILIKE '%scan_attention%'
               OR status = 'low_yield'
          )::int AS needs_attention,
          count(*) FILTER (
            WHERE COALESCE(notes, '') ILIKE '%intake_source_type=manual_only%'
               OR source_type = 'other'
          )::int AS manual
        FROM catalog_sources
      `,
      [
        {
          active_followed: 0,
          new_discovered: 0,
          needs_attention: 0,
          manual: 0,
        },
      ],
    ),
    safeQuery(
      () => sql`
        SELECT
          cs.id,
          cs.name,
          COALESCE((
            SELECT count(*)::int
            FROM source_refresh_items i
            WHERE i.catalog_source_id = cs.id
              AND i.detection_type = 'new'
              AND i.created_at >= ${startIso}
              AND i.created_at <= ${endIso}
          ), 0) AS new_events,
          COALESCE((
            SELECT count(*)::int
            FROM source_refresh_items i
            WHERE i.catalog_source_id = cs.id
              AND i.status IN ('accepted', 'applied')
              AND i.created_at >= ${startIso}
              AND i.created_at <= ${endIso}
          ), 0) AS published,
          (
            SELECT max(completed_at)::text
            FROM source_refresh_runs r
            WHERE r.catalog_source_id = cs.id
          ) AS last_scan_at
        FROM catalog_sources cs
        WHERE cs.status IN ('active', 'promising')
        ORDER BY new_events DESC, published DESC, cs.name ASC
        LIMIT 8
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM source_refresh_runs
        WHERE status = 'completed'
          AND completed_at >= ${startIso}
          AND completed_at <= ${endIso}
      `,
      [{ n: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT organizer_id, count(*)::int AS follows
        FROM user_followed_organizers
        GROUP BY organizer_id
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT created_at, title, tags, internal_notes, publication_status
        FROM event_editions
        WHERE created_at >= ${startIso} AND created_at <= ${endIso}
        ORDER BY created_at DESC
        LIMIT 12
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT created_at, original_url AS label
        FROM tips
        WHERE created_at >= ${startIso} AND created_at <= ${endIso}
        ORDER BY created_at DESC
        LIMIT 8
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT r.completed_at AS at, cs.name, r.status, r.new_count AS new_candidates
        FROM source_refresh_runs r
        JOIN catalog_sources cs ON cs.id = r.catalog_source_id
        WHERE r.completed_at >= ${startIso} AND r.completed_at <= ${endIso}
        ORDER BY r.completed_at DESC
        LIMIT 8
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM source_refresh_items
        WHERE created_at >= ${startIso}
          AND created_at <= ${endIso}
          AND detection_type = 'existing_unchanged'
      `,
      [{ n: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT
          o.id,
          o.name,
          count(*) FILTER (WHERE a.event_name = 'event_view')::int AS views,
          count(*) FILTER (WHERE a.event_name = 'event_saved')::int AS saves,
          count(*) FILTER (WHERE a.event_name = 'external_source_click')::int AS external_clicks,
          (
            SELECT count(*)::int FROM event_editions e2
            WHERE e2.organizer_id = o.id
              AND e2.publication_status = 'published'
              AND e2.starts_at >= now()
          ) AS active_events
        FROM analytics_events a
        JOIN event_editions e ON e.id = a.event_edition_id
        JOIN organizers o ON o.id = e.organizer_id
        WHERE a.created_at >= ${startIso}
          AND a.created_at <= ${endIso}
          AND a.event_name IN ('event_view', 'event_saved', 'external_source_click')
        GROUP BY o.id, o.name
        ORDER BY views DESC
        LIMIT 12
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT
          count(*) FILTER (WHERE event_name = 'discovery_search')::int AS searches,
          count(*) FILTER (WHERE event_name = 'event_view')::int AS event_views,
          count(*) FILTER (WHERE event_name = 'event_saved')::int AS saves,
          count(*) FILTER (WHERE event_name = 'zero_results')::int AS zero_results,
          count(*) FILTER (WHERE event_name = 'event_card_click')::int AS card_clicks,
          count(*) FILTER (WHERE event_name = 'client_error')::int AS client_errors
        FROM analytics_events
        WHERE created_at >= ${startIso} AND created_at <= ${endIso}
      `,
      [
        {
          searches: 0,
          event_views: 0,
          saves: 0,
          zero_results: 0,
          card_clicks: 0,
          client_errors: 0,
        },
      ],
    ),
    safeQuery(
      () => sql`
        SELECT path, count(*)::int AS n
        FROM (
          SELECT DISTINCT ON (anonymous_session_id)
            anonymous_session_id,
            COALESCE(NULLIF(path, ''), metadata->>'path', '/') AS path
          FROM analytics_events
          WHERE event_name = 'page_view'
            AND created_at >= ${startIso}
            AND created_at <= ${endIso}
          ORDER BY anonymous_session_id, created_at ASC
        ) firsts
        GROUP BY path
        ORDER BY n DESC
        LIMIT 8
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT host, count(*)::int AS n
        FROM (
          SELECT DISTINCT ON (anonymous_session_id)
            anonymous_session_id,
            COALESCE(
              NULLIF(trim(metadata->>'referrer_host'), ''),
              'direct'
            ) AS host
          FROM analytics_events
          WHERE event_name = 'page_view'
            AND created_at >= ${startIso}
            AND created_at <= ${endIso}
            AND (
              (metadata->>'is_landing') = 'true'
              OR metadata ? 'referrer_host'
            )
          ORDER BY anonymous_session_id, created_at ASC
        ) landings
        GROUP BY host
        ORDER BY n DESC
        LIMIT 8
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT
          COALESCE(NULLIF(path, ''), '/') AS path,
          count(*)::int AS n
        FROM analytics_events
        WHERE event_name = 'page_view'
          AND created_at >= ${startIso}
          AND created_at <= ${endIso}
        GROUP BY 1
        ORDER BY n DESC
        LIMIT 8
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT
          created_at AS at,
          COALESCE(NULLIF(path, ''), metadata->>'path', '/') AS path,
          COALESCE(
            NULLIF(trim(metadata->>'message'), ''),
            'Er ging iets mis'
          ) AS message
        FROM analytics_events
        WHERE event_name = 'client_error'
          AND created_at >= ${startIso}
          AND created_at <= ${endIso}
        ORDER BY created_at DESC
        LIMIT 8
      `,
      [],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM beta_feedback
        WHERE category = 'bug'
          AND status IN ('new', 'reviewing')
      `,
      [{ n: 0 }],
    ),
    safeQuery(
      () => sql`
        SELECT count(*)::int AS n
        FROM beta_feedback
        WHERE status IN ('new', 'reviewing')
      `,
      [{ n: 0 }],
    ),
  ]);

  const visitors = visitorWindows[0] as {
    today: number;
    d7: number;
    d30: number;
  };
  const traffic = periodTraffic[0] as {
    visitors: number;
    pageviews: number;
    external_clicks: number;
  };
  const prev = prevTraffic[0] as {
    visitors: number;
    pageviews: number;
    external_clicks: number;
  };

  const originCounts: Record<string, number> = {
    ai_discovery: 0,
    admin_intake: 0,
    user_tip: 0,
    parser_refresh: 0,
    manual_legacy: 0,
  };
  for (const row of editionsInPeriod as {
    tags: unknown;
    internal_notes: string | null;
  }[]) {
    const origin = originFromTagsNotes(row.tags, row.internal_notes);
    originCounts[origin] = (originCounts[origin] ?? 0) + 1;
  }

  const attentionNeeded = Number(
    (attentionRows[0] as { n: number } | undefined)?.n ?? 0,
  );
  const rejected = Number(
    (rejectedRows[0] as { n: number } | undefined)?.n ?? 0,
  );
  const autoPublished = Number(
    (publishedInPeriod[0] as { n: number } | undefined)?.n ?? 0,
  );
  const newEventsCount = (editionsInPeriod as unknown[]).length;
  const prevNew = Number((prevEditions[0] as { n: number } | undefined)?.n ?? 0);

  const perf = (
    eventPerf as {
      id: string;
      slug: string;
      title: string;
      organizer: string;
      starts_at: string | null;
      views: number;
      saves: number;
      external_clicks: number;
    }[]
  ).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    organizer: row.organizer,
    startsAt: row.starts_at ? String(row.starts_at) : null,
    views: Number(row.views),
    saves: Number(row.saves),
    externalClicks: Number(row.external_clicks),
    ctr:
      Number(row.views) > 0
        ? Math.round((Number(row.external_clicks) / Number(row.views)) * 1000) /
          10
        : null,
  }));

  const followMap = new Map<string, number>();
  for (const row of followCounts as {
    organizer_id: string;
    follows: number;
  }[]) {
    followMap.set(row.organizer_id, Number(row.follows));
  }

  const organizers = (
    orgPerf as {
      id: string;
      name: string;
      views: number;
      saves: number;
      external_clicks: number;
      active_events: number;
    }[]
  ).map((o) => ({
    id: o.id,
    name: o.name,
    views: Number(o.views),
    saves: Number(o.saves),
    externalClicks: Number(o.external_clicks),
    activeEvents: Number(o.active_events),
    follows: followMap.get(o.id) ?? 0,
  }));

  const catViewMap = new Map<string, number>();
  for (const row of categoryViews as { category: string; views: number }[]) {
    if (!row.category) continue;
    catViewMap.set(String(row.category), Number(row.views));
  }
  const filterHits = new Map<string, number>();
  for (const row of filterRows as { category: string; hits: number }[]) {
    const parts = String(row.category || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 1);
    for (const c of parts) {
      filterHits.set(c, (filterHits.get(c) ?? 0) + Number(row.hits || 0));
    }
  }
  const categoryKeys = new Set([...catViewMap.keys(), ...filterHits.keys()]);
  const categories = [...categoryKeys]
    .map((category) => ({
      category,
      views: catViewMap.get(category) ?? 0,
      filterHits: filterHits.get(category) ?? 0,
    }))
    .sort((a, b) => b.views + b.filterHits - (a.views + a.filterHits))
    .slice(0, 10);

  const recentActivity: DashboardData["recentActivity"] = [];
  for (const row of recentEditions as {
    created_at: string;
    title: string;
    tags: unknown;
    internal_notes: string | null;
  }[]) {
    const origin = originFromTagsNotes(row.tags, row.internal_notes);
    const kind =
      origin === "ai_discovery"
        ? "AI vond nieuw event"
        : origin === "admin_intake"
          ? "Admin voegde event toe"
          : origin === "user_tip"
            ? "Gebruiker gaf event door"
            : origin === "parser_refresh"
              ? "Parser vond event"
              : "Nieuw event";
    recentActivity.push({
      at: String(row.created_at),
      kind,
      title: row.title,
      detail: ORIGIN_LABELS[origin] ?? origin,
    });
  }
  for (const row of recentTips as { created_at: string; label: string }[]) {
    recentActivity.push({
      at: String(row.created_at),
      kind: "Gebruiker gaf event door",
      title: String(row.label).slice(0, 80),
      detail: "User tip",
    });
  }
  for (const row of recentScans as {
    at: string;
    name: string;
    status: string;
    new_candidates: number;
  }[]) {
    recentActivity.push({
      at: String(row.at),
      kind: `Bron ${row.name} gescand`,
      title: `${Number(row.new_candidates)} nieuwe events`,
      detail: row.status,
    });
  }
  recentActivity.sort((a, b) => (a.at < b.at ? 1 : -1));

  const ss = sourceStats[0] as {
    active_followed: number;
    new_discovered: number;
    needs_attention: number;
    manual: number;
  };
  const scanN = Number((scanSuccess[0] as { n: number } | undefined)?.n ?? 0);
  const confirmedN = Number(
    (confirmedExisting[0] as { n: number } | undefined)?.n ?? 0,
  );

  return {
    period,
    dataSince: ANALYTICS_DATA_SINCE,
    kpis: {
      uniqueVisitors: {
        value: Number(traffic.visitors),
        previous: Number(prev.visitors),
        deltaPct: pctChange(Number(traffic.visitors), Number(prev.visitors)),
      },
      uniqueVisitorsToday: Number(visitors.today),
      uniqueVisitors7d: Number(visitors.d7),
      uniqueVisitors30d: Number(visitors.d30),
      pageviews: {
        value: Number(traffic.pageviews),
        previous: Number(prev.pageviews),
        deltaPct: pctChange(Number(traffic.pageviews), Number(prev.pageviews)),
      },
      newEvents: {
        value: newEventsCount,
        previous: prevNew,
        deltaPct: pctChange(newEventsCount, prevNew),
      },
      externalClicks: {
        value: Number(traffic.external_clicks),
        previous: Number(prev.external_clicks),
        deltaPct: pctChange(
          Number(traffic.external_clicks),
          Number(prev.external_clicks),
        ),
      },
      attentionNeeded,
    },
    visitorsByDay: (
      visitorsByDay as { day: string; visitors: number; pageviews: number }[]
    ).map((r) => ({
      day: r.day,
      visitors: Number(r.visitors),
      pageviews: Number(r.pageviews),
    })),
    supply: {
      aiDiscovery: originCounts.ai_discovery,
      adminIntake: originCounts.admin_intake,
      userTip: originCounts.user_tip,
      autoPublished,
      attentionNeeded,
      rejected,
      byOrigin: Object.entries(originCounts).map(([origin, count]) => ({
        origin,
        label: ORIGIN_LABELS[origin] ?? origin,
        count,
      })),
    },
    discoveryActivity: {
      aiFound: originCounts.ai_discovery,
      confirmedExisting: confirmedN,
      newSources: Number(ss?.new_discovered ?? 0),
      autoPublished,
      attention: attentionNeeded,
      rejected,
    },
    topEvents: perf.slice(0, 10),
    lowInterestEvents: [...perf]
      .filter((e) => e.views > 0 && e.views <= 2)
      .sort((a, b) => a.views - b.views)
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        organizer: e.organizer,
        views: e.views,
      })),
    topSaved: [...perf]
      .sort((a, b) => b.saves - a.saves)
      .filter((e) => e.saves > 0)
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        organizer: e.organizer,
        saves: e.saves,
      })),
    organizers,
    categories,
    searchTerms: (searchRows as { term: string; n: number }[])
      .filter((r) => r.term)
      .map((r) => ({ term: r.term, count: Number(r.n) })),
    sources: {
      activeFollowed: Number(ss?.active_followed ?? 0),
      newDiscovered: Number(ss?.new_discovered ?? 0),
      needsAttention: Number(ss?.needs_attention ?? 0),
      manual: Number(ss?.manual ?? 0),
      successfulScans: scanN,
      top: (
        sourceTop as {
          id: string;
          name: string;
          new_events: number;
          published: number;
          last_scan_at: string | null;
        }[]
      ).map((s) => ({
        id: s.id,
        name: s.name,
        newEvents: Number(s.new_events ?? 0),
        published: Number(s.published ?? 0),
        lastScanAt: s.last_scan_at,
      })),
    },
    recentActivity: recentActivity.slice(0, 20),
    peopleGlance: (() => {
      const pc = productCounts[0] as {
        searches: number;
        event_views: number;
        saves: number;
        zero_results: number;
        card_clicks: number;
        client_errors: number;
      };
      return {
        whatTheyDo: {
          visitors: Number(traffic.visitors),
          pageViews: Number(traffic.pageviews),
          searches: Number(pc?.searches ?? 0),
          eventViews: Number(pc?.event_views ?? 0),
          saves: Number(pc?.saves ?? 0),
          externalClicks: Number(traffic.external_clicks),
        },
        whereStuck: {
          noResults: Number(pc?.zero_results ?? 0),
          openBugReports: Number(
            (openBugRows[0] as { n: number } | undefined)?.n ?? 0,
          ),
          openFeedback: Number(
            (openFeedbackRows[0] as { n: number } | undefined)?.n ?? 0,
          ),
          cardClicks: Number(pc?.card_clicks ?? 0),
          eventViewsFromCards: Number(pc?.event_views ?? 0),
        },
        errors: {
          count: Number(pc?.client_errors ?? 0),
          recent: (
            recentErrorRows as {
              at: string | Date;
              path: string;
              message: string;
            }[]
          ).map((row) => ({
            at:
              row.at instanceof Date
                ? row.at.toISOString()
                : String(row.at),
            path: pathLabel(row.path),
            message: String(row.message || "Er ging iets mis").slice(0, 120),
          })),
        },
        whereFrom: {
          landings: (landingRows as { path: string; n: number }[]).map(
            (row) => ({
              label: pathLabel(row.path),
              count: Number(row.n),
            }),
          ),
          referrers: (referrerRows as { host: string; n: number }[]).map(
            (row) => ({
              label: referrerLabel(row.host),
              count: Number(row.n),
            }),
          ),
          topPages: (topPageRows as { path: string; n: number }[]).map(
            (row) => ({
              label: pathLabel(row.path),
              count: Number(row.n),
            }),
          ),
        },
      };
    })(),
  };
}
