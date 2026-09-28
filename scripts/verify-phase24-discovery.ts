/**
 * Fase 24: Vlaamse discovery invariants (no Neon required).
 * Usage: npm run verify:phase24-discovery
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PHASE24_DRAFTS,
  PHASE24_NL_EXPANSION_NOTES,
  PHASE24_REJECTED,
  PHASE24_RESEARCHED,
  PHASE24_SOURCE_UPSERTS,
} from "../data/pilot/phase24-vlaamse-discovery";

let failed = 0;
function ok(name: string) {
  console.log(`OK  ${name}`);
}
function fail(name: string, detail: string) {
  failed += 1;
  console.error(`FAIL ${name}: ${detail}`);
}

function main() {
  assert.ok(PHASE24_RESEARCHED.length >= 8);
  ok("1. researched list present");

  assert.ok(PHASE24_REJECTED.length >= 5);
  ok("2. rejected list present (Route A/B gate)");

  assert.ok(PHASE24_DRAFTS.length >= 5 && PHASE24_DRAFTS.length <= 25);
  ok("3. drafts within 5–25 quality cap");

  const slugs = PHASE24_DRAFTS.map((d) => d.slug);
  assert.equal(slugs.length, new Set(slugs).size);
  ok("4. unique draft slugs");

  assert.ok(PHASE24_DRAFTS.every((d) => d.publicationIntent === "draft"));
  ok("5. all publicationIntent=draft (no auto-publish)");

  assert.ok(
    PHASE24_DRAFTS.every((d) => d.startDate >= "2026-09-28"),
    "future dates",
  );
  ok("6. drafts are future editions");

  assert.ok(
    PHASE24_DRAFTS.every(
      (d) =>
        d.officialUrl.startsWith("http") &&
        !d.officialUrl.includes("facebook.com/groups"),
    ),
  );
  ok("7. public evidence URLs (no private groups)");

  const regions = new Set(PHASE24_DRAFTS.map((d) => d.region));
  assert.ok(regions.has("Limburg"));
  assert.ok(regions.has("West-Vlaanderen") || regions.has("Antwerpen"));
  ok("8. covers priority gap regions (Limburg + West/Antwerpen)");

  assert.ok(
    PHASE24_DRAFTS.every(
      (d) => !d.activities.includes("speeddate" as never) && !/speeddate/i.test(d.title),
    ),
  );
  ok("9. non-speeddate focus");

  assert.ok(
    !PHASE24_DRAFTS.some((d) =>
      /wallon|liège|namur|charleroi|mons|arlon/i.test(
        `${d.city} ${d.region} ${d.slug}`,
      ),
    ),
  );
  ok("10. no Wallonië drafts");

  assert.ok(
    !PHASE24_SOURCE_UPSERTS.some((s) => /party4singles/i.test(s.name)),
  );
  ok("11. no Party4singles rework in phase24 sources");

  const importSrc = readFileSync(
    path.join(process.cwd(), "scripts/import-phase24-drafts.ts"),
    "utf8",
  );
  assert.match(importSrc, /publicationStatus:\s*"draft"/);
  assert.match(importSrc, /batch_id=phase20-discovery/);
  assert.match(importSrc, /FR phase20/);
  ok("12. import script draft-only + FR safety check");

  assert.ok(!importSrc.includes("updateEditionPublication"));
  ok("13. import does not auto-publish");

  assert.ok(PHASE24_NL_EXPANSION_NOTES.length >= 3);
  ok("14. NL expansion notes captured (no NL import)");

  const formats = PHASE24_DRAFTS.flatMap((d) => d.activities);
  assert.ok(formats.includes("eten") || formats.includes("drinken"));
  ok("15. includes dinner/drinks formats");

  if (failed > 0) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nOK: phase24 discovery verify.");
}

main();
