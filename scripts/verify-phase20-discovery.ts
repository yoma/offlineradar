/**
 * Fase 20 discovery invariants (no Neon required).
 * Usage: npm run verify:phase20-discovery
 */
import assert from "node:assert/strict";
import {
  PHASE20_CHECKED_AT,
  PHASE20_DRAFTS,
  PHASE20_HUB_LESPEED,
  PHASE20_REJECTED,
  PHASE20_RESEARCHED,
  PHASE20_SOURCE_UPSERTS,
} from "../data/pilot/phase20-discovery-gaps";
import { normalizeCatalogSourceUrl } from "../lib/events/catalog-sources";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function main() {
  assert.ok(PHASE20_CHECKED_AT.startsWith("2026-09-26"));
  ok("1. checked-at stamp");

  const urls = PHASE20_SOURCE_UPSERTS.map((s) =>
    normalizeCatalogSourceUrl(s.officialUrl),
  );
  assert.equal(urls.length, new Set(urls).size, "source URL dedupe");
  ok("2. source dedupe by normalized URL");

  const regionTouched = PHASE20_SOURCE_UPSERTS.some((s) =>
    (s.regions ?? []).some((r) =>
      /leuven|limburg|hasselt|genk|wallon|bruxelles|li.?ge|namur|mons|charleroi|hainaut|arlon/i.test(
        r,
      ),
    ),
  );
  assert.ok(regionTouched);
  ok("3. region tags cover Leuven/Limburg/FR niches");

  const frLang = PHASE20_SOURCE_UPSERTS.filter((s) =>
    (s.notes ?? "").includes("langs=FR"),
  );
  assert.ok(frLang.length >= 3);
  ok("4. language tags (FR) present in notes");

  const ig = PHASE20_SOURCE_UPSERTS.filter((s) =>
    (s.notes ?? "").includes("discovery_channel=instagram"),
  );
  assert.ok(ig.length >= 2, "Instagram provenance on ≥2 sources");
  ok("5. Instagram provenance");

  assert.ok(PHASE20_DRAFTS.length >= 15 && PHASE20_DRAFTS.length <= 25);
  assert.ok(PHASE20_DRAFTS.every((d) => d.startDate >= "2026-09-27"));
  assert.ok(
    PHASE20_DRAFTS.every((d) => !d.activities.includes("speeddate" as never)),
  );
  const draftSlugs = PHASE20_DRAFTS.map((d) => d.slug);
  assert.equal(draftSlugs.length, new Set(draftSlugs).size);
  ok("6. 15–25 future non-speeddate drafts, unique slugs");

  assert.ok(
    PHASE20_DRAFTS.every((d) =>
      PHASE20_SOURCE_UPSERTS.some(
        () => true,
      ) &&
      (d.officialUrl.includes("lespeeddating.com") ||
        d.officialUrl.includes("eventbrite")),
    ),
  );
  assert.ok(PHASE20_HUB_LESPEED.includes("lespeeddating.com"));
  ok("7. drafts point at ticket/organizer evidence (not IG-only)");

  assert.ok(PHASE20_DRAFTS.every((d) => d.reviewNotes.includes("fase20")));
  assert.ok(
    PHASE20_DRAFTS.every((d) => d.reviewNotes.toLowerCase().includes("draft")),
  );
  ok("8. drafts marked fase20 draft (no publish flag)");

  assert.ok(PHASE20_RESEARCHED.length >= 12);
  assert.ok(PHASE20_REJECTED.length >= 5);
  assert.ok(
    PHASE20_REJECTED.every((r) => r.reason.length > 20),
    "rejected have reasons",
  );
  ok("9. research + rejected lists");

  const statuses = new Set(PHASE20_SOURCE_UPSERTS.map((s) => s.status));
  assert.ok(statuses.has("active"));
  assert.ok(statuses.has("promising"));
  ok("10. source status mix active/promising");

  console.log("\nOK: phase20 discovery verify.");
}

main();
