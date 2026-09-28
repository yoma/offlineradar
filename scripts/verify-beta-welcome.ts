/**
 * Beta welcome helpers (no browser).
 * Usage: npx tsx scripts/verify-beta-welcome.ts
 */
import assert from "node:assert/strict";
import {
  BETA_WELCOME_STORAGE_KEY,
  isBetaWelcomeEnabled,
  shouldSkipBetaWelcomePath,
} from "../lib/beta-welcome";

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

check("storage key stable", () => {
  assert.equal(BETA_WELCOME_STORAGE_KEY, "offlineradar_beta_welcome_seen_v2");
});

check("flag requires 1 (next.config defaults to 1 at build)", () => {
  const prev = process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED;
  delete process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED;
  assert.equal(isBetaWelcomeEnabled(), false);
  process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED = "1";
  assert.equal(isBetaWelcomeEnabled(), true);
  process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED = "0";
  assert.equal(isBetaWelcomeEnabled(), false);
  if (prev === undefined) delete process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED;
  else process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED = prev;
});

check("skips login/account/admin", () => {
  assert.equal(shouldSkipBetaWelcomePath("/inloggen"), true);
  assert.equal(shouldSkipBetaWelcomePath("/account"), true);
  assert.equal(shouldSkipBetaWelcomePath("/interne-events"), true);
  assert.equal(shouldSkipBetaWelcomePath("/interne-feedback"), true);
  assert.equal(shouldSkipBetaWelcomePath("/ontdek"), false);
  assert.equal(shouldSkipBetaWelcomePath("/"), false);
  assert.equal(shouldSkipBetaWelcomePath("/feedback"), false);
  assert.equal(shouldSkipBetaWelcomePath("/event/foo"), false);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: beta welcome verifies");
