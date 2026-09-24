"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EventCard } from "@/components/events/event-card";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_PLACES } from "@/data/places";
import { track } from "@/lib/analytics";
import { matchingEvents, placeLabel } from "@/lib/filters";
import { ACTIVITY_LABEL, AVAILABILITY_LABEL, formatAgeRange, PRICE_LABEL, SORT_LABEL, WHEN_LABEL } from "@/lib/format";
import { sortEvents } from "@/lib/ranking";
import {
  applyStoredProfile,
  profileFromSearch,
  serializeSearchState,
} from "@/lib/search-state";
import { readProfile, writeProfile } from "@/lib/storage";
import type { Event } from "@/types/event";
import type { SearchState, SortKey } from "@/types/search";

export function DiscoverView({
  events,
  initial,
}: {
  events: Event[];
  initial: SearchState;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [ageDraft, setAgeDraft] = useState(initial.age ? String(initial.age) : "");
  const zeroTracked = useRef("");

  useEffect(() => {
    const stored = readProfile();
    setState((current) => applyStoredProfile(current, stored));
    setAgeDraft((current) => current || (stored.age ? String(stored.age) : ""));
    setBooted(true);
  }, []);

  useEffect(() => {
    if (!booted) return;
    writeProfile(profileFromSearch(state));
    const next = serializeSearchState(state);
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      router.replace(next ? `/ontdek?${next}` : "/ontdek", { scroll: false });
    }
  }, [booted, router, state]);

  const result = useMemo(() => matchingEvents(events, state), [events, state]);
  const visible = useMemo(() => sortEvents(result.visible, state), [result.visible, state]);

  useEffect(() => {
    if (!booted || state.age == null || visible.length > 0) return;
    const signature = serializeSearchState(state);
    if (zeroTracked.current === signature) return;
    zeroTracked.current = signature;
    track("zero_results", { filters: signature });
  }, [booted, state, visible.length]);

  function update(patch: Partial<SearchState>) {
    setState((current) => {
      const next = { ...current, ...patch };
      track("filter_changed", {
        when: next.when,
        distance: next.maxDistanceKm,
        categories: next.categories.join(","),
        activities: next.activities.join(","),
        price: next.price,
        singlesOnly: next.singlesOnly,
        availability: next.availability,
        strictOnly: next.strictOnly,
        sort: next.sort,
      });
      return next;
    });
  }

  const chips = activeChips(state);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {state.age == null
              ? "Activiteiten"
              : `${visible.length} ${visible.length === 1 ? "activiteit" : "activiteiten"} voor jou`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rond {placeLabel(state.placeId)}
            {state.age != null ? ` · ${state.age} jaar` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.age != null ? (
            <label className="hidden items-center gap-2 text-sm sm:flex">
              <span className="text-muted-foreground">Sorteren</span>
              <select
                value={state.sort}
                onChange={(event) => update({ sort: event.target.value as SortKey })}
                className="h-10 rounded-full border border-border bg-white px-3"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABEL[sort]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            variant="outline"
            className="h-10 rounded-full px-4"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-4" />
            Filters
          </Button>
        </div>
      </div>

      {state.age == null ? (
        <form
          className="mt-10 max-w-md space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const age = Number(ageDraft);
            if (age >= 18 && age <= 99) update({ age });
          }}
        >
          <Label htmlFor="results-age">Je leeftijd</Label>
          <p className="text-sm text-muted-foreground">
            We gebruiken je leeftijd alleen om te zien of je mag deelnemen.
          </p>
          <Input
            id="results-age"
            type="number"
            min={18}
            max={99}
            required
            value={ageDraft}
            onChange={(event) => setAgeDraft(event.target.value)}
            className="h-12 rounded-xl text-base"
          />
          <Button type="submit" className="h-11 rounded-full px-6">
            Toon activiteiten
          </Button>
        </form>
      ) : (
        <>
          {chips.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => update(chip.patch)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-sm hover:border-foreground"
                >
                  {chip.label}
                  <X className="size-3.5" />
                  <span className="sr-only">Verwijder filter {chip.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {(state.preferredAgeMin != null || state.preferredAgeMax != null) && (
            <p className="mt-4 text-sm text-muted-foreground">
              Je ontmoet liefst {formatAgeRange(state.preferredAgeMin, state.preferredAgeMax)}. Dat gebruiken we om te sorteren, niet om events te verbergen.
            </p>
          )}

          {result.hiddenStrict > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {result.hiddenStrict}{" "}
              {result.hiddenStrict === 1 ? "activiteit valt" : "activiteiten vallen"} buiten de strikte deelnamevoorwaarden en{" "}
              {result.hiddenStrict === 1 ? "wordt" : "worden"} niet getoond.
            </p>
          ) : null}

          <label className="mt-4 flex items-center gap-2 text-sm sm:hidden">
            <span className="text-muted-foreground">Sorteren</span>
            <select
              value={state.sort}
              onChange={(event) => update({ sort: event.target.value as SortKey })}
              className="h-10 rounded-full border border-border bg-white px-3"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </label>

          {visible.length === 0 ? (
            <div className="mt-12 max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight">
                Geen activiteiten gevonden die exact aan deze filters voldoen.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Events waar je volgens een strikte leeftijdsgrens niet mag deelnemen, blijven verborgen.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                {suggestions(state).map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="h-11 rounded-full border border-border px-4 text-left text-sm font-medium hover:border-foreground"
                    onClick={() => update(suggestion.patch)}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        state={state}
        count={state.age == null ? 0 : visible.length}
        onChange={update}
      />
      <p className="sr-only">{USER_PLACES.length} plaatsen</p>
    </div>
  );
}

function activeChips(state: SearchState): { id: string; label: string; patch: Partial<SearchState> }[] {
  const chips: { id: string; label: string; patch: Partial<SearchState> }[] = [];
  if (state.when !== "any") {
    chips.push({
      id: "when",
      label: state.when === "date" && state.date ? state.date : WHEN_LABEL[state.when],
      patch: { when: "any", date: null },
    });
  }
  if (state.maxDistanceKm !== 25) {
    chips.push({
      id: "distance",
      label: `Binnen ${state.maxDistanceKm} km`,
      patch: { maxDistanceKm: 25 },
    });
  }
  if (state.preferredAgeMin != null || state.preferredAgeMax != null) {
    chips.push({
      id: "pref",
      label: `Ontmoeten ${formatAgeRange(state.preferredAgeMin, state.preferredAgeMax)}`,
      patch: { preferredAgeMin: null, preferredAgeMax: null },
    });
  }
  for (const category of state.categories) {
    chips.push({
      id: `cat-${category}`,
      label: category === "meet_new_people" ? "Meet new people" : category === "dating" ? "Dating" : "Social",
      patch: { categories: state.categories.filter((item) => item !== category) },
    });
  }
  for (const activity of state.activities) {
    chips.push({
      id: `act-${activity}`,
      label: ACTIVITY_LABEL[activity],
      patch: { activities: state.activities.filter((item) => item !== activity) },
    });
  }
  if (state.price !== "any") {
    chips.push({ id: "price", label: PRICE_LABEL[state.price], patch: { price: "any" } });
  }
  if (state.singlesOnly) {
    chips.push({ id: "singles", label: "Singles only", patch: { singlesOnly: false } });
  }
  if (state.availability !== "any") {
    chips.push({
      id: "avail",
      label: AVAILABILITY_LABEL[state.availability],
      patch: { availability: "any" },
    });
  }
  if (state.strictOnly) {
    chips.push({ id: "strict", label: "Alleen strikte leeftijd", patch: { strictOnly: false } });
  }
  return chips;
}

function suggestions(state: SearchState): { id: string; label: string; patch: Partial<SearchState> }[] {
  const items: { id: string; label: string; patch: Partial<SearchState> }[] = [];
  if (state.maxDistanceKm < 50) {
    items.push({
      id: "distance",
      label: "Vergroot afstand naar 50 km",
      patch: { maxDistanceKm: 50 },
    });
  } else if (state.maxDistanceKm < 100) {
    items.push({
      id: "distance",
      label: "Vergroot afstand naar 100 km",
      patch: { maxDistanceKm: 100 },
    });
  }
  if (state.strictOnly) {
    items.push({
      id: "guideline",
      label: "Toon richtleeftijden",
      patch: { strictOnly: false },
    });
  }
  if (state.categories.length > 0 && !state.categories.includes("meet_new_people")) {
    items.push({
      id: "people",
      label: "Toon Meet new people",
      patch: { categories: [...state.categories, "meet_new_people"] },
    });
  }
  if (state.when !== "any" && state.when !== "next_week") {
    items.push({
      id: "week",
      label: "Bekijk volgende week",
      patch: { when: "next_week", date: null },
    });
  }
  if (state.activities.length > 0) {
    items.push({
      id: "activities",
      label: "Toon alle soorten activiteiten",
      patch: { activities: [] },
    });
  }
  return items;
}
