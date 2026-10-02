/**
 * Shared active-filter chips for homepage + /ontdek.
 * One semantics: empty categories/activities = all types.
 */
import {
  AVAILABILITY_LABEL,
  CATEGORY_LABEL,
  formatAgeRange,
  MEET_GENDER_LABEL,
  PRICE_LABEL,
  WHEN_LABEL,
} from "@/lib/format";
import { publicActivityChipsFromSelection } from "@/lib/public-activity-groups";
import { applySearchPatch } from "@/lib/search-state";
import type { SearchState } from "@/types/search";

export type FilterChip = {
  id: string;
  label: string;
  kind: "filter" | "preference" | "date" | "organizer";
};

export type ActiveChipOptions = {
  /** Include when + distance chips (discover results bar). */
  includeCoreTiming?: boolean;
  /** Selected organizer slugs → chips. */
  organizerSlugs?: string[];
  organizerNames?: Record<string, string>;
};

/** Non-default advanced filters only (organizer, type, activity, price, …). */
export function countExtraFilters(
  state: SearchState,
  organizerSlugs: string[] = [],
): number {
  let n = 0;
  if (state.categories.length > 0) n += 1;
  if (state.activities.length > 0) n += 1;
  if (state.price !== "any") n += 1;
  if (state.singlesOnly) n += 1;
  if (state.availability !== "any") n += 1;
  if (state.strictOnly) n += 1;
  if (state.preferredMeetGender !== "anyone") n += 1;
  if (state.preferredAgeMin != null || state.preferredAgeMax != null) n += 1;
  if (organizerSlugs.length > 0) n += 1;
  return n;
}

export function activeFilterChips(
  state: SearchState,
  options: ActiveChipOptions = {},
): FilterChip[] {
  const includeCore = options.includeCoreTiming === true;
  const chips: FilterChip[] = [];

  if (includeCore && state.when !== "any") {
    chips.push({
      id: "when",
      label:
        state.when === "date" && state.date
          ? state.date
          : WHEN_LABEL[state.when],
      kind: "date",
    });
  }
  if (includeCore && state.maxDistanceKm !== 100) {
    chips.push({
      id: "distance",
      label: `Binnen ${state.maxDistanceKm} km`,
      kind: "filter",
    });
  }

  for (const slug of options.organizerSlugs ?? []) {
    chips.push({
      id: `org-${slug}`,
      label: `Organisator: ${options.organizerNames?.[slug] ?? slug}`,
      kind: "organizer",
    });
  }

  if (state.preferredMeetGender !== "anyone") {
    chips.push({
      id: "meet-gender",
      label: `Ontmoet ${MEET_GENDER_LABEL[state.preferredMeetGender].toLowerCase()}`,
      kind: "preference",
    });
  }
  if (state.preferredAgeMin != null || state.preferredAgeMax != null) {
    chips.push({
      id: "pref-age",
      label:
        formatAgeRange(state.preferredAgeMin, state.preferredAgeMax) ??
        "Leeftijd",
      kind: "preference",
    });
  }
  for (const category of state.categories) {
    chips.push({
      id: `cat-${category}`,
      label: CATEGORY_LABEL[category],
      kind: "filter",
    });
  }
  for (const activityChip of publicActivityChipsFromSelection(state.activities)) {
    chips.push({
      id: `act-${activityChip.id}`,
      label: activityChip.label,
      kind: "filter",
    });
  }
  if (state.price !== "any") {
    chips.push({
      id: "price",
      label: PRICE_LABEL[state.price],
      kind: "filter",
    });
  }
  if (state.singlesOnly) {
    chips.push({
      id: "singles",
      label: "Alleen singles",
      kind: "filter",
    });
  }
  if (state.availability !== "any") {
    chips.push({
      id: "avail",
      label: AVAILABILITY_LABEL[state.availability],
      kind: "filter",
    });
  }
  if (state.strictOnly) {
    chips.push({
      id: "strict",
      label: "Alleen strikte leeftijd",
      kind: "filter",
    });
  }
  return chips;
}

export function removeChipFromState(
  state: SearchState,
  chipId: string,
): SearchState {
  if (chipId === "when") {
    return applySearchPatch(state, { when: "any", date: null });
  }
  if (chipId === "distance") {
    return applySearchPatch(state, { maxDistanceKm: 100 });
  }
  if (chipId === "meet-gender") {
    return applySearchPatch(state, { preferredMeetGender: "anyone" });
  }
  if (chipId === "pref-age") {
    return applySearchPatch(state, {
      preferredAgeMin: null,
      preferredAgeMax: null,
    });
  }
  if (chipId === "price") return applySearchPatch(state, { price: "any" });
  if (chipId === "singles") {
    return applySearchPatch(state, { singlesOnly: false });
  }
  if (chipId === "avail") {
    return applySearchPatch(state, { availability: "any" });
  }
  if (chipId === "strict") {
    return applySearchPatch(state, { strictOnly: false });
  }
  if (chipId.startsWith("cat-")) {
    const category = chipId.slice(4);
    return applySearchPatch(state, {
      categories: state.categories.filter((item) => item !== category),
    });
  }
  if (chipId.startsWith("act-")) {
    const activityKey = chipId.slice(4);
    const groupChip = publicActivityChipsFromSelection(state.activities).find(
      (chip) => chip.id === activityKey,
    );
    if (groupChip) {
      const remove = new Set(groupChip.activities);
      return applySearchPatch(state, {
        activities: state.activities.filter((item) => !remove.has(item)),
      });
    }
    return applySearchPatch(state, {
      activities: state.activities.filter((item) => item !== activityKey),
    });
  }
  return state;
}

/** Clear advanced filters only (keeps place/age/gender/when/distance). */
export function clearAdvancedSearchFilters(
  state: SearchState,
): SearchState {
  return applySearchPatch(state, {
    typesMode: "all",
    categories: [],
    activities: [],
    price: "any",
    singlesOnly: false,
    availability: "any",
    strictOnly: false,
    preferredMeetGender: "anyone",
    preferredAgeMin: null,
    preferredAgeMax: null,
  });
}

export function extraFiltersSummary(
  state: SearchState,
  organizerSlugs: string[] = [],
  organizerNames: Record<string, string> = {},
): string | null {
  const parts: string[] = [];
  if (organizerSlugs.length === 1) {
    parts.push(organizerNames[organizerSlugs[0]!] ?? "Organisator");
  } else if (organizerSlugs.length > 1) {
    parts.push(`${organizerSlugs.length} organisatoren`);
  }
  for (const category of state.categories.slice(0, 2)) {
    parts.push(CATEGORY_LABEL[category]);
  }
  const acts = publicActivityChipsFromSelection(state.activities);
  for (const act of acts.slice(0, 2)) parts.push(act.label);
  if (state.singlesOnly) parts.push("Alleen singles");
  if (state.price !== "any") parts.push(PRICE_LABEL[state.price]);
  if (state.strictOnly) parts.push("Strikte leeftijd");
  if (parts.length === 0) return null;
  return parts.slice(0, 3).join(" + ");
}
