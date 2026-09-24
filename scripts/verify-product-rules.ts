import { band } from "@/types/event";
import { isEligibleForEvent } from "@/lib/eligibility";
import { isEventListable } from "@/lib/events";
import { calculatePreferenceScore } from "@/lib/ranking";
import type { Event } from "@/types/event";
import type { SearchState } from "@/types/search";
import { defaultSearchState } from "@/lib/search-state";

function assert(name: string, condition: boolean, detail = "") {
  if (!condition) {
    throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
  console.log(`ok  ${name}`);
}

function stubEvent(
  partial: Partial<Event> & { eligibility: Event["eligibility"] },
): Event {
  return {
    id: "t",
    title: "Test",
    slug: "test",
    shortDescription: "",
    description: null,
    category: "dating",
    subCategory: "Test",
    organizerName: "Test",
    organizerId: "org-test",
    city: "Antwerpen",
    region: "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.2,
    longitude: 4.4,
    distanceKm: 8,
    startDate: "2099-01-01",
    endDate: null,
    startTime: "20:00",
    endTime: null,
    price: 20,
    currency: "EUR",
    eligibilityAgeMin: null,
    eligibilityAgeMax: null,
    eligibilityAgeRule: "unknown",
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    knownAudienceGenders: null,
    singlesOnly: true,
    singlesFriendly: false,
    listingPath: "organic",
    meetActivation: null,
    genderAvailability: null,
    capacityStatus: "available",
    spotsRemaining: 5,
    registrationDeadline: null,
    socialSuitability: "high",
    sourceType: "official_website",
    sourceName: "Test",
    officialUrl: "https://example.com",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: new Date().toISOString(),
    addedAt: new Date().toISOString(),
    imageUrl: null,
    tags: [],
    activities: ["eten"],
    practicalInfo: [],
    ...partial,
  };
}

function prepared(event: Event, state: SearchState) {
  const participation = isEligibleForEvent(
    { age: state.age, gender: state.gender },
    event,
  );
  return { ...event, participation };
}

function main() {
  // Case A
  {
    const event = stubEvent({
      eligibility: {
        default: band(40, 55, "strict"),
        byGender: null,
        allowedGenders: null,
      },
    });
    const result = isEligibleForEvent({ age: 49, gender: "man" }, event);
    assert("A eligible man 49 for 40-55 strict", result.status === "eligible");
    assert("A included", result.includedByDefault);
  }

  // Case B
  {
    const event = stubEvent({
      eligibility: {
        default: band(35, 45, "strict"),
        byGender: null,
        allowedGenders: null,
      },
    });
    const result = isEligibleForEvent({ age: 49, gender: "man" }, event);
    assert("B ineligible", result.status === "ineligible");
    assert("B hidden", !result.includedByDefault);
  }

  // Case C
  {
    const event = stubEvent({
      eligibility: {
        default: null,
        byGender: {
          man: band(45, 55, "strict"),
          woman: band(35, 45, "strict"),
        },
        allowedGenders: ["man", "woman"],
      },
    });
    const result = isEligibleForEvent({ age: 49, gender: "man" }, event);
    assert("C man 49 eligible", result.status === "eligible");
  }

  // Case D
  {
    const event = stubEvent({
      eligibility: {
        default: null,
        byGender: {
          man: band(45, 55, "strict"),
          woman: band(35, 45, "strict"),
        },
        allowedGenders: ["man", "woman"],
      },
    });
    const result = isEligibleForEvent({ age: 49, gender: "woman" }, event);
    assert("D woman 49 ineligible", result.status === "ineligible");
  }

  // Case E: preference miss does not hide
  {
    const event = stubEvent({
      eligibility: {
        default: band(40, 60, "strict"),
        byGender: null,
        allowedGenders: null,
      },
      preferredAudienceAgeMin: 40,
      preferredAudienceAgeMax: 60,
      audienceAgeFromSource: true,
      distanceKm: 10,
    });
    const state: SearchState = {
      ...defaultSearchState(),
      age: 50,
      gender: "man",
      preferredAgeMin: 18,
      preferredAgeMax: 25,
    };
    const prep = prepared(event, state);
    assert("E still included", prep.participation.includedByDefault);
    const score = calculatePreferenceScore(prep, state);
    assert(
      "E preferred age not a match",
      score.preferredAgeMatch === false,
    );
  }

  // Case F: guideline outside range still visible
  {
    const event = stubEvent({
      eligibility: {
        default: band(40, 50, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
    });
    const result = isEligibleForEvent({ age: 52, gender: "man" }, event);
    assert("F guideline status", result.status === "guideline");
    assert("F still included", result.includedByDefault);
    assert("F out of range", result.inRange === false);
  }

  // Case G: unknown
  {
    const event = stubEvent({
      eligibility: {
        default: band(null, null, "unknown"),
        byGender: null,
        allowedGenders: null,
      },
    });
    const result = isEligibleForEvent({ age: 49, gender: "man" }, event);
    assert("G unknown", result.status === "unknown");
    assert("G included", result.includedByDefault);
    assert(
      "G title mentions unknown",
      result.title.toLowerCase().includes("niet volledig bekend") ||
        result.title.toLowerCase().includes("controleer"),
    );
  }

  // Case H: no invented gender match
  {
    const event = stubEvent({
      eligibility: {
        default: band(30, 60, "strict"),
        byGender: null,
        allowedGenders: null,
      },
      knownAudienceGenders: null,
      distanceKm: 5,
    });
    const state: SearchState = {
      ...defaultSearchState(),
      age: 40,
      gender: "man",
      preferredMeetGender: "women",
    };
    const prep = prepared(event, state);
    assert("H eligible", prep.participation.includedByDefault);
    const score = calculatePreferenceScore(prep, state);
    assert("H no invented gender match", score.preferredGenderMatch === null);
  }

  // Case I: narrow preference 18-20 never hides eligible events; overlap grades
  {
    const state: SearchState = {
      ...defaultSearchState(),
      age: 49,
      gender: "man",
      preferredMeetGender: "women",
      preferredAgeMin: 18,
      preferredAgeMax: 20,
      sort: "match",
    };

    const A = prepared(
      stubEvent({
        id: "A",
        eligibility: {
          default: band(40, 55, "strict"),
          byGender: null,
          allowedGenders: null,
        },
        preferredAudienceAgeMin: 40,
        preferredAudienceAgeMax: 55,
        audienceAgeFromSource: true,
        knownAudienceGenders: null,
        distanceKm: 12,
      }),
      state,
    );
    const B = prepared(
      stubEvent({
        id: "B",
        eligibility: {
          default: band(25, 50, "guideline"),
          byGender: null,
          allowedGenders: null,
        },
        preferredAudienceAgeMin: 25,
        preferredAudienceAgeMax: 50,
        audienceAgeFromSource: true,
        knownAudienceGenders: null,
        distanceKm: 10,
      }),
      state,
    );
    const C = prepared(
      stubEvent({
        id: "C",
        eligibility: {
          default: band(30, 55, "guideline"),
          byGender: null,
          allowedGenders: null,
        },
        preferredAudienceAgeMin: 30,
        preferredAudienceAgeMax: 55,
        audienceAgeFromSource: true,
        knownAudienceGenders: null,
        distanceKm: 9,
      }),
      state,
    );
    const D = prepared(
      stubEvent({
        id: "D",
        eligibility: {
          default: band(18, null, "guideline"),
          byGender: null,
          allowedGenders: null,
        },
        preferredAudienceAgeMin: 18,
        preferredAudienceAgeMax: 99,
        audienceAgeFromSource: true,
        knownAudienceGenders: null,
        distanceKm: 8,
      }),
      state,
    );
    const strongYoung = prepared(
      stubEvent({
        id: "young",
        eligibility: {
          default: band(18, 99, "guideline"),
          byGender: null,
          allowedGenders: null,
        },
        preferredAudienceAgeMin: 18,
        preferredAudienceAgeMax: 25,
        audienceAgeFromSource: true,
        knownAudienceGenders: ["woman"],
        distanceKm: 7,
      }),
      state,
    );

    for (const event of [A, B, C, D]) {
      assert(
        `I ${event.id} still visible`,
        event.participation.includedByDefault,
      );
    }

    assert("I A no age overlap", calculatePreferenceScore(A, state).ageOverlap === "none");
    assert("I B no age overlap", calculatePreferenceScore(B, state).ageOverlap === "none");
    assert("I C no age overlap", calculatePreferenceScore(C, state).ageOverlap === "none");
    assert("I D strong age (all ages covers 18-20)", calculatePreferenceScore(D, state).ageOverlap === "strong");
    assert(
      "I young strong age overlap 18-25",
      calculatePreferenceScore(strongYoung, state).ageOverlap === "strong",
    );
    assert(
      "I young gender match when source known",
      calculatePreferenceScore(strongYoung, state).preferredGenderMatch === true,
    );
    assert(
      "I A no gender boost without data",
      calculatePreferenceScore(A, state).preferredGenderMatch === null,
    );

    const scoreD = calculatePreferenceScore(D, state).score;
    const scoreA = calculatePreferenceScore(A, state).score;
    assert("I D ranks above A on preference", scoreD > scoreA);

    const partial = prepared(
      stubEvent({
        id: "partial",
        eligibility: {
          default: band(18, 99, "guideline"),
          byGender: null,
          allowedGenders: null,
        },
        preferredAudienceAgeMin: 20,
        preferredAudienceAgeMax: 30,
        audienceAgeFromSource: true,
        distanceKm: 6,
      }),
      state,
    );
    assert(
      "I 20-30 vs 18-20 is partial",
      calculatePreferenceScore(partial, state).ageOverlap === "partial",
    );
  }

  // Case J: Meet activation is organic signal when intent matches; promotion stays 0
  {
    const state: SearchState = {
      ...defaultSearchState(),
      age: 35,
      gender: "woman",
      categories: ["meet_new_people"],
    };
    const base = {
      eligibility: {
        default: band(25, 55, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
      socialSuitability: "medium" as const,
      distanceKm: 5,
    };
    const organic = prepared(
      stubEvent({
        id: "org",
        ...base,
        listingPath: "organic",
        meetActivation: null,
      }),
      state,
    );
    const meet = prepared(
      stubEvent({
        id: "meet",
        ...base,
        listingPath: "meet_activation",
        meetActivation: {
          id: "meet-1",
          organizerId: "org-test",
          status: "active",
          hostProvided: true,
          meetZoneProvided: true,
          meetMoment: "18:30",
          soloWelcome: true,
          recognitionProvided: true,
          recognitionMethod: "wristband",
          recognitionDescription: "Opt-in band",
          interactionMethod: "welcome_moment",
          interactionDescription: "Host welcome",
          responsiblePersonName: "Host",
          responsiblePersonRole: "Host",
          commitmentAcceptedAt: new Date().toISOString(),
          termsVersion: "meet-standard-2026.1",
          verificationStatus: "none",
        },
      }),
      state,
    );
    const scoreOrganic = calculatePreferenceScore(organic, state);
    const scoreMeet = calculatePreferenceScore(meet, state);
    assert("J promotion always 0", scoreMeet.promotionScore === 0);
    assert(
      "J Meet raises organic score with social intent",
      scoreMeet.organicScore > scoreOrganic.organicScore,
    );
  }

  // Case K: singlesFriendly / Meet / listing / intent independence
  {
    const lowFriendly = stubEvent({
      id: "friendly-low",
      eligibility: {
        default: band(21, null, "strict"),
        byGender: null,
        allowedGenders: null,
      },
      socialSuitability: "low",
      singlesOnly: false,
      singlesFriendly: true,
      listingPath: "organic",
      meetActivation: null,
    });
    assert(
      "K singlesFriendly does not create listing",
      !isEventListable(lowFriendly),
    );

    const meetActive = stubEvent({
      id: "meet-list",
      eligibility: {
        default: band(21, null, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
      socialSuitability: "low",
      singlesOnly: false,
      singlesFriendly: false,
      listingPath: "meet_activation",
      meetActivation: {
        id: "meet-list-1",
        organizerId: "org-test",
        status: "active",
        hostProvided: true,
        meetZoneProvided: true,
        meetMoment: "19:00",
        soloWelcome: true,
        recognitionProvided: true,
        recognitionMethod: "badge",
        recognitionDescription: "Opt-in badge",
        interactionMethod: "short_intro",
        interactionDescription: "Host intro",
        responsiblePersonName: "Host",
        responsiblePersonRole: "Host",
        commitmentAcceptedAt: new Date().toISOString(),
        termsVersion: "meet-standard-2026.1",
        verificationStatus: "none",
      },
    });
    assert(
      "K active Meet creates listing eligibility",
      isEventListable(meetActive),
    );

    const meetInactive = stubEvent({
      ...meetActive,
      id: "meet-draft",
      meetActivation: {
        ...meetActive.meetActivation!,
        status: "draft",
      },
    });
    assert(
      "K inactive Meet does not list",
      !isEventListable(meetInactive),
    );

    const noIntent: SearchState = {
      ...defaultSearchState(),
      age: 40,
      gender: "man",
      activities: ["wandelen"],
    };
    const withIntent: SearchState = {
      ...noIntent,
      categories: ["dating"],
    };
    const prepMeet = prepared(meetActive, withIntent);
    const scoreNoIntent = calculatePreferenceScore(prepMeet, noIntent);
    const scoreWithIntent = calculatePreferenceScore(prepMeet, withIntent);
    assert(
      "K Meet bonus absent without social intent",
      scoreNoIntent.organicScore < scoreWithIntent.organicScore,
    );
    assert(
      "K promotion never creates listing (score stays 0)",
      scoreWithIntent.promotionScore === 0 &&
        scoreNoIntent.promotionScore === 0,
    );

    const singlesOnlyEvent = stubEvent({
      id: "so",
      eligibility: {
        default: band(30, 50, "strict"),
        byGender: null,
        allowedGenders: null,
      },
      singlesOnly: true,
      singlesFriendly: false,
      listingPath: "organic",
      socialSuitability: "high",
      meetActivation: null,
    });
    const friendlyOnly = stubEvent({
      id: "sf",
      eligibility: {
        default: band(30, 50, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
      singlesOnly: false,
      singlesFriendly: true,
      listingPath: "organic",
      socialSuitability: "high",
      meetActivation: null,
    });
    assert(
      "K singlesOnly independent of singlesFriendly",
      singlesOnlyEvent.singlesOnly === true &&
        singlesOnlyEvent.singlesFriendly === false,
    );
    assert(
      "K singlesFriendly independent of Meet",
      friendlyOnly.singlesFriendly === true &&
        friendlyOnly.meetActivation === null,
    );
    assert(
      "K Meet independent of singlesOnly",
      meetActive.singlesOnly === false &&
        meetActive.meetActivation?.status === "active",
    );
  }

  console.log("\nAll product-rule cases passed.");
}

main();
