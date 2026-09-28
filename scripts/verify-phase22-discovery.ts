/**
 * Fase 22: Party4singles + Vlaamse discovery invariants (no Neon required).
 * Usage: npm run verify:phase22-discovery
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PHASE22_ALL_EDITIONS,
  PHASE22_CHECKED_AT,
  PHASE22_DRAFTS,
  PHASE22_PUBLISH,
  PHASE22_REJECTED,
  PHASE22_RESEARCHED,
  PHASE22_SOURCE_UPSERTS,
} from "../data/pilot/phase22-party4singles-discovery";
import { normalizeCatalogSourceUrl } from "../lib/events/catalog-sources";
import { USER_SUPPLIED_TAG, isUserSuppliedNotes } from "../lib/discovery/user-supplied";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function mustInclude(rel: string, needle: string, label: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(src.includes(needle), `${label}: missing ${needle} in ${rel}`);
}

function main() {
  assert.ok(PHASE22_CHECKED_AT.startsWith("2026-09-28"));
  ok("checked-at stamp");

  const urls = PHASE22_SOURCE_UPSERTS.map((s) =>
    normalizeCatalogSourceUrl(s.officialUrl),
  );
  assert.equal(urls.length, new Set(urls).size, "source URL dedupe");
  ok("1. Party4singles source dedupe");

  const partySource = PHASE22_SOURCE_UPSERTS.find((s) => s.name === "Party4singles");
  assert.ok(partySource);
  assert.ok(isUserSuppliedNotes(partySource!.notes));
  assert.ok((partySource!.notes ?? "").includes(USER_SUPPLIED_TAG));
  assert.equal(partySource!.status, "active");
  ok("2. user provenance discovered_by=user");

  assert.equal(PHASE22_PUBLISH.city, "Lier");
  assert.equal(PHASE22_PUBLISH.region, "Antwerpen");
  assert.equal(PHASE22_PUBLISH.startDate, "2026-10-04");
  assert.equal(PHASE22_PUBLISH.startTime, "18:00");
  assert.ok(PHASE22_PUBLISH.address?.includes("Mechelsesteenweg 380/4"));
  assert.equal(PHASE22_PUBLISH.singlesOnly, false);
  assert.ok(PHASE22_PUBLISH.activities.includes("party"));
  assert.equal(PHASE22_PUBLISH.publicationIntent, "approved");
  assert.ok(PHASE22_PUBLISH.officialUrl.includes("party4singles.be"));
  ok("3-4. event mapping + singlesgericht vs singlesOnly");

  assert.ok(PHASE22_PUBLISH.reviewNotes.toLowerCase().includes("route a") || PHASE22_PUBLISH.singlesOnlyEvidence.includes("Route A"));
  ok("5. party taxonomy / Route A");

  assert.ok(PHASE22_DRAFTS.every((d) => d.publicationIntent === "draft"));
  assert.ok(PHASE22_DRAFTS.every((d) => !d.activities.includes("speeddate" as never)));
  assert.ok(PHASE22_DRAFTS.every((d) => d.startDate >= "2026-09-28"));
  assert.ok(PHASE22_ALL_EDITIONS.length <= 25);
  ok("6-8. drafts only for gaps; no FR/speeddate pad; count capped");

  assert.ok(
    PHASE22_SOURCE_UPSERTS.some((s) =>
      (s.regions ?? []).some((r) => /leuven|limburg|antwerpen|vlaanderen/i.test(r)),
    ),
  );
  ok("Vlaamse region coverage on sources");

  assert.ok(PHASE22_RESEARCHED.length >= 10);
  assert.ok(PHASE22_REJECTED.length >= 4);
  assert.ok(
    PHASE22_REJECTED.some((r) => /wallon|ardenne/i.test(r.reason)),
    "Wallonië explicitly not grown",
  );
  ok("research + rejected lists");

  mustInclude(
    "scripts/import-phase22-events.ts",
    "updateEditionPublication",
    "explicit publish path only",
  );
  mustInclude(
    "scripts/import-phase22-events.ts",
    "batch_id=phase20-discovery",
    "FR draft safety check",
  );
  mustInclude(
    "scripts/import-phase22-events.ts",
    "singlesOnly !== false",
    "Party4singles singlesOnly=false assert",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "Binnenkort",
    "Binnenkort strip intact",
  );
  mustInclude(
    "lib/upcoming.ts",
    "selectUpcomingEvents",
    "upcoming selection intact",
  );
  ok("9-12. import safety + Binnenkort static checks");

  console.log("\nOK: phase22 discovery verify.");
}

main();
