/**
 * Unit tests for image semantic compatibility (no Neon required).
 * Usage: npx tsx scripts/verify-image-compatibility.ts
 */
import assert from "node:assert/strict";
import {
  inferRequiredImageCategory,
  isImageCompatibleWithEvent,
  resolvePublicEventImage,
  CATEGORY_MOOD_URLS,
  CATEGORY_MOOD_POOLS,
  NEUTRAL_FALLBACK_DATA_URI,
} from "../lib/image-compatibility";
import { eventImageUrl } from "../lib/images";

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

const bowlingMood = "/preview-mood/mood-singles-bowling.png";
const outdoorMood = CATEGORY_MOOD_URLS.outdoor;

check("outdoor event rejects bowling fallback", () => {
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "meet_new_people",
        activities: ["wandelen"],
        title: "Wandeling Antwerpse parken & Middelheim",
        tags: ["wandelen", "outdoor"],
      },
      bowlingMood,
    ),
    false,
  );
  const resolved = resolvePublicEventImage(
    {
      category: "meet_new_people",
      activities: ["wandelen"],
      title: "Wandeling Antwerpse parken & Middelheim",
    },
    bowlingMood,
    true,
  );
  assert.equal(resolved.url, outdoorMood);
  assert.equal(resolved.usedFallback, true);
  assert.equal(resolved.keptAtmosphere, true);
});

check("bowling may use bowling image", () => {
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "meet_new_people",
        activities: ["sport"],
        title: "Singles Bowling in Antwerpen",
        tags: ["bowling"],
        subCategory: "singles bowling",
      },
      bowlingMood,
    ),
    true,
  );
});

check("food does not get outdoor/sport image", () => {
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "social",
        activities: ["eten"],
        title: "Singles dinner",
        tags: ["dinner"],
      },
      outdoorMood,
    ),
    false,
  );
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "social",
        activities: ["eten"],
        title: "Singles dinner",
      },
      CATEGORY_MOOD_URLS.sport,
    ),
    false,
  );
});

check("travel does not get bowling image", () => {
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "meet_new_people",
        activities: ["wandelen", "weekend"],
        title: "Wandelweekend Ardennen",
        tags: ["weekend"],
      },
      bowlingMood,
    ),
    false,
  );
});

check("specific category beats generic_social", () => {
  assert.equal(
    inferRequiredImageCategory({
      category: "meet_new_people",
      activities: ["wandelen"],
      title: "Boswandeling",
    }),
    "outdoor",
  );
  assert.equal(
    isImageCompatibleWithEvent(
      {
        category: "meet_new_people",
        activities: ["wandelen"],
        title: "Boswandeling",
      },
      CATEGORY_MOOD_URLS.generic_social,
    ),
    false,
  );
});

check("missing compatible image uses category mood not wrong activity", () => {
  const resolved = eventImageUrl({
    imageUrl: null,
    category: "meet_new_people",
    activities: ["wandelen"],
    title: "Ontdek Mechelen langs de Dijle",
  });
  assert.equal(resolved, outdoorMood);
  assert.notEqual(resolved, bowlingMood);
});

check("Sfeerbeeld atmosphere flag preserved on mood fallback", () => {
  const resolved = resolvePublicEventImage(
    {
      category: "dating",
      activities: [],
      title: "Speeddate Leuven",
    },
    null,
    true,
  );
  assert.equal(resolved.keptAtmosphere, true);
});

check("incompatible unknown image does not render as-is", () => {
  assert.equal(
    isImageCompatibleWithEvent(
      { category: "dating", activities: [], title: "Speeddate" },
      "/preview-mood/totally-unknown-asset.png",
    ),
    false,
  );
});

check("neutral data uri available", () => {
  assert.ok(NEUTRAL_FALLBACK_DATA_URI.startsWith("data:image/svg"));
});

check("import mapping blocks incompatible public image", () => {
  const { mapConsumerEventToCatalogDraft } = require("../lib/events/from-preview") as typeof import("../lib/events/from-preview");
  const draft = mapConsumerEventToCatalogDraft({
    id: "t",
    title: "Wandeling Antwerpse parken & Middelheim",
    slug: "wandeling-test",
    shortDescription: "x",
    description: null,
    category: "meet_new_people",
    subCategory: "singles wandeling",
    organizerName: "Sportieve Singles",
    organizerId: null,
    city: "Antwerpen",
    region: "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.2,
    longitude: 4.4,
    distanceKm: 0,
    startDate: "2026-10-01",
    endDate: null,
    startTime: "10:00",
    endTime: null,
    price: 20,
    currency: "EUR",
    eligibility: { default: null, byGender: null, allowedGenders: null },
    eligibilityAgeMin: null,
    eligibilityAgeMax: null,
    eligibilityAgeRule: "unknown",
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    singlesOnly: true,
    singlesOriented: true,
    genderAvailability: null,
    capacityStatus: "unknown",
    availabilityNote: null,
    sourceType: "official_website",
    sourceName: "Sportieve Singles",
    officialUrl: "https://example.com",
    ticketUrl: null,
    lastCheckedAt: "2026-09-26T00:00:00.000Z",
    tags: ["wandelen"],
    activities: ["wandelen"],
    practicalInfo: [],
    instagramUrl: null,
    addedAt: "2026-09-26T00:00:00.000Z",
    meetActivation: null,
    singlesFriendly: false,
    listingPath: "organic",
    socialSuitability: "high",
    knownAudienceGenders: null,
    spotsRemaining: null,
    registrationDeadline: null,
    priceIsFrom: false,
    imageUrl: bowlingMood,
    imageAlt: "bowling",
    imageIsAtmosphere: true,
  } as import("../types/event").Event);
  assert.ok(draft.images[0]);
  assert.notEqual(draft.images[0].urlOrPath, bowlingMood);
  assert.equal(draft.images[0].urlOrPath, outdoorMood);
});

check("Sfeerbeeld label path: legacy mood re-enters pool with atmosphere badge", () => {
  const resolved = resolvePublicEventImage(
    {
      category: "meet_new_people",
      activities: ["sport"],
      title: "Singles Bowling",
      tags: ["bowling"],
    },
    bowlingMood,
    true,
    "event:bowl-1|cat:bowling|org:x",
  );
  assert.equal(resolved.keptAtmosphere, true);
  assert.equal(resolved.usedFallback, true);
  assert.ok(CATEGORY_MOOD_POOLS.bowling.includes(resolved.url));
});

check("50+ dating never gets young speeddate mood", () => {
  const { inferImageAgeBand, pickCategoryMoodUrl } =
    require("../lib/image-compatibility") as typeof import("../lib/image-compatibility");
  assert.equal(
    inferImageAgeBand({ minAge: 50, maxAge: 60, title: "Speeddate Lochristi, 50–60 jaar" }),
    "mature",
  );
  for (let i = 0; i < 20; i++) {
    const url = pickCategoryMoodUrl(
      "dating_social",
      `event:mature-${i}|cat:dating_social|org:x`,
      "mature",
    );
    assert.ok(
      !url.includes("mood-speeddate-25-35"),
      `mature pick leaked young mood: ${url}`,
    );
    assert.ok(
      !url.includes("photo-1529156069898"),
      `mature pick leaked young unsplash: ${url}`,
    );
    assert.ok(
      !url.includes("photo-1543269865"),
      `mature pick leaked young unsplash: ${url}`,
    );
  }
});

check("Speeddate Kortrijk 35-45 does not keep 25-35 mood", () => {
  const youngMood = "/preview-mood/mood-speeddate-25-35.png";
  const resolved = resolvePublicEventImage(
    {
      category: "dating",
      activities: ["speeddate"],
      title: "Speeddate Kortrijk Hogeropgeleiden, 35–45 jaar",
      subCategory: "speeddate",
      minAge: 35,
      maxAge: 45,
    },
    youngMood,
    true,
    "event:16f186a5-5a94-4675-8841-387b8b75b597|cat:dating_social|org:x",
  );
  assert.notEqual(resolved.url, youngMood);
  assert.ok(!resolved.url.includes("mood-speeddate-25-35"));
});

check("title 50+ without minAge still resolves mature", () => {
  const { inferImageAgeBand } =
    require("../lib/image-compatibility") as typeof import("../lib/image-compatibility");
  assert.equal(
    inferImageAgeBand({ title: "Singlereis Ibiza (45+)", minAge: null, maxAge: null }),
    "mature",
  );
});

check("known-dead Unsplash ids are not in mood pools", () => {
  const dead = [
    "photo-1569523463827",
    "photo-1519502336329",
    "photo-1517649763962",
    "photo-1461896836934",
    "photo-1595435742656",
    "photo-1511632765486",
    "photo-1515187029135",
  ];
  const blob = JSON.stringify(CATEGORY_MOOD_POOLS);
  for (const id of dead) {
    assert.ok(!blob.includes(id), `dead unsplash still in pool: ${id}`);
  }
});

check("Singles Bowling diversity pick stays on live assets", () => {
  const resolved = resolvePublicEventImage(
    {
      category: "meet_new_people",
      activities: ["sport"],
      title: "Singles Bowling in Antwerpen",
      tags: ["bowling"],
      subCategory: "singles bowling",
      minAge: 25,
      maxAge: null,
    },
    "/preview-mood/mood-singles-bowling.png",
    true,
    "event:56ec5f81-0cd6-4993-9394-9dfdf0603d75|cat:bowling|org:x",
  );
  assert.ok(CATEGORY_MOOD_POOLS.bowling.includes(resolved.url));
  assert.ok(!resolved.url.includes("photo-1519502336329"));
  assert.ok(!resolved.url.includes("photo-1569523463827"));
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nOK: image compatibility verify passed.");
