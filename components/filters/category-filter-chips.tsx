"use client";

import {
  isPublicActivityGroupSelected,
  type PublicActivityGroupId,
  togglePublicActivityGroup,
} from "@/lib/public-activity-groups";
import type { EventCategory } from "@/types/event";
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

export function applyCategoryChipPatch(
  state: SearchState,
  chip: CategoryChip,
): Partial<SearchState> {
  if (chip.kind === "all") {
    // "Alle soorten" is sticky: never toggle into empty "none" (false zeros).
    return { typesMode: "all", categories: [], activities: [] };
  }
  if (chip.kind === "category") {
    // Leaving "all": start a fresh pick with only this chip.
    if (state.typesMode === "all") {
      return {
        typesMode: "pick",
        categories: [chip.id],
        activities: [],
      };
    }
    const categories = state.categories.includes(chip.id)
      ? state.categories.filter((item) => item !== chip.id)
      : [...state.categories, chip.id];
    return {
      typesMode:
        categories.length > 0 || state.activities.length > 0 ? "pick" : "all",
      categories,
      activities: state.activities,
    };
  }
  if (state.typesMode === "all") {
    return {
      typesMode: "pick",
      categories: [],
      activities: togglePublicActivityGroup([], chip.id),
    };
  }
  const activities = togglePublicActivityGroup(state.activities, chip.id);
  return {
    typesMode:
      state.categories.length > 0 || activities.length > 0 ? "pick" : "all",
    categories: state.categories,
    activities,
  };
}

function chipPressed(state: SearchState, chip: CategoryChip): boolean {
  if (chip.kind === "all") return state.typesMode !== "pick";
  if (state.typesMode !== "pick") return false;
  if (chip.kind === "category") return state.categories.includes(chip.id);
  return isPublicActivityGroupSelected(state.activities, chip.id);
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
      <legend className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Categorieën
      </legend>
      <p className="mb-2 text-xs text-muted-foreground">
        Laat Alle soorten staan, of tik wat je wil zien.
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
              className={`rounded-full border px-2.5 py-1.5 text-sm transition ${
                pressed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-foreground/25"
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
