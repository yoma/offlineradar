/**
 * Guards for controlled autopilot activation:
 * allowlist fail-closed + hard per-source draft cap.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getRefreshAutoDraftMaxPerSource,
  getRefreshAutoDraftSourceAllowlist,
  isRefreshAutoDraftAllowedForSource,
  isRefreshAutoDraftGloballyEnabled,
  REFRESH_AUTO_DRAFT_MAX_PER_SOURCE,
} from "../lib/source-refresh/auto-draft-config";
import {
  getScheduledRefreshSourceAllowlist,
  isScheduledRefreshGloballyEnabled,
} from "../lib/source-refresh/schedule-config";

const SPORTIEVE = "975fc9d7-2639-4e03-9139-a588af62b869";
const SPEEDDATEN = "de8d83b1-217b-4004-9a83-9c6378b2f764";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function main() {
  withEnv(
    {
      OFFLINERADAR_REFRESH_AUTO_DRAFT: undefined,
      OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS: undefined,
      OFFLINERADAR_REFRESH_AUTO_DRAFT_MAX_PER_SOURCE: undefined,
      OFFLINERADAR_SCHEDULED_REFRESH: undefined,
      OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS: undefined,
    },
    () => {
      assert.equal(isRefreshAutoDraftGloballyEnabled(), false);
      assert.equal(isScheduledRefreshGloballyEnabled(), false);
      assert.deepEqual(getRefreshAutoDraftSourceAllowlist(), []);
      assert.deepEqual(getScheduledRefreshSourceAllowlist(), []);
      assert.equal(isRefreshAutoDraftAllowedForSource(SPORTIEVE), false);
      assert.equal(getRefreshAutoDraftMaxPerSource(), REFRESH_AUTO_DRAFT_MAX_PER_SOURCE);
    },
  );
  console.log("ok  1. defaults OFF / fail-closed");

  withEnv(
    {
      OFFLINERADAR_REFRESH_AUTO_DRAFT: "1",
      OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS: undefined,
    },
    () => {
      assert.equal(isRefreshAutoDraftGloballyEnabled(), true);
      assert.equal(isRefreshAutoDraftAllowedForSource(SPORTIEVE), false);
      assert.equal(isRefreshAutoDraftAllowedForSource(SPEEDDATEN), false);
    },
  );
  console.log("ok  2. AUTO_DRAFT=1 without allowlist → no thorough");

  withEnv(
    {
      OFFLINERADAR_REFRESH_AUTO_DRAFT: "1",
      OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS: SPORTIEVE,
    },
    () => {
      assert.deepEqual(getRefreshAutoDraftSourceAllowlist(), [SPORTIEVE]);
      assert.equal(isRefreshAutoDraftAllowedForSource(SPORTIEVE), true);
      assert.equal(isRefreshAutoDraftAllowedForSource(SPEEDDATEN), false);
    },
  );
  console.log("ok  3. allowlist limits thorough to listed sources");

  withEnv(
    {
      OFFLINERADAR_REFRESH_AUTO_DRAFT_MAX_PER_SOURCE: "5",
    },
    () => {
      assert.equal(getRefreshAutoDraftMaxPerSource(), 5);
    },
  );
  withEnv(
    {
      OFFLINERADAR_REFRESH_AUTO_DRAFT_MAX_PER_SOURCE: "999",
    },
    () => {
      assert.equal(getRefreshAutoDraftMaxPerSource(), 50);
    },
  );
  console.log("ok  4. draft max env clamp");

  withEnv(
    {
      OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS: `${SPORTIEVE},${SPEEDDATEN}`,
    },
    () => {
      assert.deepEqual(getScheduledRefreshSourceAllowlist(), [
        SPORTIEVE,
        SPEEDDATEN,
      ]);
    },
  );
  console.log("ok  5. scheduled refresh source allowlist");

  const scheduler = readFileSync(
    path.join(process.cwd(), "lib/source-refresh/scheduler.ts"),
    "utf8",
  );
  assert.ok(scheduler.includes("isRefreshAutoDraftAllowedForSource"));
  assert.ok(scheduler.includes("getScheduledRefreshSourceAllowlist"));
  assert.ok(!scheduler.includes("isRefreshAutoDraftGloballyEnabled()"));
  console.log("ok  6. scheduler uses per-source thorough guard");

  const engine = readFileSync(
    path.join(process.cwd(), "lib/source-refresh/engine.ts"),
    "utf8",
  );
  assert.ok(engine.includes("getRefreshAutoDraftMaxPerSource"));
  assert.ok(engine.includes("draft_cap"));
  console.log("ok  7. engine enforces draft_cap");

  console.log("\nOK: auto-draft guards verify.");
}

main();
