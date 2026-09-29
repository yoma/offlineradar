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

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nOK: image compatibility verify passed.");
