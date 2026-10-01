/**
 * FASE 26.19 — semantic visual profile + soup regression.
 * Usage: npx tsx scripts/verify-semantic-event-images.ts
 */
import assert from "node:assert/strict";
import {
  buildVisualProfile,
  buildVisualGenerationPrompt,
} from "../lib/event-visual-profile";
import {
  inferRequiredImageCategory,
  isImageCompatibleWithEvent,
  resolvePublicEventImage,
  CATEGORY_MOOD_POOLS,
  getMoodAssetMeta,
} from "../lib/image-compatibility";

import type { ActivityId } from "../types/event";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

const CUSHION_INTERIOR =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80";

// A — Soup tasting
{
  const ctx = {
    category: "dating" as const,
    activities: [] as ActivityId[],
    title: "Soep & Singles",
    tags: ["singles"],
    shortDescription: "Proef verschillende huisgemaakte soepen aan een gezellige tafel.",
    minAge: 40,
    maxAge: 55,
  };
  const profile = buildVisualProfile(ctx);
  assert.equal(profile.primaryActivity, "soup_tasting");
  assert.equal(profile.imageCategory, "food");
  assert.ok(profile.subjects.includes("soup"));
  assert.equal(inferRequiredImageCategory(ctx), "food");
  assert.equal(isImageCompatibleWithEvent(ctx, CUSHION_INTERIOR), false);
  const meta = getMoodAssetMeta(CUSHION_INTERIOR);
  assert.ok(meta?.subjects.includes("cushions") || meta?.subjects.includes("interior_only"));
  const resolved = resolvePublicEventImage(ctx, CUSHION_INTERIOR, true, "event:soup-test");
  assert.equal(resolved.imageCategory, "food");
  assert.notEqual(resolved.url, CUSHION_INTERIOR);
  assert.ok(
    getMoodAssetMeta(resolved.url)?.subjects.some((s) =>
      ["soup", "food", "bowls", "tasting", "dining", "table"].includes(s),
    ),
  );
  ok("A soup tasting → food, cushions hard rejected");
}

// B — Padeldate 40–55
{
  const ctx = {
    category: "dating" as const,
    activities: ["padel" as const],
    title: "Padeldate 45-55 Antwerpen",
    minAge: 45,
    maxAge: 55,
  };
  const profile = buildVisualProfile(ctx);
  assert.equal(profile.primaryActivity, "padel");
  assert.equal(profile.imageCategory, "padel");
  assert.ok(["40-50", "50-60"].includes(profile.ageBand));
  const resolved = resolvePublicEventImage(ctx, null, false, "event:padel-1");
  assert.equal(resolved.imageCategory, "padel");
  ok("B padeldate 40-55 → padel + mature band");
}

// C — Singles walking 50+
{
  const ctx = {
    category: "meet_new_people" as const,
    activities: ["wandelen" as const],
    title: "Singles wandeling 50+",
    minAge: 50,
    maxAge: null,
  };
  const profile = buildVisualProfile(ctx);
  assert.equal(profile.primaryActivity, "walking");
  assert.equal(profile.imageCategory, "outdoor");
  assert.equal(profile.ageBand, "50-60");
  const resolved = resolvePublicEventImage(ctx, null, false, "event:walk-50");
  assert.equal(resolved.imageCategory, "outdoor");
  ok("C walking 50+ → outdoor mature");
}

// D — Speeddate 30–40
{
  const ctx = {
    category: "dating" as const,
    activities: ["speeddate" as const],
    title: "Speeddate Gent 30-40",
    minAge: 30,
    maxAge: 40,
  };
  const profile = buildVisualProfile(ctx);
  assert.equal(profile.primaryActivity, "speeddate");
  assert.equal(profile.imageCategory, "dating_social");
  ok("D speeddate → conversation/social");
}

// E — Breakfast run
{
  const ctx = {
    category: "meet_new_people" as const,
    activities: ["lopen" as const],
    title: "Breakfast Run Singles Antwerpen",
    tags: ["run", "ontbijt"],
  };
  const profile = buildVisualProfile(ctx);
  assert.equal(profile.primaryActivity, "running");
  assert.ok(profile.moment.includes("breakfast") || profile.mustAvoid.includes("nightclub"));
  const resolved = resolvePublicEventImage(ctx, null, false, "event:brun");
  assert.ok(["sport", "outdoor"].includes(resolved.imageCategory));
  ok("E breakfast run → running/daytime");
}

// F — Karaoke night
{
  const ctx = {
    category: "social" as const,
    activities: ["party" as const],
    title: "Singles Karaoke Night",
  };
  const profile = buildVisualProfile(ctx);
  assert.equal(profile.primaryActivity, "karaoke");
  assert.equal(profile.imageCategory, "party");
  ok("F karaoke → nightlife/microphone category");
}

// G — Bowling
{
  const ctx = {
    category: "meet_new_people" as const,
    activities: ["sport" as const],
    title: "Singles Bowling in Antwerpen",
    tags: ["bowling"],
  };
  assert.equal(inferRequiredImageCategory(ctx), "bowling");
  assert.equal(
    isImageCompatibleWithEvent(ctx, CATEGORY_MOOD_POOLS.outdoor[0]),
    false,
  );
  ok("G bowling specific");
}

// H — Unknown social
{
  const ctx = {
    category: "social" as const,
    activities: [] as ActivityId[],
    title: "Singles avond",
  };
  const profile = buildVisualProfile(ctx);
  assert.ok(
    profile.primaryActivity === "generic_social" ||
      profile.primaryActivity === "dating_social",
  );
  const resolved = resolvePublicEventImage(ctx, null, false, "event:unknown");
  assert.ok(
    ["generic_social", "dating_social", "neutral"].includes(
      resolved.imageCategory,
    ),
  );
  ok("H unknown social → safe social/neutral");
}

// Dating must not dominate soup
{
  const profile = buildVisualProfile({
    category: "dating",
    activities: [],
    title: "Soep proeverij voor singles",
  });
  assert.notEqual(profile.primaryActivity, "dating_social");
  assert.equal(profile.imageCategory, "food");
  ok("dating context does not override soup activity");
}

const prompt = buildVisualGenerationPrompt(
  buildVisualProfile({
    category: "dating",
    activities: [],
    title: "Soep & Singles 40-55",
    minAge: 40,
    maxAge: 55,
  }),
);
assert.ok(/soup/i.test(prompt));
assert.ok(!/dating-app/i.test(prompt) || /No text/.test(prompt));
ok("generation prompt activity-first");

console.log("\nOK: semantic event images verify passed.");
