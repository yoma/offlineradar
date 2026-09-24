import { ACTIVITY_FIT, CATEGORY_LABEL } from "@/lib/format";
import type { PreparedEvent } from "@/lib/filters";
import { calculatePreferenceScore } from "@/lib/ranking";
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
      "Geef je gender op om de deelnamevoorwaarden te controleren",
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

  if (preference.ageOverlap === "strong") {
    reasons.push("De leeftijdsgroep sluit goed aan bij je voorkeur");
  } else if (preference.ageOverlap === "partial") {
    reasons.push("De leeftijdsgroep sluit deels aan bij je voorkeur");
  }

  if (preference.preferredGenderMatch === true) {
    reasons.push(
      "De bron vermeldt een publiek dat aansluit bij wie je graag ontmoet",
    );
  }

  if (event.singlesOnly === true) {
    reasons.push("Dit event is expliciet voor singles");
  }

  if (event.meetActivation?.status === "active") {
    reasons.push(
      "De organisator voorziet een OfflineRadar Meet-opzet om openstaande bezoekers te helpen elkaar te vinden",
    );
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
