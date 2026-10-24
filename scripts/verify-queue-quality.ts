/**
 * Queue quality / UX safety: publishable location, display titles, origin labels.
 * Usage: npm run verify:queue-quality
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyAdminStatus } from "../lib/aanvoer/admin-status";
import { displayEventTitle } from "../lib/aanvoer/display-title";
import { evaluateEventForPublication } from "../lib/aanvoer/publication-gate";
import {
  editionLocationIsPublishable,
  isWeakLocationCity,
} from "../lib/geo-cities";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function main() {
  assert.equal(isWeakLocationCity("België"), true);
  assert.equal(isWeakLocationCity("Onbekend"), true);
  assert.equal(isWeakLocationCity("Ardennen"), true);
  assert.equal(isWeakLocationCity("Gent"), false);
  // Not a country/region placeholder, but also not in the geo catalogue yet.
  assert.equal(
    editionLocationIsPublishable({ city: "West-Vleteren" }),
    false,
  );
  ok("1. weak location labels");

  assert.equal(
    editionLocationIsPublishable({
      city: "België",
      latitude: 50.5,
      longitude: 4.5,
    }),
    false,
  );
  assert.equal(
    editionLocationIsPublishable({
      city: "Gent",
      latitude: 51.05,
      longitude: 3.72,
    }),
    true,
  );
  ok("2. publishable location requires known municipality");

  const blocked = evaluateEventForPublication({
    publicationStatus: "draft",
    startsAt: "2026-11-15T14:00:00+01:00",
    sourceUrl: "https://www.sportievesingles.be/events/demo",
    eligibilityRoute: "route_a",
    singlesOnly: true,
    singlesOriented: true,
    internalNotes: "Zwakke locatie voor “Wandelen”: Geen specifieke plaats",
    tags: ["source-refresh", "draft"],
    city: "België",
    latitude: null,
    longitude: null,
  });
  assert.equal(blocked.decision, "needs_attention");
  assert.equal(blocked.classified.readyToPublish, false);
  ok("3. gate blocks weak city + location conflict notes");

  const long =
    "Deze keer trekken we naar de prachtige Belgische Ardennen, waar de natuur zich hopelijk van haar allermooiste kant laat zien.";
  const short = displayEventTitle(long);
  assert.ok(short.length < long.length);
  assert.ok(short.length <= 72);
  assert.ok(!short.includes("hopelijk van haar allermooiste"));
  assert.equal(
    displayEventTitle("Willem I, thuis in Gent. Stadswandeling met gids."),
    "Willem I, thuis in Gent",
  );
  assert.equal(
    displayEventTitle("Samen uitwaaien in Oostduinkerke. Wandeling aan zee - 15km."),
    "Samen uitwaaien in Oostduinkerke",
  );
  ok("4. display titles shorten descriptions without inventing text");

  const cockpit = readFileSync(
    join(process.cwd(), "lib/aanvoer/cockpit-data.ts"),
    "utf8",
  );
  assert.ok(cockpit.includes('tags.includes("source-refresh")'));
  assert.ok(cockpit.includes("Automatische scan"));
  ok("5. origin resolves source-refresh → Automatische scan");

  const neon = readFileSync(
    join(process.cwd(), "lib/events/neon-store.ts"),
    "utf8",
  );
  assert.ok(neon.includes("editionLocationIsPublishable"));
  ok("6. Neon publish hard-gate uses publishable location");

  const classified = classifyAdminStatus({
    publicationStatus: "draft",
    startsAt: "2026-11-01T19:00:00+01:00",
    sourceUrl: "https://example.be/e",
    eligibilityRoute: "route_a",
    singlesOnly: true,
    singlesOriented: true,
    internalNotes: null,
    city: "Onbekend",
    latitude: 51.2,
    longitude: 4.4,
  });
  assert.equal(classified.readyToPublish, false);
  assert.equal(classified.checks.location, false);
  ok("7. Onbekend + coords is not readyToPublish");

  console.log("\nOK: queue quality verify.");
}

main();
