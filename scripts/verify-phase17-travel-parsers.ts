/**
 * Fase 17: Tomeeto + Juntas refresh parsers.
 * Usage: npx tsx scripts/verify-phase17-travel-parsers.ts
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { matchCandidate, type MatchableEdition } from "../lib/source-refresh/match";
import { parseJuntasHtml } from "../lib/source-refresh/parsers/juntas";
import { parseTomeetoHtml } from "../lib/source-refresh/parsers/tomeeto";
import { REFRESH_PILOTS, isRefreshSupported } from "../lib/source-refresh/registry";
import type { EventEditionRecord } from "../types/event-catalog";
import type { RefreshNormalizedCandidate } from "../lib/source-refresh/types";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function minimalEdition(
  partial: Partial<EventEditionRecord> &
    Pick<EventEditionRecord, "id" | "title" | "startsAt" | "city">,
): EventEditionRecord {
  return {
    slug: partial.slug ?? "test",
    organizerId: null,
    seriesId: null,
    endsAt: partial.endsAt ?? null,
    timezone: "Europe/Brussels",
    venueName: null,
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
    ageRule: partial.ageRule ?? "guideline",
    eligibilityJson: null,
    category: "meet_new_people",
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
  const root = process.cwd();
  const tomeetoHtml = await readFile(
    path.join(root, "data/source-refresh/fixtures/tomeeto-sample.html"),
    "utf8",
  );
  const juntasHtml = await readFile(
    path.join(root, "data/source-refresh/fixtures/juntas-sample.html"),
    "utf8",
  );

  const now = new Date("2026-09-26T12:00:00+02:00");
  const tomeeto = parseTomeetoHtml(tomeetoHtml, now);
  assert.ok(tomeeto.candidates.length >= 10);
  ok("1. Tomeeto parser normal");

  const herve = tomeeto.candidates.find((c) =>
    c.title.includes("Heerlijk Herve") && c.minAge === 40,
  );
  assert.ok(herve);
  assert.equal(herve!.date, "2026-11-20");
  assert.equal(herve!.endsAt?.slice(0, 10), "2026-11-22");
  ok("2. Tomeeto daterange");

  assert.equal(herve!.ageRule, "strict");
  assert.equal(herve!.minAge, 40);
  assert.equal(herve!.maxAge, 55);
  ok("3. Tomeeto ageband strict");

  const shortski = tomeeto.candidates.filter((c) =>
    c.title.toLowerCase().includes("shortski"),
  );
  assert.equal(shortski.length, 2);
  assert.notEqual(shortski[0]!.externalKey, shortski[1]!.externalKey);
  ok("4. Tomeeto duplicate-age editions");

  assert.ok(tomeeto.candidates.every((c) => c.price == null || c.price > 0));
  assert.ok(herve!.price == null);
  ok("5. Tomeeto missing price stays null");

  const gran = tomeeto.candidates.find((c) =>
    c.title.includes("Gran Canaria") && c.minAge === 35,
  );
  assert.ok(gran);
  assert.equal(gran!.date, "2026-12-29");
  assert.equal(gran!.endsAt?.slice(0, 10), "2027-01-05");
  ok("Tomeeto cross-year daterange");

  const juntas = parseJuntasHtml(juntasHtml, now);
  assert.ok(juntas.candidates.length >= 5);
  ok("6. Juntas parser normal");

  const corfu = juntas.candidates.find((c) => c.title.includes("Corfu"));
  assert.ok(corfu);
  assert.equal(corfu!.availability, "sold_out");
  ok("7. Juntas sold out");

  assert.ok(juntas.candidates.every((c) => c.ageRule === "guideline"));
  assert.ok(juntas.candidates.every((c) => c.minAge === 45 && c.maxAge == null));
  ok("8. Juntas guideline age");

  const ibiza = juntas.candidates.find((c) => c.title.includes("Ibiza"));
  assert.ok(ibiza);
  assert.equal(ibiza!.date, "2026-10-08");
  assert.equal(ibiza!.endsAt?.slice(0, 10), "2026-10-15");
  ok("9. Juntas daterange");

  const costaDates = juntas.candidates.filter((c) =>
    c.title.includes("Costa de la Luz"),
  );
  assert.ok(costaDates.length >= 2);
  ok("Juntas multi departure dates → separate editions");

  const editions: MatchableEdition[] = [
    {
      organizerSlug: "tomeeto",
      sourceUrls: ["https://tomeeto.be/vakanties/weekend-voor-singles-herve"],
      edition: minimalEdition({
        id: "ed-herve",
        title: "Tomeeto — Heerlijk Herve weekend (40–55)",
        startsAt: "2026-11-20T08:00:00+02:00",
        endsAt: "2026-11-22T18:00:00+02:00",
        city: "Herve",
        minAge: 40,
        maxAge: 55,
        ageRule: "strict",
      }),
    },
    {
      organizerSlug: "juntas",
      sourceUrls: ["https://juntas.be/groepsreis/europa/spanje/ibiza"],
      edition: minimalEdition({
        id: "ed-ibiza",
        title: "Juntas — Singlereis Ibiza (45+)",
        startsAt: "2026-10-08T09:00:00+02:00",
        endsAt: "2026-10-15T18:00:00+02:00",
        city: "Ibiza",
        minAge: 45,
        maxAge: null,
        ageRule: "guideline",
        priceAmount: 1870,
        availabilityStatus: "limited",
      }),
    },
  ];

  const matchHerve = matchCandidate(herve!, editions, "tomeeto");
  assert.equal(matchHerve.editionId, "ed-herve");
  assert.ok(
    matchHerve.confidence === "exact" || matchHerve.confidence === "probable",
  );
  ok("10. existing event matching (Tomeeto)");

  const matchIbiza = matchCandidate(ibiza!, editions, "juntas");
  assert.equal(matchIbiza.editionId, "ed-ibiza");
  ok("10b. existing event matching (Juntas)");

  const unknown: RefreshNormalizedCandidate = {
    ...herve!,
    externalKey: "tomeeto:new-trip:2027-06-01:30-40",
    title: "Tomeeto — Brand new trip (30–40)",
    date: "2027-06-01",
    startsAt: "2027-06-01T08:00:00+02:00",
    endsAt: "2027-06-03T18:00:00+02:00",
    minAge: 30,
    maxAge: 40,
    officialUrl: "https://tomeeto.be/vakanties/brand-new/",
  };
  assert.equal(matchCandidate(unknown, editions, "tomeeto").confidence, "none");
  ok("11. new detection");

  assert.ok(matchIbiza.changes.some((c) => c.field === "availability"));
  ok("12. changed detection (availability)");

  // Same product URL, different departure → must not collapse onto first edition
  const algarveEarly: RefreshNormalizedCandidate = {
    ...ibiza!,
    externalKey: "juntas:14508:2026-10-31",
    title: "Juntas — Singlereis Algarve (45+)",
    date: "2026-10-31",
    startsAt: "2026-10-31T09:00:00+02:00",
    endsAt: "2026-11-07T18:00:00+02:00",
    city: "Lagos",
    officialUrl: "https://juntas.be/groepsreis/europa/portugal/algarve/",
    availability: "available",
    price: 1860,
  };
  const algarveLate: RefreshNormalizedCandidate = {
    ...algarveEarly,
    externalKey: "juntas:14508:2027-04-01",
    date: "2027-04-01",
    startsAt: "2027-04-01T09:00:00+02:00",
    endsAt: "2027-04-08T18:00:00+02:00",
  };
  const editionsWithAlgarve: MatchableEdition[] = [
    ...editions,
    {
      organizerSlug: "juntas",
      sourceUrls: ["https://juntas.be/groepsreis/europa/portugal/algarve"],
      edition: minimalEdition({
        id: "ed-algarve-2026",
        title: "Juntas — Singlereis Algarve (45+)",
        startsAt: "2026-10-31T09:00:00+02:00",
        endsAt: "2026-11-07T18:00:00+02:00",
        city: "Lagos",
        minAge: 45,
        maxAge: null,
        ageRule: "guideline",
        priceAmount: 1860,
        availabilityStatus: "available",
      }),
    },
  ];
  assert.equal(
    matchCandidate(algarveEarly, editionsWithAlgarve, "juntas").editionId,
    "ed-algarve-2026",
  );
  assert.equal(
    matchCandidate(algarveLate, editionsWithAlgarve, "juntas").confidence,
    "none",
  );
  ok("URL match also requires same start day");

  assert.ok(!REFRESH_PILOTS.some((p) => (p as { autoPublish?: boolean }).autoPublish));
  assert.ok(isRefreshSupported("18ac22ba-a921-4317-bbd0-06a6068bc372"));
  assert.ok(isRefreshSupported("b6af624e-337d-41e3-8f4f-524a152f9ae9"));
  assert.equal(
    REFRESH_PILOTS.filter((p) => p.parserKey === "tomeeto" || p.parserKey === "juntas")
      .length,
    2,
  );
  ok("13. no auto publish + pilots registered");

  console.log("\nOK: phase17 travel parsers.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
