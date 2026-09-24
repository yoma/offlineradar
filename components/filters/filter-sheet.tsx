"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ACTIVITY_LABEL, AVAILABILITY_LABEL, DISTANCES, PRICE_LABEL, WHEN_LABEL } from "@/lib/format";
import type { ActivityId, EventCategory } from "@/types/event";
import type { AvailabilityFilter, PriceFilter, SearchState, WhenFilter } from "@/types/search";

const WHEN_OPTIONS: WhenFilter[] = [
  "today",
  "tomorrow",
  "weekend",
  "next_week",
  "month",
  "date",
];

const CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: "dating", label: "Dating" },
  { id: "meet_new_people", label: "Nieuwe mensen" },
  { id: "social", label: "Sociaal" },
];

export function FilterSheet({
  open,
  onOpenChange,
  state,
  count,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SearchState;
  count: number;
  onChange: (patch: Partial<SearchState>) => void;
}) {
  function toggleCategory(id: EventCategory) {
    const categories = state.categories.includes(id)
      ? state.categories.filter((item) => item !== id)
      : [...state.categories, id];
    onChange({ categories });
  }

  function toggleActivity(id: ActivityId) {
    const activities = state.activities.includes(id)
      ? state.activities.filter((item) => item !== id)
      : [...state.activities, id];
    onChange({ activities });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Leeftijd blijft een deelnamecheck. Je voorkeur voor een leeftijdsgroep verbergt geen events.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 overflow-y-auto px-4 pb-4">
          <FilterGroup title="Wanneer">
            <div className="flex flex-wrap gap-2">
              {WHEN_OPTIONS.map((option) => (
                <Choice
                  key={option}
                  pressed={state.when === option}
                  onClick={() =>
                    onChange({
                      when: state.when === option ? "any" : option,
                      date: option === "date" ? state.date : null,
                    })
                  }
                >
                  {WHEN_LABEL[option]}
                </Choice>
              ))}
            </div>
            {state.when === "date" ? (
              <Input
                type="date"
                className="mt-3 h-11"
                value={state.date ?? ""}
                onChange={(event) => onChange({ date: event.target.value || null })}
              />
            ) : null}
          </FilterGroup>

          <FilterGroup title="Afstand">
            <div className="grid grid-cols-4 gap-2">
              {DISTANCES.map((km) => (
                <Choice
                  key={km}
                  pressed={state.maxDistanceKm === km}
                  onClick={() => onChange({ maxDistanceKm: km })}
                >
                  {km} km
                </Choice>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Type">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <Choice
                  key={category.id}
                  pressed={state.categories.includes(category.id)}
                  onClick={() => toggleCategory(category.id)}
                >
                  {category.label}
                </Choice>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Activiteit">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ACTIVITY_LABEL) as ActivityId[]).map((activity) => (
                <Choice
                  key={activity}
                  pressed={state.activities.includes(activity)}
                  onClick={() => toggleActivity(activity)}
                >
                  {ACTIVITY_LABEL[activity]}
                </Choice>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Prijs">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRICE_LABEL) as PriceFilter[])
                .filter((price) => price !== "any")
                .map((price) => (
                  <Choice
                    key={price}
                    pressed={state.price === price}
                    onClick={() =>
                      onChange({ price: state.price === price ? "any" : price })
                    }
                  >
                    {PRICE_LABEL[price]}
                  </Choice>
                ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Beschikbaarheid">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AVAILABILITY_LABEL) as AvailabilityFilter[])
                .filter((item) => item !== "any")
                .map((item) => (
                  <Choice
                    key={item}
                    pressed={state.availability === item}
                    onClick={() =>
                      onChange({
                        availability: state.availability === item ? "any" : item,
                      })
                    }
                  >
                    {AVAILABILITY_LABEL[item]}
                  </Choice>
                ))}
            </div>
          </FilterGroup>

          <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <span>
              <span className="block text-sm font-medium">Alleen singles</span>
              <span className="text-sm text-muted-foreground">
                Enkel events die expliciet singles-only zijn.
              </span>
            </span>
            <input
              type="checkbox"
              checked={state.singlesOnly}
              onChange={(event) => onChange({ singlesOnly: event.target.checked })}
              className="size-5 accent-[var(--primary)]"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <span>
              <span className="block text-sm font-medium">Alleen strikte leeftijdsgrenzen</span>
              <span className="text-sm text-muted-foreground">
                Verbergt events die alleen een richtleeftijd vermelden.
              </span>
            </span>
            <input
              type="checkbox"
              checked={state.strictOnly}
              onChange={(event) => onChange({ strictOnly: event.target.checked })}
              className="size-5 accent-[var(--primary)]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pref-min">Ontmoeten vanaf</Label>
              <Input
                id="pref-min"
                type="number"
                min={18}
                max={99}
                className="h-11"
                value={state.preferredAgeMin ?? ""}
                onChange={(event) =>
                  onChange({
                    preferredAgeMin: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pref-max">tot</Label>
              <Input
                id="pref-max"
                type="number"
                min={18}
                max={99}
                className="h-11"
                value={state.preferredAgeMax ?? ""}
                onChange={(event) =>
                  onChange({
                    preferredAgeMax: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
            </div>
          </div>
        </div>
        <SheetFooter className="border-t">
          <Button className="h-12 rounded-xl" onClick={() => onOpenChange(false)}>
            <SlidersHorizontal className="size-4" />
            Toon {count} {count === 1 ? "activiteit" : "activiteiten"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

function Choice({
  pressed,
  children,
  onClick,
}: {
  pressed: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-sm ${
        pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card"
      }`}
    >
      {children}
    </button>
  );
}
