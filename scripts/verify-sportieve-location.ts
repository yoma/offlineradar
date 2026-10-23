/**
 * Regression: Sportieve location evidence for the 10 Nakijken practice-test cases.
 * Pure / fixture-based — no DB writes, no live publish.
 */
import assert from "node:assert/strict";
import {
  extractBePostcodePlace,
  isWeakSportieveCity,
  matchSportieveEventUrl,
  resolveSportieveLocation,
} from "../lib/source-refresh/parsers/sportieve-location";
import { coordsForCity } from "../lib/geo-cities";
import { classifyAdminStatus } from "../lib/aanvoer/admin-status";
import { parseSportieveSinglesHtml } from "../lib/source-refresh/parsers/sportieve-singles";

function ok(msg: string) {
  console.log(`ok  ${msg}`);
}

/** The 10 Nakijken drafts from the first Phase 2B practice test (listing evidence). */
const NAKIJKEN_CASES: Array<{
  id: string;
  title: string;
  body: string;
  expectCity: string;
  expectKlaar: boolean;
}> = [
  {
    id: "oostduinkerke",
    title: "Samen uitwaaien in Oostduinkerke. Wandeling aan zee - 15km. / Oostduinkerke",
    body: "Oostduinkerke, Oostduinkerke, Koksijde, België De duinen en het strand van Oostduinkerke",
    expectCity: "Koksijde",
    expectKlaar: true,
  },
  {
    id: "berchem-long",
    title:
      "Ontdek de kleurrijke kant van Berchem tijdens een leuke wandeling van ongeveer 4-5 km langs verrassende streetart, gezellige straten en bijzondere plekjes.",
    body: "Bowling Stone, Berchem, Antwerpen, België",
    expectCity: "Antwerpen",
    expectKlaar: true,
  },
  {
    id: "stilte-peerdsbos",
    title: "🌳Nachtelijke stiltewandeling in het bos. 5-6km. / Melkerij Peerdsbos",
    body: "Melkerij Peerdsbos",
    expectCity: "Brasschaat",
    expectKlaar: true,
  },
  {
    id: "ename",
    title: "Erfgoedparels van Ename – op ontdekking met een gids. / Ename",
    body: "Ename, Ename, 9700 Oudenaarde, België 10 vrouwen en 6 mannen ingeschreven.",
    expectCity: "Oudenaarde",
    expectKlaar: true,
  },
  {
    id: "gerhagen",
    title: "Gerhagen, wandelen door de Poort van de Merode. 18km / Gerhagen",
    body: "Gerhagen, 3980 Tessenderlo-Ham, België 8 deelnemers ingeschreven.",
    expectCity: "Tessenderlo",
    expectKlaar: true,
  },
  {
    id: "lovenjoel",
    title: "Door het groene Lovenjoel en het Bruulbos. Wandeling 10km. / Lovenjoel",
    body: "Lovenjoel, Lovenjoel, België",
    expectCity: "Bierbeek",
    expectKlaar: true,
  },
  {
    id: "herfstkleuren-peerdsbos",
    title: "🌳Genieten van de herfstkleuren. 9-11km / Melkerij Peerdsbos",
    body: "Melkerij Peerdsbos, Bredabaan",
    expectCity: "Brasschaat",
    expectKlaar: true,
  },
  {
    id: "florenville",
    title:
      "🍂 Herfstwandeling in de valei van de Semois 🥾. 15km / 6820 Florenville, België",
    body: "6820 Florenville, België, 6820 Florenville, België",
    expectCity: "Florenville",
    expectKlaar: true,
  },
  {
    id: "wortel",
    title: "Flirten met de grens. Wortel-Kolonie. Wandeling 15km / Wortel-Kolonie",
    body: "Wortel-Kolonie, Kolonie, 2323 Hoogstraten, België 5 vrouwen en 4 mannen.",
    expectCity: "Hoogstraten",
    expectKlaar: true,
  },
  {
    id: "kelchterhoef",
    title: "Op ontdekking in het groene Kelchterhoef. 15km. / Houthalen-Helchteren",
    body: "Houthalen-Helchteren, Kelchterhoefstraat, 3530 Houthalen-Helchteren, België",
    expectCity: "Houthalen-Helchteren",
    expectKlaar: true,
  },
];

function wouldBeKlaar(city: string): boolean {
  const coords = coordsForCity(city);
  const classified = classifyAdminStatus({
    publicationStatus: "draft",
    startsAt: "2026-11-08T12:00:00+01:00",
    sourceUrl: "https://www.sportievesingles.be/kalender",
    eligibilityRoute: "route_a",
    singlesOnly: true,
    singlesOriented: true,
    city,
    venueName: null,
    tags: ["source-refresh", "draft"],
    internalNotes: null,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  });
  return classified.readyToPublish;
}

function main() {
  // Safety: België / empty stay weak
  assert.equal(isWeakSportieveCity("België"), true);
  assert.equal(isWeakSportieveCity(""), true);
  assert.equal(isWeakSportieveCity("Koksijde"), false);
  ok("1. België remains weak; Koksijde is strong");

  const conflict = resolveSportieveLocation(
    "Wandeling / Gent",
    "9700 Oudenaarde, België",
  );
  assert.equal(conflict.confirmed, false);
  assert.match(conflict.weakReason ?? "", /Conflict/i);
  ok("2. postcode vs place conflict stays unconfirmed");

  const post = extractBePostcodePlace("Ename, 9700 Oudenaarde, België");
  assert.ok(post);
  assert.equal(post!.postalCode, "9700");
  assert.equal(post!.cityFromPostcode, "Oudenaarde");
  ok("3. BE postcode extractor");

  const url = matchSportieveEventUrl(
    "Samen uitwaaien in Oostduinkerke. Wandeling aan zee - 15km. / Oostduinkerke",
    `<a href="https://www.sportievesingles.be/events/samen-uitwaaien-in-oostduinkerke-wandeling-aan-zee-15km">x</a>`,
  );
  assert.equal(
    url,
    "https://www.sportievesingles.be/events/samen-uitwaaien-in-oostduinkerke-wandeling-aan-zee-15km",
  );
  ok("4. detail URL match from listing HTML");

  let klaar = 0;
  for (const c of NAKIJKEN_CASES) {
    const loc = resolveSportieveLocation(c.title, c.body);
    assert.equal(
      loc.confirmed,
      true,
      `${c.id} should be confirmed, got ${loc.weakReason}`,
    );
    assert.equal(loc.city, c.expectCity, `${c.id} city`);
    assert.ok(coordsForCity(loc.city!), `${c.id} has geo`);
    const ready = wouldBeKlaar(loc.city!);
    assert.equal(ready, c.expectKlaar, `${c.id} klaar gate`);
    if (ready) klaar += 1;
    ok(`5.${c.id} → ${loc.city} (klaar=${ready})`);
  }

  assert.equal(klaar, 10);
  ok(`6. all 10 Nakijken cases project to Klaar (${klaar}/10)`);

  // Parser smoke: synthetic mini listing with date line + postcode body
  const html = `
  <html><body>
  Erfgoedparels van Ename – op ontdekking met een gids. / Ename
  07 nov 2026, 15:00 – 17:00
  Ename, Ename, 9700 Oudenaarde, België
  <a href="https://www.sportievesingles.be/events/erfgoedparels-van-ename-op-ontdekking-met-een-gids">detail</a>
  </body></html>`;
  const parsed = parseSportieveSinglesHtml(html);
  assert.ok(parsed.candidates.length >= 1);
  assert.equal(parsed.candidates[0]!.city, "Oudenaarde");
  assert.match(
    parsed.candidates[0]!.officialUrl,
    /sportievesingles\.be\/events\//,
  );
  ok("7. parser emits confirmed city + detail URL");

  // Country-only must not become confirmed
  const weak = resolveSportieveLocation("Boswandeling", "België");
  assert.equal(weak.confirmed, false);
  ok("8. België-only stays Nakijken");

  console.log("\nOK: sportieve location verify.");
  console.log(
    JSON.stringify(
      {
        nakijkenCases: NAKIJKEN_CASES.length,
        projectedKlaar: klaar,
        projectedStillNakijken: NAKIJKEN_CASES.length - klaar,
      },
      null,
      2,
    ),
  );
}

main();
