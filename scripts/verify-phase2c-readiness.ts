/**
 * Phase 2C readiness: allowlists, draft cap, pilot set, no auto-publish.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import {
  getRefreshAutoDraftMaxPerSource,
  getRefreshAutoDraftSourceAllowlist,
  isRefreshAutoDraftAllowedForSource,
} from "../lib/source-refresh/auto-draft-config";
import { getScheduledRefreshSourceAllowlist } from "../lib/source-refresh/schedule-config";
import { isDiscoverySweepGloballyEnabled } from "../lib/discovery/sweep-config";

/** Wave 2 candidates (dedicated parsers, Flanders/Brussels formats). */
export const PHASE2C_WAVE2_SOURCE_IDS = [
  "975fc9d7-2639-4e03-9139-a588af62b869", // Sportieve — wandelingen
  "de8d83b1-217b-4004-9a83-9c6378b2f764", // Speeddaten — speeddates
  "18ac22ba-a921-4317-bbd0-06a6068bc372", // Tomeeto — weekends/activiteiten
  "b6af624e-337d-41e3-8f4f-524a152f9ae9", // Juntas — singlereizen
] as const;

function main() {
  assert.equal(REFRESH_PILOTS.length, 5);
  for (const id of PHASE2C_WAVE2_SOURCE_IDS) {
    assert.ok(
      REFRESH_PILOTS.some((p) => p.catalogSourceId === id),
      `wave2 id ${id} must be a dedicated pilot`,
    );
  }
  // HopToDate stays out of wave 2 (SmartVibes overlap with Speeddaten).
  assert.ok(
    !PHASE2C_WAVE2_SOURCE_IDS.includes(
      "c2b5a9b4-75c1-4fac-8cb7-f599669c133b" as (typeof PHASE2C_WAVE2_SOURCE_IDS)[number],
    ),
  );
  console.log("ok  1. wave2 = 4 dedicated pilots; HopToDate deferred");

  const prevDraft = process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT;
  const prevIds = process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS;
  const prevSched = process.env.OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS;
  const prevDisc = process.env.OFFLINERADAR_DISCOVERY_SWEEP;
  try {
    process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT = "1";
    process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS =
      PHASE2C_WAVE2_SOURCE_IDS.join(",");
    process.env.OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS =
      PHASE2C_WAVE2_SOURCE_IDS.join(",");
    delete process.env.OFFLINERADAR_DISCOVERY_SWEEP;

    assert.equal(getRefreshAutoDraftSourceAllowlist().length, 4);
    assert.equal(getScheduledRefreshSourceAllowlist().length, 4);
    assert.equal(
      isRefreshAutoDraftAllowedForSource(PHASE2C_WAVE2_SOURCE_IDS[0]!),
      true,
    );
    assert.equal(
      isRefreshAutoDraftAllowedForSource(
        "c2b5a9b4-75c1-4fac-8cb7-f599669c133b",
      ),
      false,
    );
    assert.ok(getRefreshAutoDraftMaxPerSource() <= 10);
    assert.equal(isDiscoverySweepGloballyEnabled(), false);
  } finally {
    if (prevDraft === undefined) delete process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT;
    else process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT = prevDraft;
    if (prevIds === undefined) {
      delete process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS;
    } else process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS = prevIds;
    if (prevSched === undefined) {
      delete process.env.OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS;
    } else process.env.OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS = prevSched;
    if (prevDisc === undefined) delete process.env.OFFLINERADAR_DISCOVERY_SWEEP;
    else process.env.OFFLINERADAR_DISCOVERY_SWEEP = prevDisc;
  }
  console.log("ok  2. allowlists + draft cap + discovery default OFF");

  const cron = readFileSync(
    path.join(process.cwd(), "app/api/cron/source-refresh/route.ts"),
    "utf8",
  );
  assert.ok(cron.includes("draftedCount"));
  const sweep = readFileSync(
    path.join(process.cwd(), "lib/discovery/sweep.ts"),
    "utf8",
  );
  assert.ok(sweep.includes('status: "promising"'));
  assert.ok(sweep.includes("setSourceRefreshEnabled(result.record.id, false)"));
  assert.ok(sweep.includes("withAgentDiscoveredProvenance"));
  console.log("ok  3. cron exposes draftedCount; discovery stays non-approving");

  console.log("\nOK: phase2c readiness.");
}

main();
