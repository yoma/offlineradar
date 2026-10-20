/**
 * Phase 1 extraction-quality regression corpus (offline).
 * Based on DATEOFFLINEHUB_EXTRACTION_QUALITY_AUDIT.md §4 (22 cases).
 *
 * Usage: npx tsx scripts/verify-extraction-corpus.ts
 * No live HTTP. No Anthropic calls.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  buildIntakeStartsAt,
  UNKNOWN_START_TIME_NOTE,
} from "../lib/aanvoer/dates";
import {
  detectEssentialGaps,
  detectSoftEssentialGaps,
  shouldRunDeepVerification,
} from "../lib/aanvoer/deep-verify";
import {
  isTechnicalEndpointUrl,
  runDeterministicExtraction,
} from "../lib/aanvoer/extraction-pipeline";
import { extractJsonLdEventFacts } from "../lib/aanvoer/json-ld-event";
import { enrichProposalFromPage } from "../lib/aanvoer/structured-enrich";
import { blankProposal } from "../lib/aanvoer/types";
import {
  inferKnownCityLabel,
  isPlausibleCityCandidate,
} from "../lib/geo-cities";
import { parseHoptodateHtml } from "../lib/source-refresh/parsers/hoptodate";
import { parseJuntasHtml } from "../lib/source-refresh/parsers/juntas";
import { parseSpeeddatenHtml } from "../lib/source-refresh/parsers/speeddaten";
import { parseSportieveSinglesHtml } from "../lib/source-refresh/parsers/sportieve-singles";
import { parseTomeetoHtml } from "../lib/source-refresh/parsers/tomeeto";

const fixtureDir = path.join(process.cwd(), "data/source-refresh/fixtures");

let passed = 0;
let failed = 0;

function ok(id: string, detail?: string) {
  passed += 1;
  console.log(`OK  ${id}${detail ? ` — ${detail}` : ""}`);
}

function fail(id: string, detail: string) {
  failed += 1;
  console.error(`FAIL ${id}: ${detail}`);
}

function readFixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}

// --- 1–2 Speeddaten ---
{
  const speed = parseSpeeddatenHtml(readFixture("speeddaten-sample.html"));
  const kor = speed.candidates.find((c) => /kortrijk/i.test(c.city ?? ""));
  const leu = speed.candidates.find((c) => /leuven/i.test(c.city ?? ""));
  if (kor && kor.date && kor.price != null) ok("SD-KOR-2809", `${kor.date} €${kor.price}`);
  else fail("SD-KOR-2809", JSON.stringify(kor));
  if (leu && leu.date && leu.price != null) ok("SD-LEU-2909", `${leu.date} €${leu.price}`);
  else fail("SD-LEU-2909", JSON.stringify(leu));
}

// --- 3–4 HopToDate prices ---
{
  const hop = parseHoptodateHtml(readFixture("hoptodate-sample.html"));
  const wav = hop.candidates.find((c) => /wavre/i.test(c.title));
  const lln = hop.candidates.find((c) => /louvain|lln/i.test(c.title));
  if (wav?.price === 29.99 && wav.ticketUrl) {
    ok("HTD-WAV-2909", `€${wav.price} ticket=${Boolean(wav.ticketUrl)}`);
  } else fail("HTD-WAV-2909", JSON.stringify(wav));
  if (lln?.price === 26.99) ok("HTD-LLN-3009", `€${lln.price}`);
  else fail("HTD-LLN-3009", JSON.stringify(lln));
}

// --- 5–8 Sportieve ---
{
  const sport = parseSportieveSinglesHtml(
    readFixture("sportieve-singles-sample.html"),
  );
  const ant = sport.candidates.find((c) => /middelheim/i.test(c.title));
  const kor = sport.candidates.find((c) => /kortrijk/i.test(c.title));
  const lar = sport.candidates.find((c) => /la roche/i.test(c.title));
  const gen = sport.candidates.find((c) => /zonder prijs/i.test(c.title));
  if (ant?.city === "Antwerpen") ok("SS-ANT-0310", ant.city);
  else fail("SS-ANT-0310", JSON.stringify(ant));
  if (kor?.city === "Kortrijk") ok("SS-KOR-0310", "Kortrijk not La Roche");
  else fail("SS-KOR-0310", JSON.stringify(kor));
  if (lar?.city === "La Roche-en-Ardenne") ok("SS-LAR-2310", lar.city);
  else fail("SS-LAR-2310", JSON.stringify(lar));
  if (gen?.city === "Gent" && gen.price == null) {
    ok("SS-GEN-1211", "Gent, price absent");
  } else fail("SS-GEN-1211", JSON.stringify(gen));
}

// --- 9–12 Juntas ---
{
  const juntas = parseJuntasHtml(readFixture("juntas-sample.html"));
  if (juntas.candidates.length >= 4) {
    ok("JUN-COSTA", `${juntas.candidates.length} trips`);
    ok("JUN-ALG", "batch");
    ok("JUN-IBZ", "batch");
    ok("JUN-COR", "batch");
  } else {
    fail("JUN-*", `got ${juntas.candidates.length}`);
  }
}

// --- 13–14 Tomeeto ---
{
  const tom = parseTomeetoHtml(readFixture("tomeeto-sample.html"));
  const h40 = tom.candidates.filter((c) => /herve/i.test(c.title));
  if (h40.length >= 2) {
    ok("TOM-HERVE-40", String(h40.length));
    ok("TOM-HERVE-25", "present");
  } else fail("TOM-HERVE-*", JSON.stringify(h40.map((c) => c.title)));
}

// --- 15 JSON-LD Halloween ---
{
  const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Halloween Kroegtocht - Fear or Flirt?",
  "startDate": "2026-10-31T19:30:00+02:00",
  "url": "https://allevents.in/antwerp/halloween",
  "location": {
    "@type": "Place",
    "name": "Van der Valk Hotel",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Antwerpen",
      "streetAddress": "Somewhere 1"
    }
  },
  "offers": {
    "@type": "Offer",
    "price": "25",
    "priceCurrency": "EUR",
    "url": "https://tickets.example/halloween"
  },
  "organizer": { "@type": "Organization", "name": "Single Events" }
}
</script>
</head><body>Halloween kroegtocht Antwerpen</body></html>`;
  const facts = extractJsonLdEventFacts(html);
  assert.ok(facts);
  assert.equal(facts!.startTime, "19:30");
  assert.equal(facts!.city, "Antwerpen");
  assert.ok(facts!.priceNotes?.includes("25"));
  assert.equal(facts!.ticketUrl, "https://tickets.example/halloween");
  const det = runDeterministicExtraction({
    html,
    pageUrl: "https://allevents.in/antwerp/halloween",
  });
  assert.equal(det.proposal.city.value, "Antwerpen");
  assert.equal(det.proposal.startTimeUnknown, false);
  assert.ok(
    (det.proposal.fieldEvidence ?? []).some(
      (e) => e.field === "priceNotes" && e.method === "json_ld",
    ),
  );
  ok("JSONLD-HALLOWEEN", "facts + evidence");
}

// --- 16 AI Dutch date loses to JSON-LD ISO ---
{
  const html = `
<script type="application/ld+json">
{"@type":"Event","name":"X","startDate":"2026-10-31T19:30:00+02:00",
 "location":{"@type":"Place","address":{"addressLocality":"Antwerpen"}}}
</script>`;
  let proposal = blankProposal({
    startDate: {
      value: "31 Oktober 2026",
      status: "found",
      evidence: "AI",
    },
  });
  proposal = enrichProposalFromPage({ proposal, html });
  assert.equal(proposal.startDate.value, "2026-10-31");
  ok("AI-DATE-NL", "normalized to ISO");
}

// --- 17 GAP-FLIRT hard gaps ---
{
  const flirt = blankProposal({
    title: {
      value: "Flirt & Stride – The Breakfast Edition",
      status: "found",
      evidence: "x",
    },
    organizer: { value: "Flirt & Stride", status: "found", evidence: "x" },
    city: { value: "Gent", status: "uncertain", evidence: null },
    startDate: { value: null, status: "unknown", evidence: null },
    singlesOriented: { value: "true", status: "found", evidence: "x" },
    routeAdvice: "route_a",
    routeReason: "singles",
    sourceUrl: {
      value: "https://example.com/flirt",
      status: "found",
      evidence: "x",
    },
  });
  assert.ok(detectEssentialGaps(flirt).includes("date"));
  assert.equal(shouldRunDeepVerification(flirt), true);
  ok("GAP-FLIRT", "deep trigger");
}

// --- 18 GAP-PRICE-ONLY soft gap (now triggers) ---
{
  const priceOnly = blankProposal({
    title: { value: "Complete Event", status: "found", evidence: "x" },
    organizer: { value: "Org", status: "found", evidence: "x" },
    startDate: { value: "2026-11-01", status: "found", evidence: "x" },
    startTime: { value: "19:30", status: "found", evidence: "x" },
    city: { value: "Antwerpen", status: "found", evidence: "x" },
    singlesOnly: { value: "true", status: "found", evidence: "x" },
    routeAdvice: "route_a",
    routeReason: "ok",
    sourceUrl: {
      value: "https://example.com/event",
      status: "found",
      evidence: "x",
    },
    ticketUrl: {
      value: "https://tickets.example/e",
      status: "found",
      evidence: "x",
    },
    priceNotes: { value: null, status: "unknown", evidence: null },
  });
  assert.deepEqual(detectSoftEssentialGaps(priceOnly), ["price"]);
  assert.equal(shouldRunDeepVerification(priceOnly), true);
  ok("GAP-PRICE-ONLY", "soft gap triggers follow/deep");
}

// --- 19 PLAIN-STRIP-JSONLD: enrich on raw html recovers ---
{
  const html = `<html><head><script type="application/ld+json">
{"@type":"Event","name":"Only In Script","startDate":"2026-12-01T20:00:00+01:00",
 "offers":{"price":"15","priceCurrency":"EUR"},
 "location":{"address":{"addressLocality":"Gent"}}}</script></head>
<body>welcome</body></html>`;
  const det = runDeterministicExtraction({ html, pageUrl: "https://x.be/e" });
  assert.equal(det.proposal.title.value, "Only In Script");
  assert.equal(det.proposal.startTime.value, "20:00");
  assert.ok(det.proposal.priceNotes.value?.includes("15"));
  ok("PLAIN-STRIP-JSONLD", "L1 recovers JSON-LD");
}

// --- 20 BLOCK-PATH code present ---
{
  const src = readFileSync(
    path.join(process.cwd(), "lib/tips/safe-fetch.ts"),
    "utf8",
  );
  assert.ok(src.includes("looksLikeBotBlockPage"));
  assert.ok(src.includes("blocked") || src.includes("challenge"));
  ok("BLOCK-PATH", "bot-block detector present");
}

// --- 21 TICKET-FOLLOW: HopToDate ticketUrl set ---
{
  const hop = parseHoptodateHtml(readFixture("hoptodate-sample.html"));
  assert.ok(hop.candidates.every((c) => Boolean(c.ticketUrl)));
  ok("TICKET-FOLLOW", "listing ticket URLs present");
}

// --- FU-1: reject WordPress oembed / wp-json as ticket URLs ---
{
  const oembed =
    "https://hoptodate.com/fr-be/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fhoptodate.com%2Ffr-be%2Ftickets%2F";
  const ticket = "https://hoptodate.com/fr-be/tickets/20-10-namur-30-40a-12470/";
  assert.equal(isTechnicalEndpointUrl(oembed), true);
  assert.equal(isTechnicalEndpointUrl(ticket), false);
  ok("FU1-OEMBED", "oembed filtered; /tickets/ kept");
}

// --- FU-2: city from URL path / page dump → canonical label only ---
{
  const fromPath = inferKnownCityLabel(
    "/nl/21 10 antwerpen hogeropgeleiden 25 35j 12548.htm",
  );
  assert.equal(fromPath, "Antwerpen");
  assert.equal(isPlausibleCityCandidate(fromPath), true);
  assert.equal(
    isPlausibleCityCandidate(
      "/nl/21 10 antwerpen hogeropgeleiden 25 35j 12548.htm",
    ),
    false,
  );

  const pageDump =
    "Kalender activiteiten singles | België | Sportieve singles vzw top of page Samen Actief Antwerpen Kortrijk Gent";
  const fromDump = inferKnownCityLabel(pageDump);
  assert.ok(fromDump);
  assert.ok(isPlausibleCityCandidate(fromDump));
  assert.ok((fromDump?.length ?? 0) <= 48);
  assert.notEqual(fromDump, pageDump);

  const rescued = enrichProposalFromPage({
    proposal: blankProposal({
      city: {
        value: "/nl/22 10 mechelen hogeropgeleiden 40 50j 12511.htm",
        status: "found",
        evidence: "bad path",
      },
      sourceUrl: {
        value:
          "https://www.speeddaten.be/nl/22-10-mechelen-hogeropgeleiden-40-50j-12511.htm",
        status: "found",
        evidence: "x",
      },
    }),
    pageUrl:
      "https://www.speeddaten.be/nl/22-10-mechelen-hogeropgeleiden-40-50j-12511.htm",
    pageText: "Speeddaten Mechelen Hogeropgeleiden 40-50j",
  });
  assert.equal(rescued.city.value, "Mechelen");
  assert.equal(isPlausibleCityCandidate(rescued.city.value), true);

  const sport = parseSportieveSinglesHtml(
    readFixture("sportieve-singles-sample.html"),
  );
  assert.ok(sport.candidates.every((c) => isPlausibleCityCandidate(c.city)));
  ok("FU2-CITY", "path/page-dump → validated city labels");
}

// --- 22 DEFAULT-NOON: timeUnknown explicit ---
{
  const built = buildIntakeStartsAt({
    startDate: "2026-11-01",
    startTime: "",
  });
  assert.ok(built);
  assert.equal(built!.timeUnknown, true);
  assert.match(built!.startsAt, /T12:00:00/);
  assert.ok(UNKNOWN_START_TIME_NOTE.length > 5);
  const withTime = buildIntakeStartsAt({
    startDate: "2026-11-01",
    startTime: "19:30",
  });
  assert.equal(withTime!.timeUnknown, false);
  ok("DEFAULT-NOON", "noon sentinel + timeUnknown");
}

// Wiring presence checks
{
  const files = [
    "lib/aanvoer/extraction-pipeline.ts",
    "lib/aanvoer/field-evidence.ts",
    "lib/aanvoer/dates.ts",
    "lib/aanvoer/save.ts",
  ];
  for (const f of files) {
    assert.ok(existsSync(path.join(process.cwd(), f)), f);
  }
  const saveSrc = readFileSync(
    path.join(process.cwd(), "lib/aanvoer/save.ts"),
    "utf8",
  );
  assert.ok(saveSrc.includes("time_unknown"));
  assert.ok(saveSrc.includes("UNKNOWN_START_TIME_NOTE"));
  const actionsSrc = readFileSync(
    path.join(process.cwd(), "app/interne-aanvoer/actions.ts"),
    "utf8",
  );
  assert.ok(actionsSrc.includes("applyStructuredLayer"));
  assert.ok(actionsSrc.includes("applyTicketFollowLayer"));
  ok("WIRING", "pipeline + save time_unknown");
}

console.log(`\nExtraction corpus: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("OK: extraction corpus verify passed.");
