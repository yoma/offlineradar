/**
 * Results split: events outside their guideline age go to a separate block.
 * Usage: npx tsx scripts/verify-guideline-split.ts
 */
import assert from "node:assert/strict";
import { buildMockEvents } from "../data/events";
import {
  isOutsideGuidelineAge,
  matchingEvents,
  splitByGuidelineAge,
} from "../lib/filters";
import { defaultSearchState } from "../lib/search-state";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

const now = new Date("2026-10-01T10:00:00+02:00");
const events = buildMockEvents(now);

for (const age of [22, 35, 50, 70]) {
  const state = {
    ...defaultSearchState(),
    age,
    maxDistanceKm: 100,
    when: "any" as const,
  };
  const { visible } = matchingEvents(events, state, now);
  const { fitting, outsideGuideline } = splitByGuidelineAge(visible);

  assert.equal(fitting.length + outsideGuideline.length, visible.length);
  assert.ok(
    outsideGuideline.every(
      (e) =>
        e.participation.status === "guideline" &&
        e.participation.inRange === false,
    ),
  );
  assert.ok(fitting.every((e) => !isOutsideGuidelineAge(e)));
  assert.ok(
    fitting.every((e) => e.participation.status !== "ineligible"),
    "strict ineligible events stay hidden",
  );
  ok(
    `leeftijd ${age}: ${fitting.length} passend, ${outsideGuideline.length} buiten richtleeftijd`,
  );
}

const noAge = splitByGuidelineAge(
  matchingEvents(
    events,
    { ...defaultSearchState(), maxDistanceKm: 100, when: "any" },
    now,
  ).visible,
);
assert.equal(noAge.outsideGuideline.length, 0);
ok("zonder leeftijd: niets in het blok buiten richtleeftijd");
