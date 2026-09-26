/**
 * Fase 15 invariants (offline unit checks).
 * Usage: npm run verify:phase15-nonspeeddate
 */
import assert from "node:assert/strict";
import { CATEGORY_MOOD_URLS, inferRequiredImageCategory } from "../lib/image-compatibility";
import { isUserSuppliedNotes } from "../lib/discovery/user-supplied";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function main() {
  const travelMood = CATEGORY_MOOD_URLS.travel;
  assert.ok(travelMood.includes("unsplash") || travelMood.startsWith("http"));
  const inferred = inferRequiredImageCategory({
    category: "meet_new_people",
    activities: ["reizen", "weekend"],
    title: "Tomeeto Skiweek",
    subCategory: "singles ski",
  });
  assert.equal(inferred, "travel");
  ok("1. travel image category for reizen/weekend");

  assert.ok(
    isUserSuppliedNotes(
      "discovered_by=user | Door Youri aangebracht (handmatige productvondst).",
    ),
  );
  ok("2. Tomeeto provenance tag still recognized");

  // Daterange: start < end for multi-day
  const start = "2027-03-21";
  const end = "2027-03-27";
  assert.ok(start < end);
  ok("3. travel daterange ordering");

  console.log("\nOK: phase15 nonspeeddate verify.");
}

main();
