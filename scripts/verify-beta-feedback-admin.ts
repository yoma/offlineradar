/**
 * Unit checks for beta feedback labels + mapping helpers (no Neon required).
 * Usage: npx tsx scripts/verify-beta-feedback-admin.ts
 */
import assert from "node:assert/strict";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABEL,
} from "../lib/feedback/labels";

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

check("five categories with Dutch labels", () => {
  assert.equal(FEEDBACK_CATEGORIES.length, 5);
  for (const key of FEEDBACK_CATEGORIES) {
    assert.ok(FEEDBACK_CATEGORY_LABEL[key].length > 2);
  }
});

check("three statuses with Dutch labels", () => {
  assert.deepEqual([...FEEDBACK_STATUSES], ["new", "reviewing", "done"]);
  assert.equal(FEEDBACK_STATUS_LABEL.new, "Nieuw");
  assert.equal(FEEDBACK_STATUS_LABEL.reviewing, "Bekeken");
  assert.equal(FEEDBACK_STATUS_LABEL.done, "Afgehandeld");
});

check("admin route module exists", async () => {
  const mod = await import("../app/interne-feedback/actions");
  assert.equal(typeof mod.updateFeedbackStatusAction, "function");
  assert.equal(typeof mod.updateFeedbackCategoryAction, "function");
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: beta feedback admin verifies");
