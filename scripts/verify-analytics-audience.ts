/**
 * Offline checks for visitor analytics (source, device, aggregation).
 * Usage: npm run verify:analytics-audience
 */
import assert from "node:assert/strict";
import { aggregateAudience } from "../lib/analytics/audience";
import { classifySource, parseDevice, sourceLabel } from "../lib/analytics/visitor-context";

const IG_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; nl_BE)";
const FB_UA = "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile [FBAN/EMA;FBAV/400.0]";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

// --- source --------------------------------------------------------------
assert.equal(classifySource({ userAgent: IG_UA, referrerHost: "direct" }), "instagram", "IG in-app");
assert.equal(classifySource({ userAgent: FB_UA }), "facebook");
assert.equal(classifySource({ utmSource: "instagram", userAgent: MAC_SAFARI }), "instagram", "bio link");
assert.equal(classifySource({ utmSource: "ig" }), "instagram");
assert.equal(classifySource({ referrerHost: "l.instagram.com" }), "instagram");
assert.equal(classifySource({ referrerHost: "google.be" }), "google");
assert.equal(classifySource({ referrerHost: "www.google.com" }), "google");
assert.equal(classifySource({ referrerHost: "direct", userAgent: MAC_SAFARI }), "direct");
assert.equal(classifySource({ referrerHost: "speeddaten.be" }), "speeddaten.be");
assert.equal(sourceLabel("instagram"), "Instagram");
assert.equal(sourceLabel(null), "Rechtstreeks (of onbekend)");

// --- device --------------------------------------------------------------
assert.deepEqual(parseDevice(IG_UA), { device: "gsm", os: "iOS", browser: "Instagram-app" });
assert.deepEqual(parseDevice(MAC_SAFARI), { device: "computer", os: "macOS", browser: "Safari" });
assert.deepEqual(parseDevice(ANDROID_CHROME), { device: "gsm", os: "Android", browser: "Chrome" });
assert.equal(parseDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)").device, "tablet");

// --- aggregation -----------------------------------------------------------
const t = (iso: string) => new Date(iso);
const igMeta = { src: "instagram", device: "gsm", os: "iOS", browser: "Instagram-app", city: "Gent", country: "BE" };
const rows = [
  // Visitor A: from Instagram, two days, clicked out on day 1.
  { sid: "aaaaaaaa", day: "2026-10-27", first_at: t("2026-10-27T18:00:00Z"), last_at: t("2026-10-27T18:04:00Z"), pages: 3, clicked_out: true, first_meta: igMeta, ctx_meta: igMeta, seen_before: false },
  { sid: "aaaaaaaa", day: "2026-10-28", first_at: t("2026-10-28T18:00:00Z"), last_at: t("2026-10-28T18:00:00Z"), pages: 1, clicked_out: false, first_meta: { src: "direct" }, ctx_meta: igMeta, seen_before: false },
  // Visitor B: old data without src (referrer only), seen before the period.
  { sid: "bbbbbbbb", day: "2026-10-28", first_at: t("2026-10-28T09:00:00Z"), last_at: t("2026-10-28T09:02:00Z"), pages: 2, clicked_out: false, first_meta: { referrer_host: "google.be" }, ctx_meta: null, seen_before: true },
];
const a = aggregateAudience(rows, 2);
assert.equal(a.visitors, 2);
assert.equal(a.visits, 3);
assert.equal(a.returningVisitors, 2, "A came back on day 2, B was seen before");
assert.equal(a.newVisitors, 0);
assert.equal(a.clickedOutVisitors, 1);
assert.equal(a.excludedDevices, 2);
assert.deepEqual(
  a.sources.map((s) => s.label).sort(),
  ["Google", "Instagram"],
  "a visitor counts once, by their first visit",
);
assert.equal(a.cities.find((c) => c.label === "Gent")?.count, 1);
assert.equal(a.devices.find((d) => d.label === "Gsm")?.count, 1);
assert.equal(a.pagesPerVisit, 2);
assert.equal(a.medianVisitSeconds, 240);
assert.equal(a.byDay.find((d) => d.day === "2026-10-28")?.total, 2);
assert.equal(aggregateAudience([], 0).visitors, 0);

console.log("OK: analytics audience offline checks passed.");
