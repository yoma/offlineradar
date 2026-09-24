import type { EligibilityAgeRule } from "@/types/event";

export type EligibilityUser = {
  age: number | null;
};

export type EligibilityEvent = {
  eligibilityAgeMin: number | null;
  eligibilityAgeMax: number | null;
  eligibilityAgeRule: EligibilityAgeRule;
};

export type EligibilityStatus =
  | "eligible"
  | "guideline"
  | "unknown"
  | "ineligible"
  | "needs_age";

export type EligibilityResult = {
  status: EligibilityStatus;
  includedByDefault: boolean;
  inRange: boolean | null;
  title: string;
  detail: string;
};

function hasKnownBounds(event: EligibilityEvent): boolean {
  return event.eligibilityAgeMin != null || event.eligibilityAgeMax != null;
}

export function isInAgeRange(
  age: number,
  min: number | null,
  max: number | null,
): boolean {
  if (min != null && age < min) return false;
  if (max != null && age > max) return false;
  return true;
}

/**
 * Hard participation check.
 * strict + outside the known range => hidden.
 * guideline is not a hard bar.
 * unknown stays visible. Bounds are never invented.
 */
export function isEligibleForEvent(
  user: EligibilityUser,
  event: EligibilityEvent,
): EligibilityResult {
  if (event.eligibilityAgeRule === "unknown" || !hasKnownBounds(event)) {
    return {
      status: "unknown",
      includedByDefault: true,
      inRange: null,
      title: "Controleer deelnamevoorwaarden",
      detail:
        "De bron vermeldt geen duidelijke leeftijdsgrenzen. OfflineRadar verzint die niet.",
    };
  }

  if (user.age == null) {
    return {
      status: "needs_age",
      includedByDefault: false,
      inRange: null,
      title: "Leeftijd nodig",
      detail: "Vul je leeftijd in om te controleren of je mag deelnemen.",
    };
  }

  const inRange = isInAgeRange(
    user.age,
    event.eligibilityAgeMin,
    event.eligibilityAgeMax,
  );

  if (event.eligibilityAgeRule === "strict") {
    if (!inRange) {
      return {
        status: "ineligible",
        includedByDefault: false,
        inRange: false,
        title: "Je kunt niet deelnemen",
        detail:
          "Je leeftijd valt buiten de strikte deelnamevoorwaarden. Daarom tonen we dit event niet in je resultaten.",
      };
    }
    return {
      status: "eligible",
      includedByDefault: true,
      inRange: true,
      title: "Je kunt deelnemen",
      detail: "Je leeftijd valt binnen de strikte deelnamevoorwaarden.",
    };
  }

  if (inRange) {
    return {
      status: "guideline",
      includedByDefault: true,
      inRange: true,
      title: "Richtleeftijd · je kunt deelnemen",
      detail:
        "De organisator vermeldt een richtleeftijd, geen harde grens. Jij valt binnen die richtlijn.",
    };
  }

  return {
    status: "guideline",
    includedByDefault: true,
    inRange: false,
    title: "Richtleeftijd · geen harde grens",
    detail:
      "Je valt buiten de genoemde richtleeftijd. Dat is geen strikte voorwaarde, dus het event blijft zichtbaar.",
  };
}
