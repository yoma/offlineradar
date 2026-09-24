import { ACTIVITY_FIT, CATEGORY_LABEL } from "@/lib/format";
import type { PreparedEvent } from "@/lib/filters";
import {
  calculatePreferenceScore,
  preferenceOverlaps,
} from "@/lib/ranking";
import type { SearchState } from "@/types/search";

export function whyThisFits(
  event: PreparedEvent,
  state: SearchState,
): string[] {
  const reasons: string[] = [];
  const preference = calculatePreferenceScore(event, state);

  if (event.participation.status === "eligible") {
    reasons.push("Je voldoet aan de deelnamevoorwaarden");
  } else if (
    event.participation.status === "guideline" &&
    event.participation.inRange
  ) {
    reasons.push("Je valt binnen de richtleeftijd van dit event");
  } else if (event.participation.status === "guideline") {
    reasons.push(
      "De leeftijd is een richtlijn, geen harde voorwaarde. Controleer bij de organisator",
    );
  } else if (event.participation.status === "unknown") {
    reasons.push(
      "Deelnamevoorwaarden zijn niet volledig bekend. Controleer ze bij de organisator",
    );
  } else if (event.participation.status === "needs_gender") {
    reasons.push(
      "Geef je gender op om de deelnamevoorwaarden exact te controleren",
    );
  }

  reasons.push(`Slechts ${event.distanceKm} km van je zoeklocatie`);

  const matchedActivity = state.activities.find((activity) =>
    event.activities.includes(activity),
  );
  if (matchedActivity) {
    reasons.push(ACTIVITY_FIT[matchedActivity]);
  } else if (state.categories.includes(event.category)) {
    reasons.push(`Dit sluit aan bij ${CATEGORY_LABEL[event.category]}`);
  }

  if (preferenceOverlaps(event, state) === true) {
    reasons.push("De verwachte leeftijdsgroep sluit aan bij je voorkeur");
  }

  if (preference.preferredGenderMatch === true) {
    reasons.push(
      "De bron vermeldt een publiek dat aansluit bij wie je graag ontmoet",
    );
  }

  if (event.singlesOnly === true) {
    reasons.push("Dit event is expliciet voor singles");
  }

  if (
    event.practicalInfo.some((item) =>
      /alleen|solo|kom alleen/i.test(item),
    )
  ) {
    reasons.push("Solo deelnemen is mogelijk");
  }

  return [...new Set(reasons)].slice(0, 5);
}
