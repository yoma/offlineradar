/**
 * Phase 2A quality validation (read-only / dry-run).
 * No production writes. Kill switch stays off.
 *
 * Usage: npx tsx scripts/validate-discovery-phase2a.ts
 *        node --env-file=.env.local --import tsx scripts/validate-discovery-phase2a.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  DISCOVERY_QUERY_MATRIX,
  selectDiscoveryQueries,
  type DiscoveryLanguage,
  type DiscoveryFormat,
  type DiscoveryRegionId,
} from "../data/discovery/query-matrix";
import {
  classifyDiscoveryChannel,
  isSignalOnlyChannel,
} from "../lib/discovery/channel";
import {
  DISCOVERY_SWEEP_MAX_CANDIDATES,
  DISCOVERY_SWEEP_MAX_INSERTS,
  DISCOVERY_SWEEP_MAX_QUERIES,
  isDiscoverySweepGloballyEnabled,
} from "../lib/discovery/sweep-config";
import { runDiscoverySweep } from "../lib/discovery/sweep";
import {
  normalizeCatalogSourceUrl,
} from "../lib/events/catalog-sources";
import { getEventsSql } from "../lib/events/db";
import { withAgentDiscoveredProvenance } from "../lib/discovery/agent-provenance";
import { isUserSuppliedNotes } from "../lib/discovery/user-supplied";

type RotationDay = {
  day: number;
  regions: DiscoveryRegionId[];
  languages: DiscoveryLanguage[];
  formats: DiscoveryFormat[];
  queryIds: string[];
};

function analyzeRotation(days: number): {
  poolSize: number;
  daysToCoverPoolOnce: number;
  uniqueQueryIdsSeen: number;
  coveragePct: number;
  regionCoverage: Record<string, number>;
  languageCoverage: Record<string, number>;
  formatCoverage: Record<string, number>;
  daysWithSingleRegion: number;
  daysWithSingleLanguage: number;
  sample: RotationDay[];
  assessment: string;
} {
  const pool = selectDiscoveryQueries({
    includeWallonie: false,
    maxQueries: 200,
    rotateOffset: 0,
  });
  // Full non-wallonie pool size = matrix filter
  const fullPool = DISCOVERY_QUERY_MATRIX.filter((q) => !q.wallonie);
  const seen = new Set<string>();
  const regionCoverage: Record<string, number> = {};
  const languageCoverage: Record<string, number> = {};
  const formatCoverage: Record<string, number> = {};
  let daysWithSingleRegion = 0;
  let daysWithSingleLanguage = 0;
  const sample: RotationDay[] = [];

  for (let day = 1; day <= days; day++) {
    const batch = selectDiscoveryQueries({
      includeWallonie: false,
      maxQueries: DISCOVERY_SWEEP_MAX_QUERIES,
      rotateOffset: day,
    });
    const regions = [...new Set(batch.map((q) => q.region))];
    const languages = [...new Set(batch.map((q) => q.language))];
    const formats = [...new Set(batch.map((q) => q.format))];
    for (const q of batch) {
      seen.add(q.id);
      regionCoverage[q.region] = (regionCoverage[q.region] ?? 0) + 1;
      languageCoverage[q.language] = (languageCoverage[q.language] ?? 0) + 1;
      formatCoverage[q.format] = (formatCoverage[q.format] ?? 0) + 1;
    }
    if (regions.length <= 1) daysWithSingleRegion += 1;
    if (languages.length <= 1) daysWithSingleLanguage += 1;
    if (day <= 14 || day % 30 === 0) {
      sample.push({
        day,
        regions,
        languages,
        formats,
        queryIds: batch.map((q) => q.id),
      });
    }
  }

  const daysToCoverPoolOnce = Math.ceil(
    fullPool.length / DISCOVERY_SWEEP_MAX_QUERIES,
  );
  const coveragePct = Math.round((seen.size / fullPool.length) * 100);

  let assessment =
    "GO: 6 queries/day covers the non-Wallonie matrix within roughly one week.";
  if (daysToCoverPoolOnce > 10) {
    assessment =
      "WARN: full matrix cycle takes >10 days at 6 queries/day; consider raising cap or smarter diversity.";
  }
  // Diversity issue: rotateOffset alone may keep high-priority cluster if sort is stable
  // and slice is always first 6 of rotated list — rotation does move window.
  if (daysWithSingleLanguage > days * 0.5) {
    assessment =
      "NO-GO risk: many days are single-language; rotation may under-serve FR/EN.";
  }

  return {
    poolSize: fullPool.length,
    daysToCoverPoolOnce,
    uniqueQueryIdsSeen: seen.size,
    coveragePct,
    regionCoverage,
    languageCoverage,
    formatCoverage,
    daysWithSingleRegion,
    daysWithSingleLanguage,
    sample,
    assessment,
  };
}

function estimateRuntimeBudget(input: {
  queryCount: number;
  candidateCount: number;
  providers: string[];
  elapsedMs: number;
}): {
  vercelMaxDurationSec: number;
  elapsedSec: number;
  headroomSec: number;
  withinBudget: boolean;
  notes: string[];
} {
  const vercelMaxDurationSec = 60;
  const elapsedSec = input.elapsedMs / 1000;
  const notes: string[] = [
    `Observed wall time ${elapsedSec.toFixed(1)}s for ${input.queryCount} queries / ${input.candidateCount} candidates.`,
    `Providers: ${input.providers.join(", ") || "(none)"}.`,
    `Caps: maxQueries=${DISCOVERY_SWEEP_MAX_QUERIES}, maxCandidates=${DISCOVERY_SWEEP_MAX_CANDIDATES}, maxInserts=${DISCOVERY_SWEEP_MAX_INSERTS}, concurrency=2.`,
  ];
  // Conservative theoretical upper bound (search + fetches)
  const theoretical =
    input.queryCount * 12 + // search provider timeouts
    Math.ceil(input.candidateCount / 2) * 12; // fetch concurrency 2
  notes.push(
    `Worst-case sequential timeout budget ~${theoretical}s if every call hits AbortSignal 12s (cron uses parallel search+fetch; observed is the practical signal).`,
  );
  return {
    vercelMaxDurationSec,
    elapsedSec,
    headroomSec: vercelMaxDurationSec - elapsedSec,
    withinBudget: elapsedSec < vercelMaxDurationSec * 0.85,
    notes,
  };
}

async function checkExistingCatalog(
  urls: string[],
): Promise<{
  dbAvailable: boolean;
  matches: { url: string; id: string; status: string; userSupplied: boolean }[];
}> {
  const sql = getEventsSql();
  if (!sql) return { dbAvailable: false, matches: [] };
  const matches: {
    url: string;
    id: string;
    status: string;
    userSupplied: boolean;
  }[] = [];
  for (const url of urls) {
    const normalized = normalizeCatalogSourceUrl(url);
    const rows = (await sql`
      SELECT id, status, notes FROM catalog_sources
      WHERE normalized_url = ${normalized}
      LIMIT 1
    `) as { id: string; status: string; notes: string | null }[];
    if (rows[0]) {
      matches.push({
        url,
        id: rows[0].id,
        status: rows[0].status,
        userSupplied: isUserSuppliedNotes(rows[0].notes),
      });
    }
  }
  return { dbAvailable: true, matches };
}

async function main() {
  const outDir = "/opt/cursor/artifacts";
  mkdirSync(outDir, { recursive: true });

  console.assert(
    isDiscoverySweepGloballyEnabled() === false,
    "kill switch must stay OFF during validation",
  );

  const rotation = analyzeRotation(90);
  console.log("\n=== 1. Query matrix rotation (90 days, wallonie off) ===");
  console.log(
    JSON.stringify(
      {
        poolSize: rotation.poolSize,
        maxQueriesPerDay: DISCOVERY_SWEEP_MAX_QUERIES,
        daysToCoverPoolOnce: rotation.daysToCoverPoolOnce,
        uniqueQueryIdsSeenIn90d: rotation.uniqueQueryIdsSeen,
        coveragePctIn90d: rotation.coveragePct,
        regionCoverage: rotation.regionCoverage,
        languageCoverage: rotation.languageCoverage,
        formatCoverage: rotation.formatCoverage,
        daysWithSingleRegion: rotation.daysWithSingleRegion,
        daysWithSingleLanguage: rotation.daysWithSingleLanguage,
        assessment: rotation.assessment,
        sampleFirst14Days: rotation.sample.filter((s) => s.day <= 14),
      },
      null,
      2,
    ),
  );

  // Prepared-write invariant (no DB write): agent notes + promising + refresh false intent
  const preparedNotes = withAgentDiscoveredProvenance(
    null,
    "[validation] dry-run prepare check",
  );
  const prepareInvariant = {
    statusWouldBe: "promising" as const,
    refreshEnabledWouldBe: false,
    notesHasAgentTag: Boolean(
      preparedNotes && preparedNotes.includes("discovered_by=agent"),
    ),
    notesHasUserTag: Boolean(
      preparedNotes && preparedNotes.includes("discovered_by=user"),
    ),
    killSwitch: isDiscoverySweepGloballyEnabled(),
  };
  console.log("\n=== 6. Prepare invariant (no write) ===");
  console.log(JSON.stringify(prepareInvariant, null, 2));

  // Known Source Map seeds (pilot) for offline duplicate recognition when Neon is absent.
  const knownCatalogHosts = new Map<
    string,
    { id: string; notes: string | null; status: string }
  >([
    [
      "sportievesingles.be",
      {
        id: "pilot-sportieve",
        notes: "discovered_by=user | Sportieve Singles",
        status: "active",
      },
    ],
    [
      "willyoudateme.be",
      { id: "pilot-wydm", notes: "phase20 seed", status: "active" },
    ],
    [
      "singles.be",
      { id: "pilot-singles-be", notes: "phase22 researched", status: "promising" },
    ],
  ]);

  console.log("\n=== 2–5. Live dry-run (real public search, no DB writes) ===");
  const t0 = Date.now();
  const summary = await runDiscoverySweep({
    dryRun: true,
    requireGlobalEnable: false,
    useAnthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    maxQueries: 4, // respectful limited live run
    maxCandidates: 8,
    maxInserts: 5,
    includeWallonie: false,
    rotateOffset: 12, // mid-matrix slice for diversity
    lookupExisting: async (catalogUrl) => {
      // Prefer live Neon when available.
      const live = await checkExistingCatalog([catalogUrl]);
      if (live.dbAvailable && live.matches[0]) {
        const m = live.matches[0];
        return {
          id: m.id,
          notes: m.userSupplied ? "discovered_by=user" : null,
          status: m.status,
        };
      }
      try {
        const host = new URL(catalogUrl).hostname
          .replace(/^www\./, "")
          .toLowerCase();
        return knownCatalogHosts.get(host) ?? null;
      } catch {
        return null;
      }
    },
  });
  const elapsedMs = Date.now() - t0;

  // Channel audit on accepted + rejected
  const channelAudit = {
    acceptedChannels: summary.accepted.map((a) => ({
      name: a.name,
      url: a.url,
      channel: a.channel,
      route: a.route,
      reason: a.reason,
      query: a.query,
      wouldCreate: a.created,
      dryRun: a.dryRun,
    })),
    rejectedByReason: {} as Record<string, number>,
    socialRejected: 0,
    aggregatorRejected: 0,
    ticketAcceptedAsOrganizer: 0,
  };
  for (const r of summary.rejected) {
    channelAudit.rejectedByReason[r.reason] =
      (channelAudit.rejectedByReason[r.reason] ?? 0) + 1;
    if (r.reason === "social_signal_only") channelAudit.socialRejected += 1;
    if (r.reason === "aggregator_low_priority") {
      channelAudit.aggregatorRejected += 1;
    }
  }
  for (const a of summary.accepted) {
    const ch = classifyDiscoveryChannel(a.url);
    if (ch === "ticket_platform" && a.channel === "organizer") {
      channelAudit.ticketAcceptedAsOrganizer += 1;
    }
    if (isSignalOnlyChannel(ch)) {
      channelAudit.ticketAcceptedAsOrganizer += 0; // placeholder; flag below
    }
  }
  const illegalAccepts = summary.accepted.filter((a) => {
    const ch = classifyDiscoveryChannel(a.url);
    return isSignalOnlyChannel(ch) || ch === "aggregator";
  });

  const existing = await checkExistingCatalog(
    summary.accepted.map((a) => a.url),
  );

  const falseCandidates = summary.rejected.filter((r) =>
    [
      "no_route_a_singles_signal",
      "weak_geo_for_route_a",
      "anti-pattern:",
      "social_signal_only",
      "aggregator_low_priority",
    ].some((p) => r.reason.startsWith(p) || r.reason === p),
  );

  const runtime = estimateRuntimeBudget({
    queryCount: summary.queries.length,
    candidateCount: summary.evaluated,
    providers: summary.providersUsed,
    elapsedMs,
  });

  // Anthropic cost: we don't get exact USD from API here; note usage if present
  const apiCostNote = summary.providersUsed.includes("anthropic")
    ? "Anthropic web_search used (model default Haiku-class). Exact token cost not returned by sweep summary; treat as low single-digit search uses (max_uses=4)."
    : "No Anthropic provider in this run; Bing/DDG HTML only (no API $).";

  const liveReport = {
    dryRun: summary.dryRun,
    wrote: summary.wrote,
    killSwitch: summary.globallyEnabled,
    queries: summary.queries,
    providersUsed: summary.providersUsed,
    searchHitCount: summary.searchHitCount,
    evaluated: summary.evaluated,
    acceptedCount: summary.accepted.length,
    rejectedCount: summary.rejected.length,
    falseOrFilteredCandidates: falseCandidates.length,
    skippedExisting: summary.skippedExisting,
    insertsWouldBe: summary.inserts,
    elapsedMs,
    elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
    apiCostNote,
    organizersFound: channelAudit.acceptedChannels,
    rejectedByReason: channelAudit.rejectedByReason,
    socialRejected: channelAudit.socialRejected,
    aggregatorRejected: channelAudit.aggregatorRejected,
    illegalAccepts: illegalAccepts.map((a) => a.url),
    existingCatalog: existing,
    prepareInvariant,
    runtime,
    rotationSummary: {
      poolSize: rotation.poolSize,
      daysToCoverPoolOnce: rotation.daysToCoverPoolOnce,
      coveragePctIn90d: rotation.coveragePct,
      assessment: rotation.assessment,
      languageCoverage: rotation.languageCoverage,
      regionCoverage: rotation.regionCoverage,
    },
  };

  console.log(JSON.stringify(liveReport, null, 2));

  const outPath = join(outDir, "phase2a-live-validation.json");
  writeFileSync(outPath, JSON.stringify(liveReport, null, 2));
  console.log(`\nWrote ${outPath}`);

  // Soft verdict for script exit (report decides GO/NO-GO)
  if (summary.wrote) {
    console.error("FAIL: dry-run wrote to DB");
    process.exit(2);
  }
  if (isDiscoverySweepGloballyEnabled()) {
    console.error("FAIL: kill switch is ON");
    process.exit(2);
  }
  if (illegalAccepts.length) {
    console.error("FAIL: social/aggregator incorrectly accepted");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
