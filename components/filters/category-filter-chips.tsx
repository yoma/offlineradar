"use client";

import {
  isPublicActivityGroupSelected,
  type PublicActivityGroupId,
  togglePublicActivityGroup,
} from "@/lib/public-activity-groups";
import type { ActivityId, EventCategory } from "@/types/event";
import type { SearchState } from "@/types/search";

/** Unified Categorieën chips → categories[] / activities[] state. */
type CategoryChip =
  | { kind: "all"; label: string }
  | { kind: "category"; id: EventCategory; label: string }
  | { kind: "activity"; id: PublicActivityGroupId; label: string };

export const CATEGORY_CHIPS: CategoryChip[] = [
  { kind: "all", label: "Alle soorten" },
  { kind: "activity", id: "speeddate", label: "Speeddate" },
  { kind: "category", id: "dating", label: "Dating" },
  { kind: "category", id: "meet_new_people", label: "Nieuwe mensen" },
  { kind: "activity", id: "sport_active", label: "Sport & actief" },
  { kind: "activity", id: "eten", label: "Dinner / food" },
  { kind: "activity", id: "drinken", label: "Drinks / apero" },
  { kind: "activity", id: "party", label: "Party" },
  { kind: "activity", id: "workshop", label: "Workshop" },
  { kind: "activity", id: "travel", label: "Weekend / reis" },
];

const CATEGORY_IDS = CATEGORY_CHIPS.flatMap((chip) =>
  chip.kind === "category" ? [chip.id] : [],
);
const GROUP_IDS = CATEGORY_CHIPS.flatMap((chip) =>
  chip.kind === "activity" ? [chip.id] : [],
);

/** Chips that are "on" (gold). Alle soorten = every chip on. */
function selectedChips(state: SearchState): {
  categories: EventCategory[];
  groups: PublicActivityGroupId[];
} {
  if (state.typesMode === "all") {
    return { categories: [...CATEGORY_IDS], groups: [...GROUP_IDS] };
  }
  if (state.typesMode === "none") return { categories: [], groups: [] };
  return {
    categories: CATEGORY_IDS.filter((id) => state.categories.includes(id)),
    groups: GROUP_IDS.filter((id) =>
      isPublicActivityGroupSelected(state.activities, id),
    ),
  };
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item)
    ? list.filter((value) => value !== item)
    : [...list, item];
}

/**
 * Chips work as on/off switches. Alle soorten turns every chip on (gold), so
 * one tap switches a type off to exclude it. Tapping Alle soorten while
 * everything is on clears the row, to pick just one or two types.
 */
export function applyCategoryChipPatch(
  state: SearchState,
  chip: CategoryChip,
): Partial<SearchState> {
  if (chip.kind === "all") {
    return state.typesMode === "all"
      ? { typesMode: "none", categories: [], activities: [] }
      : { typesMode: "all", categories: [], activities: [] };
  }
  const current = selectedChips(state);
  const categories =
    chip.kind === "category"
      ? toggle(current.categories, chip.id)
      : current.categories;
  const groups =
    chip.kind === "activity" ? toggle(current.groups, chip.id) : current.groups;

  const everyChipOn =
    categories.length === CATEGORY_IDS.length &&
    groups.length === GROUP_IDS.length;
  if (everyChipOn) return { typesMode: "all", categories: [], activities: [] };
  if (categories.length === 0 && groups.length === 0) {
    return { typesMode: "none", categories: [], activities: [] };
  }
  return {
    typesMode: "pick",
    categories,
    activities: groups.reduce<ActivityId[]>(
      (acc, id) => togglePublicActivityGroup(acc, id),
      [],
    ),
  };
}

function chipPressed(state: SearchState, chip: CategoryChip): boolean {
  if (chip.kind === "all") return state.typesMode === "all";
  const current = selectedChips(state);
  if (chip.kind === "category") return current.categories.includes(chip.id);
  return current.groups.includes(chip.id);
}

/**
 * Primary category filter row (homepage search card + /ontdek).
 */
export function CategoryFilterChips({
  state,
  onChange,
  className = "",
}: {
  state: SearchState;
  onChange: (patch: Partial<SearchState>) => void;
  className?: string;
}) {
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="brand-section-label mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
        Categorieën
      </legend>
      <p className="mb-2 text-xs text-muted-foreground">
        {state.typesMode === "all"
          ? "Alles staat aan. Tik een soort uit om ze te verbergen."
          : state.typesMode === "none"
            ? "Tik de soorten aan die je wil zien."
            : "Tik Alle soorten om alles weer aan te zetten."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_CHIPS.map((chip) => {
          const pressed = chipPressed(state, chip);
          const key =
            chip.kind === "all" ? "all" : `${chip.kind}-${chip.id}`;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(applyCategoryChipPatch(state, chip))}
              className={`rounded-full border px-2.5 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--brand-bordeaux)_55%,var(--brand-gold))] ${
                pressed
                  ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_12px_-8px_rgba(134,105,31,0.55)]"
                  : "brand-chip-idle"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
