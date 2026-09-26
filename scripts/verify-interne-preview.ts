import { buildRealPreviewEvents } from "@/data/pilot/real-preview-events";
import { isEligibleForEvent } from "@/lib/eligibility";
import { isEventListable } from "@/lib/events";
import {
  isInternalPreviewListable,
  listPreviewEvents,
} from "@/lib/events-preview";
import { eventLabels } from "@/lib/event-labels";
import { matchingEvents } from "@/lib/filters";
import { formatCardWhen, formatPrice, formatPriceFrom } from "@/lib/format";
import { defaultSearchState } from "@/lib/search-state";
import type { Event } from "@/types/event";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Guarantees the internal preview never admits “generally social” alone,
 * and that the curated Fase 4B set remains Route A listable.
 */

function assert(name: string, ok: boolean) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) process.exitCode = 1;
}

function socialOnlyStub(): Event {
  return {
    id: "cal-social-only",
    title: "Gewone kookworkshop",
    slug: "cal-social-only",
    shortDescription: "Sociaal koken",
    description: null,
    category: "social",
    subCategory: "workshop",
    organizerName: "Test",
    organizerId: null,
    city: "Antwerpen",
    region: "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.22,
    longitude: 4.4,
    distanceKm: 1,
    startDate: "2026-10-05",
    endDate: null,
    startTime: "19:00",
    endTime: null,
    price: 20,
    currency: "EUR",
    eligibility: {
      default: null,
      byGender: null,
      allowedGenders: null,
    },
    eligibilityAgeMin: null,
    eligibilityAgeMax: null,
    eligibilityAgeRule: "unknown",
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    knownAudienceGenders: null,
    singlesOnly: false,
    singlesOriented: false,
    singlesFriendly: false,
    listingPath: "organic",
    meetActivation: null,
    genderAvailability: null,
    capacityStatus: "unknown",
    spotsRemaining: null,
    registrationDeadline: null,
    socialSuitability: "medium",
    sourceType: "unknown",
    sourceName: "test",
    officialUrl: "https://example.com",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: "2026-09-25T00:00:00.000Z",
    addedAt: "2026-09-25T00:00:00.000Z",
    imageUrl: null,
    tags: [],
    activities: ["eten"],
    practicalInfo: [],
  };
}

async function main() {
  const social = socialOnlyStub();
  assert(
    "oude MVP-gate laat medium social nog toe (gedocumenteerd conflict)",
    isEventListable(social) === true,
  );
  assert(
    "interne preview-gate weigert medium social zonder Route A/B",
    isInternalPreviewListable(social) === false,
  );

  const curated = buildRealPreviewEvents();
  assert("acht curated preview-events", curated.length === 8);

  for (const event of curated) {
    assert(
      `preview listable: ${event.slug}`,
      isInternalPreviewListable(event) === true && event.singlesOriented === true,
    );
    assert(
      `heeft officiële URL: ${event.slug}`,
      /^https?:\/\//.test(event.officialUrl),
    );
  }

  const mingle = curated.find((e) => e.slug.includes("mingle-night"));
  assert(
    "Mingle Night zonder gekozen starttijd (conflict)",
    mingle != null && mingle.startTime == null,
  );
  assert(
    "Mingle Night needs_review-waarschuwing",
    (mingle?.internalPreviewWarnings ?? []).some((w) =>
      w.toLowerCase().includes("needs_review"),
    ),
  );
  assert(
    "Mingle Night toont startuur-note op kaart",
    formatCardWhen(mingle!).includes("startuur nog te bevestigen"),
  );
  assert(
    "Mingle Night bewaart bronconflicten",
    (mingle?.internalSourceConflicts ?? []).length >= 2,
  );
  assert(
    "Mingle Night is Singlesgericht, niet Singles only",
    eventLabels(mingle!, "review").some((l) => l.kind === "singles_oriented") &&
      !eventLabels(mingle!, "review").some((l) => l.kind === "singles_only") &&
      mingle!.singlesOnly === false,
  );

  const apero = curated.find((e) => e.slug.includes("apero-solo"));
  assert(
    "Apero Solo 50+ is richtleeftijd (guideline), geen strict",
    apero?.eligibilityAgeRule === "guideline" &&
      apero.eligibility.default?.ageRule === "guideline",
  );
  assert(
    "Apero Solo is Singlesgericht, niet Singles only (geen harde deurvoorwaarde bewezen)",
    apero?.singlesOnly === false &&
      eventLabels(apero!, "review").some((l) => l.kind === "singles_oriented") &&
      !eventLabels(apero!, "review").some((l) => l.kind === "singles_only"),
  );

  const age45 = {
    ...defaultSearchState(),
    age: 45,
    gender: "man" as const,
    maxDistanceKm: 100,
    when: "any" as const,
  };
  const match45 = matchingEvents(curated, age45);
  assert(
    "leeftijd 45: precies 2 strict verborgen (speeddates)",
    match45.hiddenStrict === 2,
  );
  assert(
    "leeftijd 45: Apero Solo blijft zichtbaar",
    match45.visible.some((e) => e.slug.includes("apero-solo")),
  );
  assert(
    "leeftijd 45: 6 zichtbare activiteiten",
    match45.visible.length === 6,
  );
  assert(
    "leeftijd 45: verborgen zijn precies de twee strict speeddates",
    match45.visible.every(
      (e) => !e.slug.includes("53-65") && !e.slug.includes("25-35"),
    ) &&
      curated
        .filter((e) => e.slug.includes("53-65") || e.slug.includes("25-35"))
        .every(
          (e) =>
            !match45.visible.some((v) => v.id === e.id) &&
            isEligibleForEvent({ age: 45, gender: "man" }, e).status ===
              "ineligible",
        ),
  );

  const aperoElig = isEligibleForEvent(
    { age: 45, gender: "man" },
    apero!,
  );
  assert(
    "Apero Solo @45: guideline + included",
    aperoElig.status === "guideline" &&
      aperoElig.includedByDefault === true &&
      aperoElig.inRange === false,
  );

  const nightOut = curated.find((e) => e.slug.includes("singles-night-out"));
  assert(
    "Singles Night Out hercontrole-waarschuwing",
    (nightOut?.internalPreviewWarnings ?? []).some((w) =>
      w.toLowerCase().includes("opnieuw"),
    ),
  );
  assert(
    "Singles Night Out is Singlesgericht, niet Singles only",
    nightOut?.singlesOnly === false &&
      eventLabels(nightOut!, "review").some((l) => l.kind === "singles_oriented") &&
      !eventLabels(nightOut!, "review").some((l) => l.kind === "singles_only"),
  );

  const expectedBadges: Record<string, "singles_only" | "singles_oriented"> = {
    "apero-solo": "singles_oriented",
    "embodied-dating": "singles_only",
    "53-65": "singles_only",
    "singles-night-out": "singles_oriented",
    "mingle-night": "singles_oriented",
    "25-35": "singles_only",
    rooftop: "singles_oriented",
    bowling: "singles_only",
  };
  for (const [fragment, kind] of Object.entries(expectedBadges)) {
    const event = curated.find((e) => e.slug.includes(fragment));
    assert(
      `badge ${kind}: ${fragment}`,
      event != null && eventLabels(event, "review").some((l) => l.kind === kind),
    );
  }

  const speed5365 = curated.find((e) => e.slug.includes("53-65"));
  const speed2535 = curated.find((e) => e.slug.includes("25-35"));
  assert(
    "speeddate 53-65 @45: ineligible",
    isEligibleForEvent({ age: 45, gender: "man" }, speed5365!).status ===
      "ineligible",
  );
  assert(
    "speeddate 25-35 @45: ineligible",
    isEligibleForEvent({ age: 45, gender: "man" }, speed2535!).status ===
      "ineligible",
  );

  for (const event of curated) {
    assert(
      `mood image pad: ${event.slug}`,
      typeof event.imageUrl === "string" &&
        event.imageUrl.startsWith("/preview-mood/") &&
        event.imageIsAtmosphere === true &&
        Boolean(event.imageAlt?.trim()),
    );
    const file = path.join(process.cwd(), "public", event.imageUrl!);
    assert(`mood bestand bestaat: ${event.slug}`, existsSync(file));
    assert(
      `kaart toont volledige datum: ${event.slug}`,
      /^\w{2} \d{1,2} \w{3}/.test(formatCardWhen(event)),
    );
    assert(
      `geen algemeen sold_out zonder nuance: ${event.slug}`,
      event.capacityStatus !== "sold_out",
    );
  }

  assert(
    "bowling availabilityNote is categorie-specifiek",
    (curated.find((e) => e.slug.includes("bowling"))?.availabilityNote ?? "")
      .toLowerCase()
      .includes("25–35 mannen") ||
      (curated.find((e) => e.slug.includes("bowling"))?.availabilityNote ?? "")
        .toLowerCase()
        .includes("25-35 mannen"),
  );

  const embodied = curated.find((e) => e.slug.includes("embodied"));
  assert(
    "Embodied vanafprijs",
    embodied?.priceIsFrom === true &&
      formatPriceFrom(embodied.price, embodied.currency).startsWith("v.a."),
  );
  assert(
    "Speeddate 53-65 vaste prijs (geen v.a.)",
    speed5365?.priceIsFrom !== true &&
      formatPrice(speed5365!.price, "EUR").includes("26"),
  );

  const rooftop = curated.find((e) => e.slug.includes("rooftop"));
  assert(
    "Love On The Rooftop: Singlesgericht, niet Singles only (wing tickets)",
    rooftop?.singlesOnly === false &&
      eventLabels(rooftop!, "review").some((l) => l.kind === "singles_oriented"),
  );

  const listed = await listPreviewEvents();
  assert("listPreviewEvents toont alle acht", listed.length === 8);

  if (process.exitCode) {
    console.log("\nFAIL: interne preview-invarianten geschonden.");
    process.exit(1);
  }
  console.log("\nOK: interne preview-invarianten.");
}

main();
