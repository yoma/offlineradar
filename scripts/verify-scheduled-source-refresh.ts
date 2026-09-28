/**
 * Offline checks for Fase 23 scheduled source refresh.
 * Usage: npx tsx scripts/verify-scheduled-source-refresh.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isCronRequestAuthorized } from "../lib/source-refresh/cron-auth";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import {
  DEFAULT_REFRESH_INTERVAL_HOURS,
  isScheduledRefreshGloballyEnabled,
  SCHEDULED_REFRESH_BATCH_SIZE,
  SCHEDULED_REFRESH_CONCURRENCY,
} from "../lib/source-refresh/schedule-config";
import {
  isSourceDueForScheduledRefresh,
  type ScheduledRefreshSummary,
} from "../lib/source-refresh/scheduler";
import type { SourceScheduleState } from "../lib/source-refresh/store";

let failed = 0;
function ok(name: string) {
  console.log(`OK  ${name}`);
}
function fail(name: string, detail: string) {
  failed++;
  console.error(`FAIL ${name}: ${detail}`);
}

function fakeRequest(auth: string | null): Request {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("https://example.test/api/cron/source-refresh", {
    headers,
  });
}

function main() {
  // Allowlist: exactly 5 stable parsers, no Party4singles
  if (REFRESH_PILOTS.length !== 5) {
    fail("allowlist size", String(REFRESH_PILOTS.length));
  } else ok("allowlist has 5 stable parsers");
  const keys = REFRESH_PILOTS.map((p) => p.parserKey).sort().join(",");
  const expected = "hoptodate,juntas,speeddaten,sportieve-singles,tomeeto";
  if (keys !== expected) fail("allowlist keys", keys);
  else ok("allowlist keys match stable set");
  if (REFRESH_PILOTS.some((p) => /party4singles/i.test(p.label + p.organizerSlug))) {
    fail("party4singles", "must not be scheduled");
  } else ok("party4singles not in schedule allowlist");

  // Cadence defaults
  assert.equal(DEFAULT_REFRESH_INTERVAL_HOURS.speeddaten, 24);
  assert.equal(DEFAULT_REFRESH_INTERVAL_HOURS.hoptodate, 24);
  assert.equal(DEFAULT_REFRESH_INTERVAL_HOURS["sportieve-singles"], 48);
  assert.equal(DEFAULT_REFRESH_INTERVAL_HOURS.tomeeto, 84);
  assert.equal(DEFAULT_REFRESH_INTERVAL_HOURS.juntas, 84);
  ok("default intervals conservative");

  assert.ok(SCHEDULED_REFRESH_BATCH_SIZE <= 3);
  assert.ok(SCHEDULED_REFRESH_CONCURRENCY <= 2);
  ok("bounded batch/concurrency");

  // Global kill switch default OFF
  const prev = process.env.OFFLINERADAR_SCHEDULED_REFRESH;
  delete process.env.OFFLINERADAR_SCHEDULED_REFRESH;
  if (isScheduledRefreshGloballyEnabled()) {
    fail("kill switch default", "expected OFF");
  } else ok("global kill switch default OFF");
  process.env.OFFLINERADAR_SCHEDULED_REFRESH = "1";
  if (!isScheduledRefreshGloballyEnabled()) {
    fail("kill switch on", "expected ON when =1");
  } else ok("global kill switch ON when =1");
  if (prev === undefined) delete process.env.OFFLINERADAR_SCHEDULED_REFRESH;
  else process.env.OFFLINERADAR_SCHEDULED_REFRESH = prev;

  // Due logic
  const base: SourceScheduleState = {
    catalogSourceId: "x",
    name: "t",
    refreshEnabled: true,
    refreshIntervalHours: 24,
    lastScheduledRefreshAt: null,
    lastCheckedAt: null,
  };
  if (!isSourceDueForScheduledRefresh(base, "speeddaten")) {
    fail("due null last", "expected due");
  } else ok("due when never scheduled");

  const recent: SourceScheduleState = {
    ...base,
    lastScheduledRefreshAt: new Date().toISOString(),
  };
  if (isSourceDueForScheduledRefresh(recent, "speeddaten")) {
    fail("not due recent", "expected not due");
  } else ok("not due within interval");

  const disabled: SourceScheduleState = {
    ...base,
    refreshEnabled: false,
  };
  if (isSourceDueForScheduledRefresh(disabled, "speeddaten")) {
    fail("disabled", "expected not due");
  } else ok("disabled source not due");

  const old: SourceScheduleState = {
    ...base,
    lastScheduledRefreshAt: new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    ).toISOString(),
  };
  if (!isSourceDueForScheduledRefresh(old, "speeddaten")) {
    fail("due after interval", "expected due");
  } else ok("due after interval elapsed");

  // Cron auth
  const secretPrev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  if (isCronRequestAuthorized(fakeRequest("Bearer anything"))) {
    fail("cron auth no secret", "accepted");
  } else ok("cron rejects when CRON_SECRET missing");

  process.env.CRON_SECRET = "test-cron-secret-phase23";
  if (isCronRequestAuthorized(fakeRequest(null))) {
    fail("cron auth missing header", "accepted");
  } else ok("cron rejects missing Authorization");
  if (isCronRequestAuthorized(fakeRequest("Bearer wrong"))) {
    fail("cron auth wrong secret", "accepted");
  } else ok("cron rejects invalid secret");
  if (
    !isCronRequestAuthorized(
      fakeRequest("Bearer test-cron-secret-phase23"),
    )
  ) {
    fail("cron auth valid", "rejected");
  } else ok("cron accepts valid Bearer secret");
  if (secretPrev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secretPrev;

  // Config files present
  const vercel = JSON.parse(
    readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
  ) as { crons?: { path: string; schedule: string }[] };
  const cron = vercel.crons?.find((c) => c.path === "/api/cron/source-refresh");
  if (!cron) fail("vercel.json cron", "missing");
  else if (cron.schedule !== "0 4 * * *") {
    fail("vercel cron schedule", cron.schedule);
  } else ok("vercel.json daily 04:00 UTC cron");

  const route = readFileSync(
    path.join(process.cwd(), "app/api/cron/source-refresh/route.ts"),
    "utf8",
  );
  if (!route.includes("isCronRequestAuthorized")) {
    fail("cron route auth", "missing");
  } else ok("cron route uses auth helper");
  if (route.includes("bypassGlobalKillSwitch")) {
    fail("cron route bypass", "must not bypass kill switch");
  } else ok("cron route does not bypass kill switch");

  const engine = readFileSync(
    path.join(process.cwd(), "lib/source-refresh/engine.ts"),
    "utf8",
  );
  if (!engine.includes("triggerType")) fail("engine triggerType", "missing");
  else ok("engine accepts triggerType");

  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260928_source_refresh_schedule_v1.sql",
    ),
    "utf8",
  );
  for (const col of [
    "trigger_type",
    "refresh_enabled",
    "refresh_interval_hours",
    "last_scheduled_refresh_at",
  ]) {
    if (!migration.includes(col)) fail("migration column", col);
  }
  ok("migration has schedule columns");

  // Summary shape sanity (compile-time-ish)
  const sample: ScheduledRefreshSummary = {
    globallyEnabled: false,
    due: 0,
    attempted: 0,
    succeeded: 0,
    partial: 0,
    failed: 0,
    skipped: 5,
    outcomes: [],
  };
  assert.equal(sample.skipped, 5);
  ok("summary shape");

  // No auto-publish in apply path referenced by scheduler
  const scheduler = readFileSync(
    path.join(process.cwd(), "lib/source-refresh/scheduler.ts"),
    "utf8",
  );
  if (
    scheduler.includes("publishEvent") ||
    scheduler.includes("applyRefreshChanges")
  ) {
    fail("scheduler auto-apply", "must not call publish/apply");
  } else ok("scheduler has no auto-publish/apply");

  if (failed > 0) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nOK: scheduled source refresh verifies passed.");
}

main();
