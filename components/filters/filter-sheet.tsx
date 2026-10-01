"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  AVAILABILITY_LABEL,
  DISTANCES,
  MEET_GENDER_LABEL,
  PRICE_LABEL,
  WHEN_HINT,
  WHEN_LABEL,
} from "@/lib/format";
import {
  isPublicActivityGroupSelected,
  PUBLIC_ACTIVITY_GROUPS,
  type PublicActivityGroupId,
  togglePublicActivityGroup,
} from "@/lib/public-activity-groups";
import type { EventCategory, PreferredMeetGender } from "@/types/event";
import type {
  AvailabilityFilter,
  PriceFilter,
  SearchState,
  WhenFilter,
} from "@/types/search";

const WHEN_OPTIONS: WhenFilter[] = [
  "any",
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
  organizerOptions = [],
  selectedOrganizers = [],
  onOrganizersChange,
  onClearAdvanced,
  footerLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SearchState;
  count: number;
  onChange: (patch: Partial<SearchState>) => void;
  organizerOptions?: Array<{
    id: string;
    slug: string;
    name: string;
    blurb?: string | null;
  }>;
  selectedOrganizers?: string[];
  onOrganizersChange?: (slugs: string[]) => void;
  onClearAdvanced?: () => void;
  footerLabel?: string;
}) {
  function toggleCategory(id: EventCategory) {
    const categories = state.categories.includes(id)
      ? state.categories.filter((item) => item !== id)
      : [...state.categories, id];
    onChange({ categories });
  }

  function toggleActivityGroup(id: PublicActivityGroupId) {
    onChange({ activities: togglePublicActivityGroup(state.activities, id) });
  }

  const allTypes =
    state.categories.length === 0 && state.activities.length === 0;

  function clearAdvanced() {
    onChange({
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
    onOrganizersChange?.([]);
    onClearAdvanced?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[min(88vh,100dvh)] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
      >
        <SheetHeader>
          <SheetTitle>Meer filters</SheetTitle>
          <SheetDescription>
            Leeftijd blijft een deelnamecheck. Je voorkeur voor een leeftijdsgroep
            verbergt geen events.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          {organizerOptions.length > 0 && onOrganizersChange ? (
            <OrganizerPicker
              options={organizerOptions}
              selected={selectedOrganizers}
              onChange={onOrganizersChange}
            />
          ) : null}

          <FilterGroup title="Wanneer">
            <p className="mb-2 text-sm text-muted-foreground">
              Kies één periode. {WHEN_HINT[state.when] ?? ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {WHEN_OPTIONS.map((option) => (
                <Choice
                  key={option}
                  pressed={state.when === option}
                  onClick={() =>
                    onChange({
                      when: option,
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
                onChange={(event) =>
                  onChange({ when: "date", date: event.target.value || null })
                }
              />
            ) : null}
          </FilterGroup>

          <FilterGroup title="Afstand">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Choice
                pressed={allTypes}
                onClick={() => onChange({ categories: [], activities: [] })}
              >
                Alle soorten
              </Choice>
              <span className="text-xs text-muted-foreground">
                of kies specifiek
              </span>
            </div>
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
              {PUBLIC_ACTIVITY_GROUPS.map((group) => (
                <Choice
                  key={group.id}
                  pressed={isPublicActivityGroupSelected(
                    state.activities,
                    group.id,
                  )}
                  onClick={() => toggleActivityGroup(group.id)}
                >
                  {group.label}
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
                        availability:
                          state.availability === item ? "any" : item,
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
              onChange={(event) =>
                onChange({ singlesOnly: event.target.checked })
              }
              className="size-5 accent-[var(--primary)]"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <span>
              <span className="block text-sm font-medium">
                Alleen strikte leeftijdsgrenzen
              </span>
              <span className="text-sm text-muted-foreground">
                Verbergt events die alleen een richtleeftijd vermelden.
              </span>
            </span>
            <input
              type="checkbox"
              checked={state.strictOnly}
              onChange={(event) =>
                onChange({ strictOnly: event.target.checked })
              }
              className="size-5 accent-[var(--primary)]"
            />
          </label>

          <div className="space-y-2">
            <Label>Wie wil je graag ontmoeten?</Label>
            <p className="text-xs text-muted-foreground">
              Voorkeur voor sorteren. Verbergt geen activiteiten.
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MEET_GENDER_LABEL) as PreferredMeetGender[]).map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={state.preferredMeetGender === key}
                    onClick={() => onChange({ preferredMeetGender: key })}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      state.preferredMeetGender === key
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-white"
                    }`}
                  >
                    {MEET_GENDER_LABEL[key]}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pref-min">Gewenste leeftijd vanaf</Label>
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

          <button
            type="button"
            onClick={clearAdvanced}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Wis extra filters
          </button>
        </div>
        <SheetFooter className="border-t">
          <Button className="h-12 rounded-xl" onClick={() => onOpenChange(false)}>
            <SlidersHorizontal className="size-4" />
            {footerLabel ??
              `Toon ${count} ${count === 1 ? "activiteit" : "activiteiten"}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function OrganizerPicker({
  options,
  selected,
  onChange,
}: {
  options: Array<{
    id: string;
    slug: string;
    name: string;
    blurb?: string | null;
  }>;
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selectedRecords = useMemo(
    () =>
      selected
        .map((slug) => options.find((item) => item.slug === slug))
        .filter(
          (
            item,
          ): item is {
            id: string;
            slug: string;
            name: string;
            blurb?: string | null;
          } => Boolean(item),
        ),
    [options, selected],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((item) => {
      if (selected.includes(item.slug)) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.slug.includes(needle) ||
        (item.blurb?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [options, query, selected]);

  return (
    <FilterGroup title="Organisator">
      <div ref={boxRef} className="relative">
        {selectedRecords.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedRecords.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() =>
                  onChange(selected.filter((slug) => slug !== item.slug))
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-1.5 text-sm text-white"
                aria-label={`${item.name} verwijderen`}
              >
                {item.name}
                <X className="size-3.5 opacity-80" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
        <label className="relative block">
          <span className="sr-only">Zoek of kies een organisator</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Zoek of kies een organisator…"
            className="h-11 w-full rounded-full border border-border bg-white pr-3 pl-9 text-sm font-medium outline-none focus:border-foreground"
            autoComplete="off"
          />
        </label>
        {open ? (
          <ul
            role="listbox"
            className="absolute z-20 mt-1.5 max-h-56 w-full overflow-auto rounded-2xl border border-border bg-white py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted-foreground">
                Geen organisator gevonden
              </li>
            ) : (
              filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-black/[0.04]"
                    onClick={() => {
                      onChange(
                        selected.includes(item.slug)
                          ? selected
                          : [...selected, item.slug],
                      );
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="text-sm font-semibold">{item.name}</span>
                    {item.blurb ? (
                      <span className="text-xs text-muted-foreground">
                        {item.blurb}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </FilterGroup>
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
