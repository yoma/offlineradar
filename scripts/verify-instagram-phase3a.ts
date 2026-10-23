/**
 * Phase 3A: Instagram visual autopilot — unit checks (no Meta publish).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  IG_FEED,
  INSTAGRAM_SLOGAN,
  INSTAGRAM_WEBSITE,
  igColors,
} from "@/lib/instagram/constants";
import { buildInstagramCaption } from "@/lib/instagram/captions";
import {
  buildDraftSlides,
  buildPhase3aPreviewDrafts,
} from "@/lib/instagram/drafts";
import {
  hasEnoughEventsForFormat,
  hasInstagramEventStarted,
  isInstagramBaseEligible,
  selectInstagramEvents,
} from "@/lib/instagram/selection";
import { NEUTRAL_FALLBACK_DATA_URI } from "@/lib/image-compatibility";
import {
  IG_NEUTRAL_FALLBACK_DATA_URI,
  imageForEvent,
  toImageDataUrl,
} from "@/lib/instagram/mood";
import { shortenTitle } from "@/lib/instagram/title";
import { resolveWebsiteVisibleEventImage } from "@/lib/images";
import type { Event } from "@/types/event";

/** Instagram must show the same URL the public EventVisual would show. */
function assertWebsiteInstagramParity(event: Event, label: string) {
  const website = resolveWebsiteVisibleEventImage(event);
  const ig = imageForEvent(event);
  if (
    website.imageKind === "neutral_fallback" ||
    website.url === NEUTRAL_FALLBACK_DATA_URI
  ) {
    assert.equal(ig.url, IG_NEUTRAL_FALLBACK_DATA_URI, label);
    assert.equal(ig.kind, "neutral_fallback", label);
  } else {
    assert.equal(ig.url, website.url, `${label}: url mismatch`);
    assert.ok(
      !ig.url.startsWith("data:image/svg"),
      `${label}: Instagram used cream while website has ${website.url}`,
    );
  }
}

function ok(label: string) {
  console.log(`OK: ${label}`);
}

function sampleEvent(partial: Partial<Event> & Pick<Event, "id" | "title" | "startDate" | "city">): Event {
  return {
    slug: partial.id,
    shortDescription: "",
    description: null,
    category: "dating",
    subCategory: "speeddate",
    organizerName: partial.organizerName ?? "Org",
    organizerId: null,
    region: partial.region ?? "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.2,
    longitude: 4.4,
    distanceKm: 10,
    endDate: null,
    startTime: partial.startTime ?? "19:00",
    endTime: null,
    price: partial.price ?? 25,
    currency: "EUR",
    eligibility: { default: null, byGender: null, allowedGenders: null },
    eligibilityAgeMin: partial.eligibilityAgeMin ?? 30,
    eligibilityAgeMax: partial.eligibilityAgeMax ?? 40,
    eligibilityAgeRule: partial.eligibilityAgeRule ?? "guideline",
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    knownAudienceGenders: null,
    singlesOnly: true,
    singlesOriented: true,
    singlesFriendly: false,
    listingPath: "organic",
    meetActivation: null,
    genderAvailability: null,
    capacityStatus: partial.capacityStatus ?? "unknown",
    spotsRemaining: null,
    registrationDeadline: null,
    socialSuitability: "high",
    sourceType: "official_website",
    sourceName: "test",
    officialUrl: "https://example.com",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: null,
    addedAt: partial.addedAt ?? "2026-10-01T00:00:00.000Z",
    imageUrl: null,
    tags: [],
    activities: partial.activities ?? ["speeddate"],
    practicalInfo: [],
    ...partial,
  };
}

const NOW = new Date("2026-10-23T12:00:00+02:00");

const catalog: Event[] = [
  sampleEvent({
    id: "e1",
    title: "Singles Bowling Antwerpen",
    startDate: "2026-10-24",
    city: "Antwerpen",
    activities: ["sport"],
    organizerName: "Will You Date Me",
  }),
  sampleEvent({
    id: "e2",
    title: "Speeddate Gent 40-50",
    startDate: "2026-10-26",
    city: "Gent",
    region: "Oost-Vlaanderen",
    activities: ["speeddate"],
    organizerName: "SmartVibes",
  }),
  sampleEvent({
    id: "e3",
    title: "Wandeling Leuven",
    startDate: "2026-10-27",
    city: "Leuven",
    region: "Vlaams-Brabant",
    activities: ["wandelen"],
    organizerName: "Sportieve Singles",
  }),
  sampleEvent({
    id: "e4",
    title: "Halloween feest Mechelen",
    startDate: "2026-10-28",
    city: "Mechelen",
    activities: ["party"],
    organizerName: "Single Events",
  }),
  sampleEvent({
    id: "e5",
    title: "Padeldate",
    startDate: "2026-10-30",
    city: "Antwerpen",
    activities: ["sport", "drinken"],
    organizerName: "The Sircle",
  }),
  sampleEvent({
    id: "e6",
    title: "Sold out speeddate",
    startDate: "2026-10-25",
    city: "Brugge",
    capacityStatus: "sold_out",
  }),
  sampleEvent({
    id: "e7",
    title: "Wallonie event",
    startDate: "2026-10-26",
    city: "Namur",
    region: "Wallonië",
  }),
  sampleEvent({
    id: "e8",
    title: "Singlereis later",
    startDate: "2026-11-20",
    city: "Lagos",
    region: "internationaal",
    activities: ["reizen", "weekend"],
    organizerName: "Juntas",
    addedAt: "2026-10-20T00:00:00.000Z",
    eligibilityAgeMin: 45,
    eligibilityAgeMax: null,
  }),
];

assert.equal(IG_FEED.width, 1080);
assert.equal(IG_FEED.height, 1350);
assert.equal(igColors.bordeaux.toLowerCase(), "#67283a");
assert.equal(igColors.gold.toLowerCase(), "#d4af37");
ok("1. feed size + brand colors");

assert.equal(isInstagramBaseEligible(catalog[5], "2026-10-23", NOW), false);
assert.equal(isInstagramBaseEligible(catalog[6], "2026-10-23", NOW), false);
assert.equal(isInstagramBaseEligible(catalog[0], "2026-10-23", NOW), true);
ok("2. sold_out + Wallonia excluded");

const startedSameDay = sampleEvent({
  id: "started",
  title: "Al begonnen",
  startDate: "2026-10-23",
  city: "Gent",
  startTime: "10:00",
});
assert.equal(hasInstagramEventStarted(startedSameDay, NOW), true);
assert.equal(
  isInstagramBaseEligible(startedSameDay, "2026-10-23", NOW),
  false,
);
const eveningSameDay = sampleEvent({
  id: "evening",
  title: "Vanavond",
  startDate: "2026-10-23",
  city: "Gent",
  startTime: "20:00",
});
assert.equal(hasInstagramEventStarted(eveningSameDay, NOW), false);
ok("2b. same-day start time gate");

const longTitle =
  "Waargebeurde Leuvense griezel- en gruwelsagen Halloween stadswandeling";
const shortened = shortenTitle(longTitle, 58);
assert.ok(shortened.endsWith("…"));
assert.ok(!/\w…\w/.test(shortened), "no mid-word ellipsis");
assert.ok(shortened.length <= 59);
ok("2c. smart title shorten");

// Website ↔ Instagram parity (same central resolver)
const noStored = sampleEvent({
  id: "noimg-walk",
  title: "Halloween stadswandeling Leuven",
  startDate: "2026-10-28",
  city: "Leuven",
  region: "Vlaams-Brabant",
  activities: ["wandelen"],
  imageUrl: null,
});
assertWebsiteInstagramParity(noStored, "null imageUrl halloween walk");
assert.ok(
  !imageForEvent(noStored).url.startsWith("data:image/svg"),
  "website shows a mood photo for this walk — Instagram must too",
);
ok("2d. website↔Instagram parity when imageUrl is null");

const withStored = sampleEvent({
  id: "bowling-stored",
  title: "Singles Bowling Antwerpen",
  startDate: "2026-10-28",
  city: "Antwerpen",
  activities: ["sport"],
  subCategory: "bowling",
  imageUrl: "/preview-mood/mood-singles-bowling.png",
  imageIsAtmosphere: true,
});
assertWebsiteInstagramParity(withStored, "stored bowling mood");
ok("2e. website↔Instagram parity with stored mood path");

const speedNull = sampleEvent({
  id: "speed-null",
  title: "Speeddate Lochristi, 30–40 jaar",
  startDate: "2026-10-28",
  city: "Lochristi",
  region: "Oost-Vlaanderen",
  activities: ["speeddate"],
  imageUrl: null,
});
assertWebsiteInstagramParity(speedNull, "null imageUrl speeddate");
ok("2f. website↔Instagram parity for speeddate without stored image");

const bowlingBytes = readFileSync(
  path.join(process.cwd(), "public/preview-mood/mood-singles-bowling.png"),
);
assert.equal(bowlingBytes[0], 0xff);
assert.equal(bowlingBytes[1], 0xd8);
ok("2g. preview-mood bowling asset is JPEG bytes (mime must be sniffed)");

const binnenkort = selectInstagramEvents(catalog, {
  format: "binnenkort",
  now: NOW,
});
assert.ok(binnenkort.events.length >= 4);
assert.ok(!binnenkort.events.some((e) => e.capacityStatus === "sold_out"));
assert.ok(!binnenkort.events.some((e) => e.city === "Namur"));
const activities = new Set(binnenkort.events.map((e) => e.activities[0]));
assert.ok(activities.size >= 2, "expect activity variety");
ok("3. Format A selection + variety");

const week = selectInstagramEvents(catalog, {
  format: "deze_week",
  now: NOW,
});
assert.ok(week.events.every((e) => e.startDate >= "2026-10-26"));
assert.ok(week.events.every((e) => e.startDate <= "2026-10-30"));
ok("4. Format B window 3–7 days");

const caption = buildInstagramCaption(
  "binnenkort",
  binnenkort.events,
  binnenkort.periodLabel,
);
assert.ok(caption.text.includes(INSTAGRAM_WEBSITE));
assert.ok(caption.text.includes("Binnenkort te beleven"));
assert.ok(!/Binnenkort op DateOfflineHub/i.test(caption.text));
assert.ok(!/plaatsen beschikbaar|nog tickets/i.test(caption.text));
assert.ok(caption.text.includes(INSTAGRAM_SLOGAN));
ok("5. caption facts + website, no invent availability");

const slides = buildDraftSlides(
  "binnenkort",
  binnenkort.events,
  binnenkort.periodLabel,
);
assert.equal(slides[0].kind, "binnenkort_cover");
assert.ok(slides[0].query.ids, "cover must carry event ids for overview");
assert.ok(slides.length === binnenkort.events.length + 1);
ok("6. carousel cover + event slides");

assert.equal(hasEnoughEventsForFormat("binnenkort", 3), false);
assert.equal(hasEnoughEventsForFormat("binnenkort", 4), true);
assert.equal(hasEnoughEventsForFormat("deze_week", 2), true);
ok("7. enough-events gates");

const preview = buildPhase3aPreviewDrafts(catalog, NOW);
assert.ok(preview.drafts.length >= 2);
ok("8. phase3a preview drafts");

const logo = readFileSync(
  path.join(process.cwd(), "public/brand/dateofflinehub-logo.png"),
);
assert.ok(logo.byteLength > 1000);
ok("9. real logo asset present");

const page = readFileSync(
  path.join(process.cwd(), "app/interne-instagram/page.tsx"),
  "utf8",
);
assert.ok(page.includes("InstagramPreviewClient"));
assert.ok(!page.includes("publishToInstagram"));
ok("10. admin preview route, no publish");

async function assertSatoriLoads() {
  const bowlingData = await toImageDataUrl(
    "/preview-mood/mood-singles-bowling.png",
  );
  assert.ok(bowlingData.startsWith("data:image/jpeg;base64,"));
  assert.ok(bowlingData.length > 10_000);

  const halloween = imageForEvent(noStored);
  const halloweenData = await toImageDataUrl(halloween.url);
  assert.ok(halloweenData.startsWith("data:image/"));
  assert.ok(
    halloweenData.length > 5_000,
    "website-visible halloween mood must load for Satori",
  );
  ok("11. Satori can load website-visible images (local + remote)");
}

assertSatoriLoads()
  .then(() => {
    console.log("\nOK: Instagram Phase 3A verify.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
