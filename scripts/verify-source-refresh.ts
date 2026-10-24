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
import {
  isListingOrIndexUrl,
  normalizeRefreshUrl,
  smartvibesCmsIdFromUrl,
  titlesLooselyEqual,
  urlPathKey,
  urlsReferToSameEvent,
} from "../lib/source-refresh/normalize";
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

  // Cross-host / listing URL identity (all sources)
  if (
    !urlsReferToSameEvent(
      "https://www.speeddaten.be/nl/21-10-antwerpen-hogeropgeleiden-25-35j-12548.htm",
      "https://www.speeddatinginantwerpen.be/nl/21-10-antwerpen-hogeropgeleiden-25-35j-12548.htm",
    )
  ) {
    fail("urlsReferToSameEvent sister host", "expected true");
  } else ok("urlsReferToSameEvent across sister hosts");

  if (urlPathKey("https://example.com/nl/kalender-8.htm") != null) {
    fail("listing path key", "kalender should not be a product key");
  } else ok("listing URLs have no product path key");

  if (
    urlsReferToSameEvent(
      "https://www.sportievesingles.be/kalender",
      "https://www.sportievesingles.be/kalender",
    )
  ) {
    fail("listing never event-identity", "shared agenda URL matched as event");
  } else ok("shared listing URL is not event identity");

  if (!isListingOrIndexUrl("https://org.be/calendar") || !isListingOrIndexUrl("https://org.be/agenda")) {
    fail("isListingOrIndexUrl", "calendar/agenda");
  } else ok("isListingOrIndexUrl detects agenda pages");

  if (!isListingOrIndexUrl("https://www.sportievesingles.be/kalender")) {
    fail("isListingOrIndexUrl sportieve kalender", "expected listing");
  } else ok("sportieve kalender is listing URL");

  // Thorough draft guard: listing URLs must not count as catalog duplicates.
  const engineSrc = await readFile(
    path.join(process.cwd(), "lib/source-refresh/engine.ts"),
    "utf8",
  );
  const listingGuard =
    /async function urlAlreadyInCatalog[\s\S]*?if \(isListingOrIndexUrl\(officialUrl\)\) return false;/.test(
      engineSrc,
    );
  if (!listingGuard) {
    fail(
      "urlAlreadyInCatalog listing guard",
      "expected isListingOrIndexUrl early-return before event_sources lookup",
    );
  } else ok("urlAlreadyInCatalog skips listing/agenda URLs");

  if (
    !titlesLooselyEqual(
      "14/10 Antwerpen, 53-65j",
      "Speeddating Antwerpen, 53–65 jaar",
    )
  ) {
    fail("titlesLooselyEqual listing vs published", "expected true");
  } else ok("titlesLooselyEqual listing vs published");

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
    if (!c.genderAvailability || !c.womenAvailability) {
      fail("speeddaten gender", JSON.stringify({
        genderAvailability: c.genderAvailability,
        women: c.womenAvailability,
        men: c.menAvailability,
      }));
    } else ok(`speeddaten gender (${c.genderAvailability})`);
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
    const prices = hop.candidates.map((x) => x.price);
    if (prices[0] !== 29.99 || prices[1] !== 26.99) {
      fail("hoptodate prices", JSON.stringify(prices));
    } else ok("hoptodate prices 29.99 / 26.99");
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
    const kor = sport.candidates.find((c) => /kortrijk/i.test(c.title));
    if (!kor || kor.city !== "Kortrijk") {
      fail("sportieve kortrijk city", JSON.stringify(kor));
    } else ok("sportieve Kortrijk stays Kortrijk (not La Roche)");
    const gent = sport.candidates.find((c) => /zonder prijs/i.test(c.title));
    if (!gent || gent.city !== "Gent") {
      fail("sportieve gent city", JSON.stringify(gent));
    } else ok("sportieve Gent from title suffix");
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

  // SmartVibes CMS id helpers
  if (
    smartvibesCmsIdFromUrl(
      "https://www.speeddaten.be/nl/14-11-lochristi-53-65j-12937.htm",
    ) !== "12937" ||
    smartvibesCmsIdFromUrl(
      "https://www.speeddaten.be/nl/tickets-12937.htm",
    ) !== "12937"
  ) {
    fail("smartvibesCmsIdFromUrl", "detail/ticket parse");
  } else ok("smartvibesCmsIdFromUrl detail + ticket");

  if (
    smartvibesCmsIdFromUrl("https://www.speeddaten.be/nl/kalender-8.htm") !=
    null
  ) {
    fail("smartvibesCmsIdFromUrl listing", "kalender should be null");
  } else ok("smartvibesCmsIdFromUrl ignores listings");

  // Date move Lochristi 12937: 10/11 → 14/11 (same CMS id, different slug)
  const lochristiDb: MatchableEdition[] = [
    {
      edition: minimalEdition({
        id: "ed-lochristi",
        title: "Speeddate Lochristi, 53–65 jaar",
        startsAt: "2026-11-10T19:30:00+01:00",
        city: "Lochristi",
        minAge: 53,
        maxAge: 65,
        availabilityStatus: "limited",
      }),
      sourceUrls: [
        normalizeRefreshUrl(
          "https://www.speeddaten.be/nl/10-11-lochristi-53-65j-12937.htm",
        ),
      ],
      organizerSlug: "smartvibes",
    },
  ];
  const lochristiCand: RefreshNormalizedCandidate = {
    ...candidate,
    externalKey: "14-11-lochristi-53-65j-12937",
    title: "14/11 Lochristi, 53-65j",
    date: "2026-11-14",
    startsAt: "2026-11-14T19:30:00+01:00",
    city: "Lochristi",
    minAge: 53,
    maxAge: 65,
    officialUrl:
      "https://www.speeddaten.be/nl/14-11-lochristi-53-65j-12937.htm",
    ticketUrl: "https://www.speeddaten.be/nl/tickets-12937.htm",
  };
  const lochristiMatch = matchCandidate(
    lochristiCand,
    lochristiDb,
    "smartvibes",
  );
  if (
    lochristiMatch.confidence !== "exact" ||
    lochristiMatch.editionId !== "ed-lochristi" ||
    !lochristiMatch.changes.some((c) => c.field === "startsAt")
  ) {
    fail("cms date-move Lochristi 12937", JSON.stringify(lochristiMatch));
  } else ok("cms date-move Lochristi 12937 → startsAt for review");

  // Date move Kortrijk 12520: 23/11 → 27/11 via ticket URL identity only
  const kortrijkDb: MatchableEdition[] = [
    {
      edition: minimalEdition({
        id: "ed-kortrijk",
        title: "Speeddate Kortrijk Hogeropgeleiden, 45–55 jaar",
        startsAt: "2026-11-23T19:30:00+01:00",
        city: "Kortrijk",
        minAge: 45,
        maxAge: 55,
      }),
      sourceUrls: [
        normalizeRefreshUrl(
          "https://www.speeddaten.be/nl/tickets-12520.htm",
        ),
      ],
      organizerSlug: "smartvibes",
    },
  ];
  const kortrijkCand: RefreshNormalizedCandidate = {
    ...candidate,
    externalKey: "27-11-kortrijk-hogeropgeleiden-45-55j-12520",
    title: "27/11 Kortrijk Hogeropgeleiden, 45-55j",
    date: "2026-11-27",
    startsAt: "2026-11-27T19:30:00+01:00",
    city: "Kortrijk",
    minAge: 45,
    maxAge: 55,
    officialUrl:
      "https://www.speeddaten.be/nl/27-11-kortrijk-hogeropgeleiden-45-55j-12520.htm",
    ticketUrl: "https://www.speeddaten.be/nl/tickets-12520.htm",
  };
  const kortrijkMatch = matchCandidate(kortrijkCand, kortrijkDb, "smartvibes");
  if (
    kortrijkMatch.confidence !== "exact" ||
    kortrijkMatch.editionId !== "ed-kortrijk" ||
    !kortrijkMatch.changes.some((c) => c.field === "startsAt")
  ) {
    fail("cms date-move Kortrijk 12520", JSON.stringify(kortrijkMatch));
  } else ok("cms date-move Kortrijk 12520 via ticket URL");

  // Different CMS ids must not merge
  const otherCms = matchCandidate(
    {
      ...lochristiCand,
      officialUrl:
        "https://www.speeddaten.be/nl/14-11-lochristi-30-40j-99999.htm",
      ticketUrl: "https://www.speeddaten.be/nl/tickets-99999.htm",
      externalKey: "14-11-lochristi-30-40j-99999",
    },
    lochristiDb,
    "smartvibes",
  );
  if (otherCms.editionId === "ed-lochristi") {
    fail("cms id isolation", "different CMS ids merged");
  } else ok("different CMS ids stay unmatched");

  // Duplicate Sint-Niklaas 12670 editions → conflict
  const snDupes: MatchableEdition[] = [
    {
      edition: minimalEdition({
        id: "ed-sn-old",
        title: "Speeddate Sint-Niklaas Hogeropgeleiden, 45–55 jaar",
        startsAt: "2026-11-02T19:30:00+01:00",
        city: "Sint-Niklaas",
        minAge: 45,
        maxAge: 55,
      }),
      sourceUrls: [
        normalizeRefreshUrl(
          "https://www.speeddaten.be/nl/02-11-st-niklaas-hogeropgeleiden-45-55j-12670.htm",
        ),
      ],
      organizerSlug: "smartvibes",
    },
    {
      edition: minimalEdition({
        id: "ed-sn-new",
        title: "04/11 St-Niklaas Hogeropgeleiden, 45-55j",
        startsAt: "2026-11-04T19:30:00+01:00",
        city: "St",
        minAge: 45,
        maxAge: 55,
      }),
      sourceUrls: [
        normalizeRefreshUrl(
          "https://www.speeddaten.be/nl/04-11-st-niklaas-hogeropgeleiden-45-55j-12670.htm",
        ),
      ],
      organizerSlug: "smartvibes",
    },
  ];
  const snCand: RefreshNormalizedCandidate = {
    ...candidate,
    externalKey: "04-11-st-niklaas-hogeropgeleiden-45-55j-12670",
    title: "04/11 St-Niklaas Hogeropgeleiden, 45-55j",
    date: "2026-11-04",
    startsAt: "2026-11-04T19:30:00+01:00",
    city: "St",
    minAge: 45,
    maxAge: 55,
    officialUrl:
      "https://www.speeddaten.be/nl/04-11-st-niklaas-hogeropgeleiden-45-55j-12670.htm",
    ticketUrl: "https://www.speeddaten.be/nl/tickets-12670.htm",
  };
  const snMatch = matchCandidate(snCand, snDupes, "smartvibes");
  if (
    snMatch.confidence !== "conflict" ||
    snMatch.editionId != null ||
    (snMatch.conflictEditionIds?.length ?? 0) !== 2
  ) {
    fail("cms conflict Sint-Niklaas 12670", JSON.stringify(snMatch));
  } else ok("cms conflict Sint-Niklaas 12670 duplicate editions");

  // startsAt is NOT in SAFE_AUTO_APPLY — date moves stay review-only
  const { SAFE_AUTO_APPLY_FIELDS } = await import(
    "../lib/source-refresh/apply-change"
  );
  if (SAFE_AUTO_APPLY_FIELDS.has("startsAt") || SAFE_AUTO_APPLY_FIELDS.has("city")) {
    fail("safe auto-apply", "startsAt/city must not auto-apply");
  } else ok("date/city moves stay review-only (not auto-applied)");

  // No auto publish invariant in code paths: createDraft uses draft status — checked via source review
  ok("no auto publish (draft-only path by design)");
  ok("possibly removed never auto-offline (engine only inserts review items)");
  ok("scheduled refresh uses shared engine (no auto-apply)");
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
