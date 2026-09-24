import type {
  AgeEligibilityBand,
  Event,
  EventEligibility,
  ParticipantGender,
  UserGender,
} from "@/types/event";

export type EligibilityUser = {
  age: number | null;
  gender: UserGender | null;
};

export type EligibilityStatus =
  | "eligible"
  | "guideline"
  | "unknown"
  | "ineligible"
  | "needs_age"
  | "needs_gender";

export type EligibilityResult = {
  status: EligibilityStatus;
  includedByDefault: boolean;
  inRange: boolean | null;
  title: string;
  detail: string;
  /** Band that was applied for this user, if any. */
  appliedBand: AgeEligibilityBand | null;
};

export function isInAgeRange(
  age: number,
  min: number | null,
  max: number | null,
): boolean {
  if (min != null && age < min) return false;
  if (max != null && age > max) return false;
  return true;
}

function bandHasBounds(band: AgeEligibilityBand | null | undefined): boolean {
  if (!band) return false;
  if (band.ageRule === "unknown") return false;
  return band.ageMin != null || band.ageMax != null;
}

function toParticipantGender(gender: UserGender | null): ParticipantGender | null {
  if (gender === "man" || gender === "woman") return gender;
  return null;
}

/**
 * Resolve the age band that applies to this user.
 * Never invents bounds.
 */
export function resolveEligibilityBand(
  eligibility: EventEligibility,
  gender: UserGender | null,
): { band: AgeEligibilityBand | null; reason: "gender" | "default" | "none" | "needs_gender" } {
  const participant = toParticipantGender(gender);
  const byGender = eligibility.byGender;

  if (byGender && (byGender.man || byGender.woman)) {
    if (participant && byGender[participant]) {
      return { band: byGender[participant] ?? null, reason: "gender" };
    }
    if (participant && !byGender[participant] && eligibility.default) {
      return { band: eligibility.default, reason: "default" };
    }
    if (!participant) {
      if (eligibility.default) {
        return { band: eligibility.default, reason: "default" };
      }
      return { band: null, reason: "needs_gender" };
    }
  }

  if (eligibility.default) {
    return { band: eligibility.default, reason: "default" };
  }

  return { band: null, reason: "none" };
}

function isGenderAllowed(
  eligibility: EventEligibility,
  gender: UserGender | null,
): boolean | null {
  if (!eligibility.allowedGenders || eligibility.allowedGenders.length === 0) {
    return null;
  }
  const participant = toParticipantGender(gender);
  if (!participant) return null;
  return eligibility.allowedGenders.includes(participant);
}

function formatBandLabel(band: AgeEligibilityBand): string {
  if (band.ageMin != null && band.ageMax != null) {
    return `${band.ageMin}–${band.ageMax} jaar`;
  }
  if (band.ageMin != null) return `${band.ageMin}+ jaar`;
  if (band.ageMax != null) return `tot ${band.ageMax} jaar`;
  return "onbekend";
}

/**
 * Hard participation check.
 * Preference (who you want to meet, preferred ages) must NEVER be applied here.
 */
export function isEligibleForEvent(
  user: EligibilityUser,
  event: Pick<Event, "eligibility">,
): EligibilityResult {
  const { eligibility } = event;

  const genderAllowed = isGenderAllowed(eligibility, user.gender);
  if (genderAllowed === false) {
    return {
      status: "ineligible",
      includedByDefault: false,
      inRange: null,
      title: "Je kunt niet deelnemen",
      detail:
        "Dit event is volgens de bron niet open voor jouw gender. Daarom tonen we het niet in je resultaten.",
      appliedBand: null,
    };
  }

  const resolved = resolveEligibilityBand(eligibility, user.gender);

  if (resolved.reason === "needs_gender") {
    return {
      status: "needs_gender",
      includedByDefault: true,
      inRange: null,
      title: "Controleer deelnamevoorwaarden",
      detail:
        "Dit event heeft genderspecifieke leeftijdsvoorwaarden. Geef je gender op om de deelnamevoorwaarden te controleren, of check de officiële bron.",
      appliedBand: null,
    };
  }

  const applied = resolved.band;

  if (!applied || applied.ageRule === "unknown" || !bandHasBounds(applied)) {
    return {
      status: "unknown",
      includedByDefault: true,
      inRange: null,
      title: "Deelnamevoorwaarden niet volledig bekend",
      detail:
        "De bron vermeldt geen duidelijke deelnamevoorwaarden. OfflineRadar verzint die niet. Controleer ze bij de organisator.",
      appliedBand: applied,
    };
  }

  if (user.age == null) {
    return {
      status: "needs_age",
      includedByDefault: false,
      inRange: null,
      title: "Leeftijd nodig",
      detail: "Vul je leeftijd in om te controleren of je mag deelnemen.",
      appliedBand: applied,
    };
  }

  const inRange = isInAgeRange(user.age, applied.ageMin, applied.ageMax);
  const label = formatBandLabel(applied);

  if (applied.ageRule === "strict") {
    if (!inRange) {
      return {
        status: "ineligible",
        includedByDefault: false,
        inRange: false,
        title: "Je kunt niet deelnemen",
        detail: `Je leeftijd valt buiten de strikte deelnamevoorwaarden (${label}). Daarom tonen we dit event niet in je resultaten.`,
        appliedBand: applied,
      };
    }
    return {
      status: "eligible",
      includedByDefault: true,
      inRange: true,
      title: "Je kunt deelnemen",
      detail: `Je leeftijd valt binnen de strikte deelnamevoorwaarden (${label}).`,
      appliedBand: applied,
    };
  }

  // guideline: never a hard bar
  if (inRange) {
    return {
      status: "guideline",
      includedByDefault: true,
      inRange: true,
      title: `Richtleeftijd: ${label}`,
      detail:
        "De organisator vermeldt een richtleeftijd, geen harde grens. Jij valt binnen die richtlijn.",
      appliedBand: applied,
    };
  }

  return {
    status: "guideline",
    includedByDefault: true,
    inRange: false,
    title: `Richtleeftijd: ${label}`,
    detail:
      "Je valt buiten de genoemde richtleeftijd. Dat is geen strikte voorwaarde. Controleer deelnamevoorwaarden bij de organisator.",
    appliedBand: applied,
  };
}

/** Display age line for cards, gender-aware when possible. */
export function displayEligibilityAge(
  event: Pick<Event, "eligibility" | "eligibilityAgeMin" | "eligibilityAgeMax" | "eligibilityAgeRule">,
  gender: UserGender | null,
): {
  min: number | null;
  max: number | null;
  rule: import("@/types/event").EligibilityAgeRule;
  gendered: boolean;
} {
  const resolved = resolveEligibilityBand(event.eligibility, gender);
  if (resolved.band && bandHasBounds(resolved.band)) {
    return {
      min: resolved.band.ageMin,
      max: resolved.band.ageMax,
      rule: resolved.band.ageRule,
      gendered: resolved.reason === "gender",
    };
  }
  return {
    min: event.eligibilityAgeMin,
    max: event.eligibilityAgeMax,
    rule: event.eligibilityAgeRule,
    gendered: false,
  };
}
