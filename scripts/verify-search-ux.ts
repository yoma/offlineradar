/**
 * Search feed performance + loading UX invariants.
 * Usage: npx tsx scripts/verify-search-ux.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEARCH_LOADING_SUBTITLES,
  SEARCH_LOADING_TITLE,
} from "@/components/discover/search-loading";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function main() {
  assert.equal(
    SEARCH_LOADING_TITLE,
    "We zoeken passende singlesevents voor jou…",
  );
  assert.equal(SEARCH_LOADING_SUBTITLES.length, 5);
  assert.ok(
    SEARCH_LOADING_SUBTITLES.includes("We checken je regio en afstand…"),
  );
  ok("loading copy exact");

  const neon = readFileSync(
    join(process.cwd(), "lib/events/neon-store.ts"),
    "utf8",
  );
  assert.ok(neon.includes("Batched queries"));
  assert.ok(neon.includes("WHERE event_edition_id = ANY(${editionIds})"));
  assert.ok(
    neon.includes(
      "export async function listPublishedEditionBundles",
    ) && neon.includes("Promise.all(["),
  );
  ok("published feed uses batched queries");

  const discover = readFileSync(
    join(process.cwd(), "components/discover/discover-view.tsx"),
    "utf8",
  );
  assert.ok(discover.includes("history.replaceState"));
  assert.ok(discover.includes("SearchLoadingState"));
  assert.ok(!discover.includes("router.replace"));
  ok("discover filter sync avoids RSC refetch");

  const home = readFileSync(
    join(process.cwd(), "components/home/home-search.tsx"),
    "utf8",
  );
  assert.ok(home.includes("markSearchPending"));
  assert.ok(home.includes("disabled={searching}"));
  ok("home search pending + disabled submit");

  console.log("\nOK: search UX verify passed.");
}

main();
