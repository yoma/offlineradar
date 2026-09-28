/**
 * Fase 25 — accounts ownership helpers + image diversity (no Neon required for core checks).
 * Usage: npx tsx scripts/verify-phase25-accounts.ts
 */
import assert from "node:assert/strict";
import {
  CATEGORY_MOOD_POOLS,
  CATEGORY_MOOD_URLS,
  eventImageDiversityKey,
  hashDiversityKey,
  inferRequiredImageCategory,
  isImageCompatibleWithEvent,
  pickCategoryMoodUrl,
  resolvePublicEventImage,
} from "../lib/image-compatibility";
import { applyStoredProfile } from "../lib/search-state";
import type { SearchState } from "../types/search";
import { emptyProfile } from "../lib/storage-shared";

let failed = 0;
function ok(name: string) {
  console.log(`OK  ${name}`);
}
function check(name: string, fn: () => void) {
  try {
    fn();
    ok(name);
  } catch (error) {
    failed++;
    console.error(
      `FAIL ${name}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

check("same event deterministic same image", () => {
  const a = pickCategoryMoodUrl("bowling", "org:org-a");
  const b = pickCategoryMoodUrl("bowling", "org:org-a");
  assert.equal(a, b);
});

check("same organizer reuses image (series consistency)", () => {
  const key = eventImageDiversityKey({
    organizerId: "org-series-1",
    eventId: "evt-1",
  });
  assert.equal(key, "org:org-series-1");
  const u1 = resolvePublicEventImage(
    {
      category: "meet_new_people",
      activities: ["sport"],
      title: "Singles Bowling A",
      tags: ["bowling"],
    },
    null,
    true,
    key,
  );
  const u2 = resolvePublicEventImage(
    {
      category: "meet_new_people",
      activities: ["sport"],
      title: "Singles Bowling B",
      tags: ["bowling"],
    },
    null,
    true,
    key,
  );
  assert.equal(u1.url, u2.url);
});

check("different organizers prefer different variants when pool allows", () => {
  const pool = CATEGORY_MOOD_POOLS.bowling;
  assert.ok(pool.length >= 2);
  const urls = new Set<string>();
  for (let i = 0; i < 40; i++) {
    urls.add(pickCategoryMoodUrl("bowling", `org:organizer-${i}`));
  }
  assert.ok(urls.size >= 2, `expected ≥2 bowling variants, got ${urls.size}`);
});

check("no incompatible outdoor←bowling", () => {
  const bowling = CATEGORY_MOOD_URLS.bowling;
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "meet_new_people",
        activities: ["wandelen"],
        title: "Parkwandeling",
      },
      bowling,
    ),
    false,
  );
  const resolved = resolvePublicEventImage(
    {
      category: "meet_new_people",
      activities: ["wandelen"],
      title: "Parkwandeling",
    },
    bowling,
    true,
    "org:hike-org",
  );
  assert.equal(inferRequiredImageCategory({
    category: "meet_new_people",
    activities: ["wandelen"],
    title: "Parkwandeling",
  }), "outdoor");
  assert.ok(CATEGORY_MOOD_POOLS.outdoor.includes(resolved.url));
  assert.equal(resolved.keptAtmosphere, true);
});

check("neutral fallback safe + Sfeerbeeld flag", () => {
  const resolved = resolvePublicEventImage(
    {
      category: "meet_new_people",
      activities: ["wandelen"],
      title: "Mystery",
    },
    "https://evil.example/wrong.jpg",
    false,
    "event:x",
  );
  assert.equal(resolved.usedFallback, true);
  assert.equal(resolved.keptAtmosphere, true);
  assert.ok(
    CATEGORY_MOOD_POOLS.outdoor.includes(resolved.url) ||
      resolved.imageCategory === "neutral",
  );
});

check("no random image per render (hash stable)", () => {
  const h1 = hashDiversityKey("org:abc");
  const h2 = hashDiversityKey("org:abc");
  assert.equal(h1, h2);
  const u1 = pickCategoryMoodUrl("outdoor", "org:abc");
  const u2 = pickCategoryMoodUrl("outdoor", "org:abc");
  assert.equal(u1, u2);
});

check("legacy CATEGORY_MOOD_URLS is pool[0]", () => {
  assert.equal(CATEGORY_MOOD_URLS.outdoor, CATEGORY_MOOD_POOLS.outdoor[0]);
  assert.equal(CATEGORY_MOOD_URLS.bowling, CATEGORY_MOOD_POOLS.bowling[0]);
});

check("URL filters override preference defaults", () => {
  const urlState: SearchState = {
    age: 42,
    gender: null,
    placeId: "gent",
    maxDistanceKm: 50,
    preferredAgeMin: null,
    preferredAgeMax: null,
    preferredMeetGender: "anyone",
    activities: [],
    categories: [],
    when: "any",
    date: null,
    price: "any",
    singlesOnly: false,
    availability: "any",
    strictOnly: false,
    sort: "match",
  };
  const prefs = {
    ...emptyProfile,
    age: 30,
    placeId: "antwerpen",
    maxDistanceKm: 25,
  };
  const merged = applyStoredProfile(urlState, prefs);
  assert.equal(merged.age, 42, "URL age must win");
  assert.equal(merged.placeId, "gent", "URL place must win when set");
});

check("empty URL age filled from prefs", () => {
  const urlState: SearchState = {
    age: null,
    gender: null,
    placeId: "antwerpen",
    maxDistanceKm: 100,
    preferredAgeMin: null,
    preferredAgeMax: null,
    preferredMeetGender: "anyone",
    activities: [],
    categories: [],
    when: "any",
    date: null,
    price: "any",
    singlesOnly: false,
    availability: "any",
    strictOnly: false,
    sort: "match",
  };
  const prefs = { ...emptyProfile, age: 33, placeId: "brugge", maxDistanceKm: 25 };
  const merged = applyStoredProfile(urlState, prefs);
  assert.equal(merged.age, 33);
  assert.equal(merged.placeId, "brugge");
  assert.equal(merged.maxDistanceKm, 25);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: phase25 accounts + image diversity checks");
