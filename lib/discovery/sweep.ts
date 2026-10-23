/**
 * Autopilot Phase 2A — bounded organizer discovery sweep.
 *
 * Flow: query matrix → web search → channel filter → fetch → Route A heuristics
 * → insert catalog_sources (promising, refresh_enabled=false, discovered_by=agent).
 *
 * Never publishes events. Never sets refresh_enabled=true. Never invents
 * discovered_by=user. Social (IG/FB) = signal only (not stored as primary).
 */

import {
  selectDiscoveryQueries,
  type DiscoveryQuery,
} from "@/data/discovery/query-matrix";
import {
  withAgentDiscoveredProvenance,
  isAgentDiscoveredNotes,
} from "@/lib/discovery/agent-provenance";
import { isUserSuppliedNotes } from "@/lib/discovery/user-supplied";
import {
  classifyDiscoveryChannel,
  discoveryChannelRank,
  isSignalOnlyChannel,
} from "@/lib/discovery/channel";
import {
  catalogUrlForDiscoveryChannel,
  discoveryDedupeKey,
} from "@/lib/discovery/canonical-url";
import {
  evaluateDiscoveryHeuristics,
  extractHtmlTitle,
  guessOrganizerName,
  htmlToTextSample,
} from "@/lib/discovery/heuristics";
import { discoverUrlsForQueries } from "@/lib/discovery/web-search";
import {
  DISCOVERY_SWEEP_FETCH_CONCURRENCY,
  DISCOVERY_SWEEP_MAX_CANDIDATES,
  DISCOVERY_SWEEP_MAX_INSERTS,
  DISCOVERY_SWEEP_MAX_QUERIES,
  isDiscoverySweepGloballyEnabled,
  isDiscoveryWallonieEnabled,
} from "@/lib/discovery/sweep-config";
import {
  normalizeCatalogSourceUrl,
  upsertCatalogSourceByUrl,
  type CatalogSourceRecord,
  type CatalogSourceType,
} from "@/lib/events/catalog-sources";
import { getEventsSql } from "@/lib/events/db";
import { setSourceRefreshEnabled } from "@/lib/source-refresh/store";
import { isTechnicalEndpointUrl } from "@/lib/aanvoer/extraction-pipeline";

export type DiscoveryReject = {
  url: string;
  reason: string;
  query?: string;
};

export type DiscoveryAccepted = {
  url: string;
  name: string;
  route: "A" | "B";
  reason: string;
  query: string;
  channel: string;
  created: boolean;
  catalogSourceId: string | null;
  dryRun: boolean;
};

export type DiscoverySweepSummary = {
  globallyEnabled: boolean;
  dryRun: boolean;
  wrote: boolean;
  queries: string[];
  providersUsed: string[];
  searchHitCount: number;
  evaluated: number;
  accepted: DiscoveryAccepted[];
  rejected: DiscoveryReject[];
  skippedExisting: number;
  inserts: number;
  updates: number;
};

export type RunDiscoverySweepOptions = {
  /** When true (default for scripts), no DB writes. Cron sets false only when enabled. */
  dryRun?: boolean;
  /** Require kill switch even for scripts when forceWrite. */
  requireGlobalEnable?: boolean;
  maxQueries?: number;
  maxCandidates?: number;
  maxInserts?: number;
  includeWallonie?: boolean;
  useAnthropic?: boolean;
  rotateOffset?: number;
  /** Injected fetch for tests. */
  fetchHtml?: (url: string) => Promise<{ ok: boolean; html: string; finalUrl: string }>;
  /** Injected search for tests. */
  search?: typeof discoverUrlsForQueries;
  /**
   * Injected existing-source lookup (tests / offline validation).
   * When omitted, uses Neon catalog_sources (exact URL + organizer host).
   */
  lookupExisting?: (
    catalogUrl: string,
  ) => Promise<{ id: string; notes: string | null; status: string } | null>;
  now?: Date;
};

async function defaultFetchHtml(
  url: string,
): Promise<{ ok: boolean; html: string; finalUrl: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DateOfflineHub-Discovery/2A; +https://dateofflinehub.be)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ok: false, html: "", finalUrl: url };
    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ctype) && ctype.length > 0) {
      return { ok: false, html: "", finalUrl: res.url || url };
    }
    const html = await res.text();
    return { ok: true, html: html.slice(0, 400_000), finalUrl: res.url || url };
  } catch {
    return { ok: false, html: "", finalUrl: url };
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function sourceTypeForChannel(
  channel: ReturnType<typeof classifyDiscoveryChannel>,
): CatalogSourceType {
  if (channel === "ticket_platform") return "ticket_platform";
  if (channel === "aggregator") return "discovery_platform";
  return "organizer";
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const now = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((now - start) / 86_400_000);
}

async function findExistingByUrl(
  officialUrl: string,
): Promise<{ id: string; notes: string | null; status: string } | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const normalized = normalizeCatalogSourceUrl(officialUrl);
  const exact = (await sql`
    SELECT id, notes, status FROM catalog_sources
    WHERE normalized_url = ${normalized}
    LIMIT 1
  `) as { id: string; notes: string | null; status: string }[];
  if (exact[0]) return exact[0];

  // Organizer origin may already exist as /kalender or another path on same host.
  let host = "";
  try {
    host = new URL(officialUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  const root = `https://${host}`;
  const rootWww = `https://www.${host}`;
  const pathPrefix = `${root}/%`;
  const pathPrefixWww = `${rootWww}/%`;
  const byHost = (await sql`
    SELECT id, notes, status FROM catalog_sources
    WHERE
      normalized_url = ${root}
      OR normalized_url = ${rootWww}
      OR normalized_url LIKE ${pathPrefix}
      OR normalized_url LIKE ${pathPrefixWww}
    ORDER BY
      CASE status
        WHEN 'active' THEN 0
        WHEN 'promising' THEN 1
        ELSE 2
      END,
      updated_at DESC
    LIMIT 1
  `) as { id: string; notes: string | null; status: string }[];
  return byHost[0] ?? null;
}

type EvalResult =
  | { kind: "reject"; reject: DiscoveryReject }
  | {
      kind: "accept";
      url: string;
      name: string;
      route: "A" | "B";
      reason: string;
      query: string;
      channel: ReturnType<typeof classifyDiscoveryChannel>;
      regions: string[];
      formats: string[];
    };

export async function runDiscoverySweep(
  options: RunDiscoverySweepOptions = {},
): Promise<DiscoverySweepSummary> {
  const dryRun = options.dryRun !== false;
  const requireGlobalEnable = options.requireGlobalEnable === true;
  const globallyEnabled = isDiscoverySweepGloballyEnabled();
  const maxQueries = options.maxQueries ?? DISCOVERY_SWEEP_MAX_QUERIES;
  const maxCandidates = options.maxCandidates ?? DISCOVERY_SWEEP_MAX_CANDIDATES;
  const maxInserts = options.maxInserts ?? DISCOVERY_SWEEP_MAX_INSERTS;
  const includeWallonie =
    options.includeWallonie ?? isDiscoveryWallonieEnabled();
  const now = options.now ?? new Date();
  const fetchHtml = options.fetchHtml ?? defaultFetchHtml;
  const search = options.search ?? discoverUrlsForQueries;
  const lookupExisting = options.lookupExisting ?? findExistingByUrl;

  const rejected: DiscoveryReject[] = [];
  const accepted: DiscoveryAccepted[] = [];
  let skippedExisting = 0;
  let inserts = 0;
  let updates = 0;

  if (requireGlobalEnable && !globallyEnabled) {
    return {
      globallyEnabled,
      dryRun: true,
      wrote: false,
      queries: [],
      providersUsed: [],
      searchHitCount: 0,
      evaluated: 0,
      accepted,
      rejected: [{ url: "", reason: "kill_switch_off" }],
      skippedExisting: 0,
      inserts: 0,
      updates: 0,
    };
  }

  const selected: DiscoveryQuery[] = selectDiscoveryQueries({
    includeWallonie,
    includeTravel: true,
    maxQueries,
    rotateOffset: options.rotateOffset ?? dayOfYear(now),
  });
  const queryStrings = selected.map((q) => q.query);

  const searchResult = await search(queryStrings, {
    useAnthropic: options.useAnthropic,
  });

  // Attach region/format from the query that produced the hit when possible.
  const queryByText = new Map(selected.map((q) => [q.query, q]));

  type Cand = {
    url: string;
    query: string;
    channel: ReturnType<typeof classifyDiscoveryChannel>;
    region: string;
    format: string;
  };

  const candidates: Cand[] = [];
  const seenHostPath = new Set<string>();

  for (const hit of searchResult.hits) {
    if (isTechnicalEndpointUrl(hit.url)) {
      rejected.push({ url: hit.url, reason: "technical_endpoint", query: hit.query });
      continue;
    }
    const channel = classifyDiscoveryChannel(hit.url);
    if (isSignalOnlyChannel(channel)) {
      rejected.push({
        url: hit.url,
        reason: "social_signal_only",
        query: hit.query,
      });
      continue;
    }
    if (channel === "aggregator") {
      rejected.push({
        url: hit.url,
        reason: "aggregator_low_priority",
        query: hit.query,
      });
      continue;
    }
    // Phase 2A = new organizers only; ticket platforms are discovery signal, not org rows.
    if (channel === "ticket_platform") {
      rejected.push({
        url: hit.url,
        reason: "ticket_not_primary_org",
        query: hit.query,
      });
      continue;
    }
    const key = discoveryDedupeKey(hit.url, channel);
    if (seenHostPath.has(key)) continue;
    seenHostPath.add(key);
    const qMeta = queryByText.get(hit.query);
    candidates.push({
      url: hit.url,
      query: hit.query,
      channel,
      region: qMeta?.region ?? "nationaal",
      format: qMeta?.format ?? "activity",
    });
  }

  candidates.sort(
    (a, b) =>
      discoveryChannelRank(a.channel) - discoveryChannelRank(b.channel) ||
      a.url.localeCompare(b.url),
  );

  const bounded = candidates.slice(0, maxCandidates);

  const evals = await mapPool(
    bounded,
    DISCOVERY_SWEEP_FETCH_CONCURRENCY,
    async (cand): Promise<EvalResult> => {
      const page = await fetchHtml(cand.url);
      if (!page.ok || !page.html) {
        return {
          kind: "reject",
          reject: { url: cand.url, reason: "fetch_failed", query: cand.query },
        };
      }
      const title = extractHtmlTitle(page.html);
      const text = htmlToTextSample(page.html);
      const verdict = evaluateDiscoveryHeuristics({
        title,
        text,
        url: page.finalUrl || cand.url,
      });
      if (!verdict.accept || !verdict.route) {
        return {
          kind: "reject",
          reject: {
            url: cand.url,
            reason: verdict.antiPattern
              ? `anti-pattern:${verdict.antiPattern}`
              : verdict.reason,
            query: cand.query,
          },
        };
      }
      let hostname = "site";
      try {
        hostname = new URL(page.finalUrl || cand.url).hostname;
      } catch {
        // ignore
      }
      const finalUrl = page.finalUrl || cand.url;
      const channel = classifyDiscoveryChannel(finalUrl);
      const catalogUrl = catalogUrlForDiscoveryChannel(finalUrl, channel);
      return {
        kind: "accept",
        url: catalogUrl,
        name: guessOrganizerName(title, hostname),
        route: verdict.route,
        reason: verdict.reason,
        query: cand.query,
        channel,
        regions: [cand.region],
        formats: [cand.format],
      };
    },
  );

  let evaluated = 0;
  const writeAllowed = !dryRun && (!requireGlobalEnable || globallyEnabled);

  for (const ev of evals) {
    evaluated += 1;
    if (ev.kind === "reject") {
      rejected.push(ev.reject);
      continue;
    }
    if (isSignalOnlyChannel(ev.channel)) {
      rejected.push({
        url: ev.url,
        reason: "social_signal_only",
        query: ev.query,
      });
      continue;
    }
    if (ev.channel === "ticket_platform" || ev.channel === "aggregator") {
      rejected.push({
        url: ev.url,
        reason:
          ev.channel === "ticket_platform"
            ? "ticket_not_primary_org"
            : "aggregator_low_priority",
        query: ev.query,
      });
      continue;
    }
    if (inserts >= maxInserts) {
      rejected.push({
        url: ev.url,
        reason: "max_inserts_reached",
        query: ev.query,
      });
      continue;
    }

    // Without DB / lookup, existing is null — treat as new (dry-run friendly).
    const existing = await lookupExisting(ev.url);

    if (existing) {
      skippedExisting += 1;
      if (isUserSuppliedNotes(existing.notes)) {
        rejected.push({
          url: ev.url,
          reason: "existing_user_supplied",
          query: ev.query,
        });
        continue;
      }
      accepted.push({
        url: ev.url,
        name: ev.name,
        route: ev.route,
        reason: ev.reason,
        query: ev.query,
        channel: ev.channel,
        created: false,
        catalogSourceId: existing.id,
        dryRun: !writeAllowed,
      });
      continue;
    }

    if (!writeAllowed) {
      accepted.push({
        url: ev.url,
        name: ev.name,
        route: ev.route,
        reason: ev.reason,
        query: ev.query,
        channel: ev.channel,
        created: true,
        catalogSourceId: null,
        dryRun: true,
      });
      inserts += 1;
      continue;
    }

    const notes = withAgentDiscoveredProvenance(
      null,
      `[discovery-sweep] query=${JSON.stringify(ev.query)} channel=${ev.channel} route=${ev.route} | ${ev.reason}`,
    );

    const result = await upsertCatalogSourceByUrl({
      name: ev.name,
      officialUrl: ev.url,
      sourceKind: "organizer_source",
      sourceType: "organizer",
      regions: ev.regions,
      formats: ev.formats,
      status: "promising",
      notes,
    });

    if (!result) {
      rejected.push({ url: ev.url, reason: "upsert_failed", query: ev.query });
      continue;
    }

    // Hard invariant: agent finds never auto-enable scheduled refresh.
    await setSourceRefreshEnabled(result.record.id, false);

    // Guard: never leave user tag on agent path; never promote status beyond promising here.
    if (isUserSuppliedNotes(result.record.notes)) {
      rejected.push({
        url: ev.url,
        reason: "refused_overwrite_user_supplied",
        query: ev.query,
      });
      continue;
    }
    if (!isAgentDiscoveredNotes(result.record.notes)) {
      // notes COALESCE may have kept old notes without agent tag on update — skip claim
    }

    if (result.created) inserts += 1;
    else updates += 1;

    accepted.push({
      url: ev.url,
      name: result.record.name,
      route: ev.route,
      reason: ev.reason,
      query: ev.query,
      channel: ev.channel,
      created: result.created,
      catalogSourceId: result.record.id,
      dryRun: false,
    });
  }

  return {
    globallyEnabled,
    dryRun: !writeAllowed,
    wrote: writeAllowed && (inserts > 0 || updates > 0),
    queries: queryStrings,
    providersUsed: searchResult.providersUsed,
    searchHitCount: searchResult.searchResultCount,
    evaluated,
    accepted,
    rejected: rejected.slice(0, 80),
    skippedExisting,
    inserts,
    updates,
  };
}

/** Public helper for verify scripts / admin: describe one accepted upsert shape. */
export function describeAgentSourceNotes(query: string, channel: string): string {
  return (
    withAgentDiscoveredProvenance(
      null,
      `[discovery-sweep] query=${JSON.stringify(query)} channel=${channel} route=A`,
    ) ?? ""
  );
}

export type { CatalogSourceRecord };
