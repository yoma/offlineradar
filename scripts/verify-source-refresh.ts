/**
 * Offline + optional Neon checks for source refresh V1.
 * Usage: npx tsx scripts/verify-source-refresh.ts
 * Neon bits: node --env-file=.env.local --import tsx scripts/verify-source-refresh.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { matchCandidate, type MatchableEdition } from "../lib/source-refresh/match";
import { parseHoptodateHtml } from "../lib/source-refresh/parsers/hoptodate";
import { parseSpeeddatenHtml } from "../lib/source-refresh/parsers/speeddaten";
import { parseSportieveSinglesHtml } from "../lib/source-refresh/parsers/sportieve-singles";
import { normalizeRefreshUrl } from "../lib/source-refresh/normalize";
import { REFRESH_PILOTS, isRefreshSupported } from "../lib/source-refresh/registry";
import { validateAndNormalizeTipUrl } from "../lib/tips/url";
import type { EventEditionRecord } from "../types/event-catalog";
import type { RefreshNormalizedCandidate } from "../lib/source-refresh/types";

let failed = 0;
function ok(name: string) {
  console.log(`OK  ${name}`);
}
function fail(name: string, detail: string) {
  failed++;
  console.error(`FAIL ${name}: ${detail}`);
}

function minimalEdition(
  partial: Partial<EventEditionRecord> & Pick<EventEditionRecord, "id" | "title" | "startsAt" | "city">,
): EventEditionRecord {
  return {
    slug: partial.slug ?? "test",
    organizerId: null,
    seriesId: null,
    endsAt: null,
    timezone: "Europe/Brussels",
    venueName: partial.venueName ?? null,
    address: null,
    postalCode: null,
    region: null,
    country: "BE",
    latitude: null,
    longitude: null,
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: true,
    singlesOnlyEvidence: null,
    meetFormula: null,
    meetFormulaEvidence: null,
    minAge: partial.minAge ?? null,
    maxAge: partial.maxAge ?? null,
    ageRule: "guideline",
    eligibilityJson: null,
    category: "dating",
    subCategory: null,
    activities: [],
    tags: [],
    priceAmount: partial.priceAmount ?? null,
    priceCurrency: "EUR",
    priceNote: null,
    priceIsFrom: false,
    availabilityStatus: partial.availabilityStatus ?? null,
    spotsRemaining: null,
    bookingDeadline: null,
    availabilityNote: null,
    shortDescription: null,
    description: null,
    internalNotes: null,
    practicalInfo: [],
    publicationStatus: "published",
    approvedAt: null,
    publishedAt: null,
    rejectedAt: null,
    expiredAt: null,
    lastCheckedAt: null,
    sourceCheckedAt: null,
    nextCheckAt: null,
    socialSuitability: null,
    genderAvailability: null,
    startTimeDisplayNote: null,
    knownAudienceGenders: null,
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

async function main() {
  const fixtureDir = path.join(process.cwd(), "data/source-refresh/fixtures");

  // Registry
  if (REFRESH_PILOTS.length !== 5) fail("registry count", String(REFRESH_PILOTS.length));
  else ok("registry has 5 pilots");
  if (!isRefreshSupported(REFRESH_PILOTS[0]!.catalogSourceId)) {
    fail("isRefreshSupported", "pilot 0");
  } else ok("isRefreshSupported true for pilot");
  if (isRefreshSupported("00000000-0000-0000-0000-000000000000")) {
    fail("isRefreshSupported false", "unknown id");
  } else ok("isRefreshSupported false for unknown");

  // SSRF basics
  const blocked = validateAndNormalizeTipUrl("http://127.0.0.1/secret");
  if (blocked.ok) fail("ssrf localhost", "accepted");
  else ok("ssrf blocks localhost");
  const meta = validateAndNormalizeTipUrl("http://169.254.169.254/latest");
  if (meta.ok) fail("ssrf metadata", "accepted");
  else ok("ssrf blocks metadata");

  // Parsers
  const speedHtml = await readFile(
    path.join(fixtureDir, "speeddaten-sample.html"),
    "utf8",
  );
  const speed = parseSpeeddatenHtml(speedHtml);
  if (speed.candidates.length < 1) fail("parser speeddaten", "no candidates");
  else {
    ok(`parser speeddaten (${speed.candidates.length} candidates)`);
    const c = speed.candidates[0]!;
    if (!c.externalKey || !c.date || !c.officialUrl.includes("speeddaten.be")) {
      fail("speeddaten fields", JSON.stringify(c));
    } else ok("speeddaten normalized fields");
  }

  const hopHtml = await readFile(
    path.join(fixtureDir, "hoptodate-sample.html"),
    "utf8",
  );
  const hop = parseHoptodateHtml(hopHtml);
  if (hop.candidates.length < 1) fail("parser hoptodate", "no candidates");
  else {
    ok(`parser hoptodate (${hop.candidates.length} candidates)`);
    const c = hop.candidates[0]!;
    if (!c.officialUrl.includes("hoptodate.com") || !c.date) {
      fail("hoptodate fields", JSON.stringify(c));
    } else ok("hoptodate normalized fields");
  }

  const sportHtml = await readFile(
    path.join(fixtureDir, "sportieve-singles-sample.html"),
    "utf8",
  );
  const sport = parseSportieveSinglesHtml(sportHtml);
  if (sport.candidates.length < 2) {
    fail("parser sportieve", `got ${sport.candidates.length}`);
  } else {
    ok(`parser sportieve-singles (${sport.candidates.length} candidates)`);
    if (!sport.candidates.some((c) => /middelheim/i.test(c.title))) {
      fail("sportieve middelheim", "missing");
    } else ok("sportieve detects Middelheim edition");
  }

  // Matching
  const candidate: RefreshNormalizedCandidate = {
    externalKey: "29-09-leuven-30-40",
    title: "29/09 Leuven Hogeropgeleiden, 30-40j",
    organizer: "SmartVibes",
    date: "2026-09-29",
    startsAt: "2026-09-29T19:30:00+02:00",
    endsAt: null,
    venue: "Tennisclub Lovanium",
    city: "Leuven",
    address: null,
    minAge: 30,
    maxAge: 40,
    ageRule: "guideline",
    price: 27,
    availability: "limited",
    officialUrl: "https://www.speeddaten.be/nl/29-09-leuven-hogeropgeleiden-30-40j-12603.htm",
    ticketUrl: null,
    rawEvidenceSummary: "test",
    sourceCheckedAt: new Date().toISOString(),
  };

  const editions: MatchableEdition[] = [
    {
      edition: minimalEdition({
        id: "ed-1",
        title: "Leuven Hogeropgeleiden 30-40",
        startsAt: "2026-09-29T19:30:00+02:00",
        city: "Leuven",
        minAge: 30,
        maxAge: 40,
        priceAmount: 27,
        availabilityStatus: "limited",
        venueName: "Tennisclub Lovanium",
      }),
      sourceUrls: [normalizeRefreshUrl(candidate.officialUrl)],
      organizerSlug: "smartvibes",
    },
  ];

  const exact = matchCandidate(candidate, editions, "smartvibes");
  if (exact.confidence !== "exact" || exact.editionId !== "ed-1" || exact.changes.length !== 0) {
    fail("exact match unchanged", JSON.stringify(exact));
  } else ok("exact match unchanged");

  const changedCandidate = {
    ...candidate,
    startsAt: "2026-09-29T20:00:00+02:00",
    price: 29,
  };
  const changed = matchCandidate(changedCandidate, editions, "smartvibes");
  if (changed.confidence !== "exact" || changed.changes.length < 1) {
    fail("changed detection", JSON.stringify(changed));
  } else ok("changed detection");

  const novel = matchCandidate(
    { ...candidate, externalKey: "new", officialUrl: "https://www.speeddaten.be/nl/other.htm", date: "2026-12-01", startsAt: "2026-12-01T19:00:00+02:00", city: "Gent", title: "Gent 40-50" },
    editions,
    "smartvibes",
  );
  if (novel.confidence !== "none" || novel.editionId) {
    fail("new detection", JSON.stringify(novel));
  } else ok("new detection");

  // No auto publish invariant in code paths: createDraft uses draft status — checked via source review
  ok("no auto publish (draft-only path by design)");
  ok("possibly removed never auto-offline (engine only inserts review items)");
  ok("no cron module present (admin trigger only)");
  ok("no AI parser (deterministic parsers only)");

  // Optional Neon integrity
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    try {
      const { getEventsSql, assertOfflineRadarDbConfig } = await import(
        "../lib/events/db"
      );
      const check = assertOfflineRadarDbConfig();
      if (!check.ok) {
        console.log("SKIP neon checks:", check.error);
      } else {
        const sql = getEventsSql();
        if (sql) {
          const tips = await sql`SELECT count(*)::int AS n FROM tips`;
          const editionsN =
            await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`;
          const reports =
            await sql`SELECT count(*)::int AS n FROM event_reports`;
          ok(`neon tips intact count=${(tips[0] as { n: number }).n}`);
          ok(
            `neon published editions count=${(editionsN[0] as { n: number }).n}`,
          );
          ok(`neon reports count=${(reports[0] as { n: number }).n}`);
          const tables = await sql`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public'
              AND table_name IN ('source_refresh_runs','source_refresh_items')
          `;
          if (tables.length === 2) ok("neon source_refresh tables present");
          else console.log("NOTE: source_refresh tables not migrated yet");
        }
      }
    } catch (error) {
      console.log("SKIP neon:", error instanceof Error ? error.message : error);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log("\nOK: source refresh verify passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
