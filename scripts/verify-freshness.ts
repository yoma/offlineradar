/**
 * Freshness formatting + resolver unit tests (no Neon).
 * Usage: npx tsx scripts/verify-freshness.ts
 */
import assert from "node:assert/strict";
import {
  formatFreshness,
  formatFreshnessDetail,
  resolveSourceVerifiedAt,
} from "../lib/freshness";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (error) {
    failed++;
    console.error(
      `FAIL ${name}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

const now = new Date("2026-09-28T15:00:00.000Z");

check("never uses createdAt — only real check fields", () => {
  assert.equal(
    resolveSourceVerifiedAt({
      sourceCheckedAt: null,
      lastCheckedAt: null,
    }),
    null,
  );
});

check("prefers newer source_checked_at", () => {
  const resolved = resolveSourceVerifiedAt({
    sourceCheckedAt: "2026-09-28T12:00:00.000Z",
    lastCheckedAt: "2026-09-26T12:00:00.000Z",
  });
  assert.equal(resolved, "2026-09-28T12:00:00.000Z");
});

check("public path ignores import last_checked alone", () => {
  // map-to-consumer passes lastCheckedAt: null — only source_checked_at counts.
  assert.equal(
    resolveSourceVerifiedAt({
      sourceCheckedAt: null,
      lastCheckedAt: null,
    }),
    null,
  );
});

check("today label", () => {
  const f = formatFreshness("2026-09-28T10:00:00.000Z", now);
  assert.equal(f.cardLabel, "Vandaag gecontroleerd");
  assert.equal(f.tone, "fresh");
});

check("yesterday label", () => {
  const f = formatFreshness("2026-09-27T10:00:00.000Z", now);
  assert.equal(f.cardLabel, "Gisteren gecontroleerd");
});

check("2-day label", () => {
  const f = formatFreshness("2026-09-26T10:00:00.000Z", now);
  assert.equal(f.cardLabel, "2 dagen geleden gecontroleerd");
});

check("7+ day label uses date", () => {
  const f = formatFreshness("2026-09-20T10:00:00.000Z", now);
  assert.match(f.cardLabel ?? "", /Laatst gecontroleerd op/);
});

check("unknown hides on cards", () => {
  const f = formatFreshness(null, now);
  assert.equal(f.cardLabel, null);
  assert.equal(f.tone, "unknown");
});

check("detail unknown is transparent", () => {
  const f = formatFreshnessDetail(null, now);
  assert.match(f.label, /onbekend/i);
});

check("detail uses broncontrole wording", () => {
  const f = formatFreshnessDetail("2026-09-28T10:00:00.000Z", now);
  assert.match(f.label, /Laatste broncontrole/);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: freshness verifies");
