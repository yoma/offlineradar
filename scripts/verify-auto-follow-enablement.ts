/**
 * Human-add paths must enable refresh_enabled when auto-followable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const follow = read("lib/aanvoer/source-follow.ts");
assert.ok(follow.includes("enableCatalogSourceAutoFollow"));
assert.ok(follow.includes("setSourceRefreshEnabled"));

const intake = read("app/interne-aanvoer/actions.ts");
assert.ok(intake.includes("enableCatalogSourceAutoFollow"));
assert.equal(
  (intake.match(/enableCatalogSourceAutoFollow/g) ?? []).length >= 2,
  true,
  "approve + saveIntakeSourceAction should both enable follow",
);

const events = read("app/interne-events/actions.ts");
assert.ok(events.includes("enableCatalogSourceAutoFollow"));

const tips = read("app/api/tips/admin/route.ts");
assert.ok(tips.includes("upsertCatalogSourceByUrl"));
assert.ok(tips.includes("enableCatalogSourceAutoFollow"));

const banner = read("components/admin/scheduled-refresh-banner.tsx");
assert.ok(banner.includes("isScheduledRefreshGloballyEnabled"));
assert.ok(banner.includes("OFFLINERADAR_SCHEDULED_REFRESH"));

assert.ok(read("app/interne-aanvoer/page.tsx").includes("ScheduledRefreshBanner"));
assert.ok(read("app/interne-events/page.tsx").includes("ScheduledRefreshBanner"));

console.log("OK: auto-follow enablement verify passed.");
