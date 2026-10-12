/**
 * FASE 26.19 — semantic visual profile + soup regression.
 * Usage: npx tsx scripts/verify-semantic-event-images.ts
 */
import assert from "node:assert/strict";
import {
  buildVisualProfile,
  buildVisualGenerationPrompt,
  TITLE_THEME_RULES,
} from "../lib/event-visual-profile";
import {
  inferRequiredImageCategory,
  isImageCompatibleWithEvent,
  resolvePublicEventImage,
  CATEGORY_MOOD_POOLS,
  THEME_MOOD_POOLS,
  THEME_SUBJECT_DENYLIST,
  VERIFIED_THEME_ASSET_LABELS,
  EXCLUSIVE_THEME_SUBJECTS,
  getMoodAssetMeta,
  listDeadMoodUrlRewrites,
  moodAssetKey,
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

// Title themes are registry-driven (not one-off image fixes)
{
  const halloween = {
    category: "social" as const,
    activities: ["party" as const],
    title: "COCO LOCO x Halloween Rave",
    tags: ["halloween", "party"],
  };
  const profile = buildVisualProfile(halloween);
  assert.equal(profile.theme, "halloween");
  assert.ok(profile.mustInclude.includes("halloween"));
  const genericClub =
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80";
  assert.equal(isImageCompatibleWithEvent(halloween, genericClub), false);
  const resolved = resolvePublicEventImage(
    halloween,
    genericClub,
    true,
    "event:halloween",
  );
  assert.ok(
    getMoodAssetMeta(resolved.url)?.subjects.includes("halloween"),
    `expected halloween mood, got ${resolved.url}`,
  );
  assert.ok(
    VERIFIED_THEME_ASSET_LABELS[moodAssetKey(resolved.url)]?.theme ===
      "halloween",
    `halloween resolve must use verified pumpkin stock, got ${resolved.url}`,
  );

  // Real catalog titles that previously showed brunch stock.
  for (const title of [
    "Waargebeurde Leuvense griezel- en gruwelverhalen",
    "Thursday Singles Halloween at De Vuile",
    "Halloween Kroegentocht – Fear or Flirt?",
  ]) {
    const r = resolvePublicEventImage(
      { category: "social", activities: [], title },
      null,
      false,
      `event:${title}`,
    );
    assert.equal(buildVisualProfile({ category: "social", activities: [], title }).theme, "halloween");
    assert.ok(
      getMoodAssetMeta(r.url)?.subjects.includes("halloween"),
      `${title} → ${r.url}`,
    );
    assert.ok(
      !getMoodAssetMeta(r.url)?.subjects.includes("brunch"),
      `${title} must not resolve brunch`,
    );
  }

  const valentine = buildVisualProfile({
    category: "dating",
    activities: [],
    title: "Valentijn singles diner",
  });
  assert.equal(valentine.theme, "valentine");
  const valentineResolved = resolvePublicEventImage(
    {
      category: "dating",
      activities: [],
      title: "Valentijn singles diner",
    },
    null,
    false,
    "event:valentine",
  );
  assert.ok(
    getMoodAssetMeta(valentineResolved.url)?.subjects.includes("valentine"),
  );

  assert.ok(TITLE_THEME_RULES.some((r) => r.id === "carnival"));
  assert.ok(TITLE_THEME_RULES.some((r) => r.id === "new_year"));

  // Unthemed party must never randomly get halloween/christmas stock.
  for (let i = 0; i < 12; i++) {
    const party = resolvePublicEventImage(
      {
        category: "social",
        activities: ["party"],
        title: "Singles Night Out Antwerpen",
      },
      null,
      false,
      `event:party-leak:${i}`,
    );
    const subjects = getMoodAssetMeta(party.url)?.subjects ?? [];
    assert.ok(
      !subjects.some((s) =>
        ["halloween", "christmas", "valentine", "carnival", "new_year"].includes(
          s,
        ),
      ),
      `unthemed party must not get seasonal stock (${party.url})`,
    );
  }
  ok("title theme registry steers mood for future themes");
}

// Structural: theme pools, denylist, and dead rewrites stay pixel-honest.
{
  for (const [theme, urls] of Object.entries(THEME_MOOD_POOLS)) {
    for (const url of urls) {
      const key = moodAssetKey(url);
      const verified = VERIFIED_THEME_ASSET_LABELS[key];
      assert.ok(verified, `theme pool ${theme} has unverified asset ${key}`);
      assert.equal(
        verified.theme,
        theme,
        `${key} verified as ${verified.theme}, pool is ${theme}`,
      );
      const meta = getMoodAssetMeta(url);
      assert.ok(meta?.subjects.includes(theme), `${key} meta missing ${theme}`);
      assert.ok(
        !(key in THEME_SUBJECT_DENYLIST),
        `denylisted ${key} must not be in theme pools`,
      );
    }
  }

  for (const [key, reason] of Object.entries(THEME_SUBJECT_DENYLIST)) {
    const meta = getMoodAssetMeta(`https://images.unsplash.com/${key}`);
    const bad = EXCLUSIVE_THEME_SUBJECTS.filter((s) =>
      meta?.subjects.includes(s),
    );
    assert.equal(
      bad.length,
      0,
      `denylist ${key} (${reason}) still has exclusive subjects: ${bad.join(",")}`,
    );
  }

  for (const [fromKey, toUrl] of Object.entries(listDeadMoodUrlRewrites())) {
    const fromMeta = getMoodAssetMeta(`https://images.unsplash.com/${fromKey}`);
    const toMeta = getMoodAssetMeta(toUrl);
    const fromThemes = EXCLUSIVE_THEME_SUBJECTS.filter((s) =>
      fromMeta?.subjects.includes(s),
    );
    if (fromThemes.length === 0) continue;
    assert.ok(
      fromThemes.some((t) => toMeta?.subjects.includes(t)),
      `dead rewrite ${fromKey} → ${moodAssetKey(toUrl)} drops exclusive themes [${fromThemes.join(",")}]`,
    );
  }

  // Brunch flat-lay must never be chosen for Halloween titles.
  const brunch =
    "https://images.unsplash.com/photo-1478144592103-25e218a04891?auto=format&fit=crop&w=1200&q=80";
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "social",
        activities: ["party"],
        title: "Halloween party",
      },
      brunch,
    ),
    false,
  );
  ok("theme pool verification + denylist + rewrite theme-safety");
}

// Title beats description noise; age from title steers people stock.
{
  const soup = buildVisualProfile({
    category: "dating",
    activities: [],
    title: "Soep & Singles 45-55",
    description: "Na de soep gaan we feesten en dansen in de club.",
    minAge: 45,
    maxAge: 55,
  });
  assert.equal(soup.primaryActivity, "soup_tasting");
  assert.equal(soup.imageCategory, "food");
  assert.ok(["40-50", "50-60"].includes(soup.ageBand));

  const matureParty = resolvePublicEventImage(
    {
      category: "social",
      activities: ["party"],
      title: "Singles Night Out 50+",
      minAge: 50,
    },
    null,
    false,
    "event:mature-party",
  );
  const matureBands = getMoodAssetMeta(matureParty.url)?.ageBands ?? [];
  assert.ok(
    matureBands.length === 0 ||
      matureBands.includes("mature") ||
      matureBands.includes("any") ||
      matureBands.includes("mid"),
    `50+ party must not resolve young-only stock (${matureParty.url})`,
  );
  assert.ok(
    !(matureBands.includes("young") && !matureBands.includes("mature") && !matureBands.includes("mid")),
  );
  ok("title-first activity + age-aware people stock");
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
