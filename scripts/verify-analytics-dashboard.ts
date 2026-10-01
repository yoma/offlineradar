/**
 * Static verify for FASE 26.18 analytics dashboard.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  canonicalizeEventName,
  ALLOWED_ANALYTICS_NAMES,
  ANALYTICS_DATA_SINCE,
} from "../lib/analytics/types";
import { resolveDashboardPeriod } from "../lib/analytics/dashboard";

function mustInclude(file: string, needle: string) {
  const full = path.join(process.cwd(), file);
  assert.ok(existsSync(full), `missing ${file}`);
  const text = readFileSync(full, "utf8");
  assert.ok(text.includes(needle), `${file} missing "${needle}"`);
}

assert.equal(canonicalizeEventName("event_opened"), "event_view");
assert.equal(canonicalizeEventName("ticket_clicked"), "external_source_click");
assert.equal(canonicalizeEventName("favorite_added"), "event_saved");
assert.ok(ALLOWED_ANALYTICS_NAMES.has("external_source_click"));
assert.equal(ANALYTICS_DATA_SINCE, "2026-10-01");

const week = resolveDashboardPeriod({ period: "7d" });
assert.equal(week.key, "7d");
assert.ok(week.end.getTime() >= week.start.getTime());

mustInclude("db/migrations/20261001_analytics_events_v1.sql", "analytics_events");
mustInclude("app/interne-dashboard/page.tsx", "loadDashboardData");
mustInclude("components/admin/interne-admin-nav.tsx", "Dashboard");
mustInclude("components/analytics/outbound-link.tsx", "external_source_click");
mustInclude("components/events/event-detail.tsx", "OutboundLink");
mustInclude("components/events/event-detail.tsx", "event_view");
mustInclude("app/api/analytics/route.ts", "isAllowlistedAdminEmail");
mustInclude("app/privacy/page.tsx", "Gebruiksstatistieken");
mustInclude("lib/analytics.ts", "sendBeacon");

console.log("OK: analytics dashboard verify passed.");
