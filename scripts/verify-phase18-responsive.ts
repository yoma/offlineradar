/**
 * Fase 18: responsive / mobile quality static checks + taxonomy regression.
 * Live overflow is re-checked in browser after deploy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustInclude(rel: string, needle: string, label: string) {
  const src = read(rel);
  assert.ok(src.includes(needle), `${label}: missing ${needle} in ${rel}`);
}

function main() {
  // Card grid must allow shrink (root cause of mobile side-scroll).
  mustInclude(
    "components/discover/discover-view.tsx",
    "[&>*]:min-w-0",
    "discover grid shrink",
  );
  mustInclude(
    "components/discover/discover-view.tsx",
    "UpcomingStrip",
    "discover upcoming strip",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "overflow-x-auto",
    "upcoming horizontal scroll only",
  );
  mustInclude(
    "components/discover/upcoming-card.tsx",
    "min-w-0",
    "upcoming card min-w-0",
  );
  mustInclude(
    "components/discover/discover-view.tsx",
    "grid-cols-1",
    "discover explicit mobile column",
  );
  mustInclude(
    "components/events/event-card.tsx",
    "min-w-0",
    "event card min-w-0",
  );
  mustInclude(
    "components/events/event-card.tsx",
    "line-clamp-2",
    "event card title clamp",
  );
  mustInclude(
    "components/saved/saved-view.tsx",
    "[&>*]:min-w-0",
    "saved grid shrink",
  );

  // Global overflow defense (after structural fixes).
  mustInclude("app/globals.css", "overflow-x: clip", "html/body overflow clip");
  mustInclude("app/layout.tsx", "safe-area-inset-bottom", "main safe-area padding");
  mustInclude(
    "components/layout/site-nav.tsx",
    "safe-area-inset-bottom",
    "mobile nav safe-area",
  );

  // Hero search polish: balanced tracks + custom chevrons + stacked mobile.
  mustInclude(
    "components/home/home-search.tsx",
    "minmax(0,1.35fr)",
    "hero column proportions",
  );
  mustInclude(
    "components/home/home-search.tsx",
    "chevron",
    "hero field chevron prop",
  );
  mustInclude(
    "components/home/home-search.tsx",
    "Extra: voorkeuren",
    "meer-filters association copy",
  );
  mustInclude(
    "app/globals.css",
    "select.search-field-control",
    "native select appearance reset",
  );

  // Sheets / detail
  mustInclude(
    "components/filters/filter-sheet.tsx",
    "safe-area-inset-bottom",
    "filter sheet safe-area",
  );
  mustInclude(
    "components/filters/filter-sheet.tsx",
    "sm:grid-cols-4",
    "distance chips responsive",
  );
  mustInclude(
    "components/events/event-detail.tsx",
    "minmax(0,1.4fr)",
    "detail grid minmax",
  );

  // No fake-only fix: real min-w-0 present (not only body overflow).
  const globals = read("app/globals.css");
  assert.ok(
    globals.includes("min-w-0") || read("components/events/event-card.tsx").includes("min-w-0"),
    "structural min-w-0 present",
  );

  console.log("ok  structural responsive guards");

  const taxonomy = spawnSync(
    "npx",
    ["tsx", "scripts/verify-phase16-taxonomy.ts"],
    { cwd: root, encoding: "utf8", stdio: "inherit" },
  );
  assert.equal(taxonomy.status, 0, "phase16 taxonomy regression");

  const travel = spawnSync(
    "npx",
    ["tsx", "scripts/verify-phase17-travel-parsers.ts"],
    { cwd: root, encoding: "utf8", stdio: "inherit" },
  );
  assert.equal(travel.status, 0, "phase17 travel parsers regression");

  const refresh = spawnSync(
    "npx",
    ["tsx", "scripts/verify-source-refresh.ts"],
    { cwd: root, encoding: "utf8", stdio: "inherit" },
  );
  assert.equal(refresh.status, 0, "source refresh regression");

  console.log("OK: phase18 responsive + taxonomy/parser regression");
}

main();
