import { ACTIVITY_FIT, CATEGORY_LABEL } from "@/lib/format";
import type { PreparedEvent } from "@/lib/filters";
import { preferenceOverlaps } from "@/lib/ranking";
import type { SearchState } from "@/types/search";

export function whyThisFits(event: PreparedEvent, state: SearchState): string[] {
  const reasons: string[] = [];

  if (event.eligibility.status === "eligible") {
    reasons.push("Je leeftijd voldoet aan de deelnamevoorwaarden");
  } else if (
    event.eligibility.status === "guideline" &&
    event.eligibility.inRange
  ) {
    reasons.push("Dit event hanteert een richtleeftijd en jij valt daarbinnen");
  } else if (event.eligibility.status === "guideline") {
    reasons.push("De leeftijd is een richtlijn, geen harde voorwaarde");
  } else if (event.eligibility.status === "unknown") {
    reasons.push(
      "Deelnamevoorwaarden zijn niet volledig bekend. Controleer ze bij de organisator",
    );
  }

  reasons.push(`${event.distanceKm} km van jou`);

  const matchedActivity = state.activities.find((activity) =>
    event.activities.includes(activity),
  );
  if (matchedActivity) reasons.push(ACTIVITY_FIT[matchedActivity]);

  const overlap = preferenceOverlaps(event, state);
  if (overlap === true) {
    reasons.push("De leeftijdsgroep sluit aan bij je voorkeur");
  }

  if (state.categories.includes(event.category)) {
    reasons.push(`Dit sluit aan bij ${CATEGORY_LABEL[event.category]}`);
  }

  if (state.singlesOnly && event.singlesOnly) {
    reasons.push("Dit is expliciet voor singles");
  }

  return reasons.slice(0, 4);
}
