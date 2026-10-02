"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EventCard } from "@/components/events/event-card";
import { ResultRefinementBar } from "@/components/discover/result-refinement";
import {
  SearchLoadingState,
  consumeSearchPending,
} from "@/components/discover/search-loading";
import { UpcomingStrip } from "@/components/discover/upcoming-strip";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_PLACES } from "@/data/places";
import { track } from "@/lib/analytics";
import { brusselsToday } from "@/lib/dates";
import { matchingEvents, placeLabel } from "@/lib/filters";
import { formatMeetPreference } from "@/lib/format";
import {
  hasAnyStrongPreferenceMatch,
  userHasMeetPreference,
} from "@/lib/ranking";
import {
  applyResultRefinement,
  defaultResultRefinement,
  normalizeOrganizerParam,
  organizerSlugsFromParam,
  organizersFromEvents,
  refinementFiltersActive,
  serializeResultRefinement,
  type ResultRefinement,
} from "@/lib/result-refinement";
import {
  activeFilterChips,
  removeChipFromState,
} from "@/lib/search-chips";
import {
  applySearchPatch,
  applyStoredProfile,
  profileFromSearch,
  serializeSearchState,
} from "@/lib/search-state";
import { savePreferencesAction } from "@/app/account/actions";
import { readProfile, writeProfile } from "@/lib/storage";
import { selectUpcomingEvents } from "@/lib/upcoming";
import type { Event } from "@/types/event";
import type { SearchState, StoredProfile } from "@/types/search";

export function DiscoverView({
  events,
  initial,
  initialRefinement = defaultResultRefinement(),
  listPath = "/ontdek",
  eventBasePath = "/event",
  banner = null,
  showInternalPreviewBanner = false,
  catalogError = null,
  isLoggedIn = false,
  serverPreferences = null,
  followedOrganizerIds = [],
}: {
  events: Event[];
  initial: SearchState;
  /** Soft result refinement (q / date / organizer / sort). Not saved to profile. */
  initialRefinement?: ResultRefinement;
  /** Discover URL path for filter sync (internal preview uses /interne-preview). */
  listPath?: string;
  /** Detail URL prefix without trailing slash. */
  eventBasePath?: string;
  /** Optional internal-only banner above results. */
  banner?: ReactNode;
  /** Show the Fase 5 internal-preview notice (local only). */
  showInternalPreviewBanner?: boolean;
  /** Canonical feed DB failure: never show mock events. */
  catalogError?: string | null;
  /** When true, preferences can be saved server-side. */
  isLoggedIn?: boolean;
  /** Account preferences used as defaults after URL (never override explicit URL). */
  serverPreferences?: StoredProfile | null;
  /** Batch-loaded followed organizer ids for logged-in users. */
  followedOrganizerIds?: string[];
}) {
  const [state, setState] = useState(initial);
  const [refinement, setRefinement] =
    useState<ResultRefinement>(initialRefinement);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [ageDraft, setAgeDraft] = useState(initial.age ? String(initial.age) : "");
  const [ageError, setAgeError] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [prefsStatus, setPrefsStatus] = useState<string | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const zeroTracked = useRef("");

  const previewBanner = showInternalPreviewBanner ? (
    <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">Interne preview (niet publiek)</p>
      <p className="mt-1 leading-6">
        Handmatig samengestelde singlesevents (Fase 4B, gecontroleerd
        2026-09-25). Listing volgt Route A/B. Geen productiefeed. Mingle Night
        heeft een starttijd-conflict; Singles Night Out moet vóór publicatie
        opnieuw gecontroleerd worden.
      </p>
    </div>
  ) : (
    banner
  );

  useEffect(() => {
    const stored = readProfile();
    // Priority: URL (already in initial) > active session/local > server prefs.
    const defaults =
      isLoggedIn && serverPreferences ? serverPreferences : stored;
    const pending = consumeSearchPending();
    queueMicrotask(() => {
      // Do not re-inject saved activity interests as discover filters.
      setState((current) => applyStoredProfile(current, defaults));
      setAgeDraft(
        (current) => current || (defaults.age ? String(defaults.age) : ""),
      );
      setBooted(true);
      if (isLoggedIn && !serverPreferences?.age && !stored.age) {
        setPrefsStatus(
          "Je kunt je voorkeuren bewaren zodat we ze volgende keer onthouden.",
        );
      }
      if (pending) {
        setSearchPending(true);
        window.setTimeout(() => setSearchPending(false), 400);
      }
    });
  }, [isLoggedIn, serverPreferences]);

  useEffect(() => {
    if (!booted) return;
    writeProfile(profileFromSearch(state));
    const main = new URLSearchParams(serializeSearchState(state));
    const next = serializeResultRefinement(refinement, main).toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next === current) return;
    // Client-side filter sync: avoid RSC refetch of the full Neon feed on every
    // chip/filter change (events are already loaded and filtered in-memory).
    const url = next ? `${listPath}?${next}` : listPath;
    window.history.replaceState(window.history.state, "", url);
  }, [booted, listPath, state, refinement]);

  async function savePreferences() {
    if (!isLoggedIn || prefsBusy) return;
    setPrefsBusy(true);
    setPrefsStatus(null);
    const profile = profileFromSearch(state);
    writeProfile(profile);
    const result = await savePreferencesAction(profile);
    setPrefsBusy(false);
    setPrefsStatus(result.ok ? "Voorkeuren bewaard." : result.error);
  }

  const today = useMemo(() => brusselsToday(), []);
  const result = useMemo(() => matchingEvents(events, state), [events, state]);
  const baseVisible = result.visible;
  const organizerOptions = useMemo(
    () => organizersFromEvents(baseVisible),
    [baseVisible],
  );
  const visible = useMemo(
    () =>
      applyResultRefinement(baseVisible, refinement, today, {
        followedOrganizerIds,
      }),
    [baseVisible, refinement, today, followedOrganizerIds],
  );
  // Global infosstrip: never recompute from filters/age/location/activity.
  const upcoming = useMemo(() => selectUpcomingEvents(events), [events]);
  const preferenceMiss =
    userHasMeetPreference(state) &&
    visible.length > 0 &&
    !hasAnyStrongPreferenceMatch(visible, state);
  const preferenceLabel = formatMeetPreference(
    state.preferredMeetGender,
    state.preferredAgeMin,
    state.preferredAgeMax,
  );
  const refineNarrowed = refinementFiltersActive(refinement);

  useEffect(() => {
    if (!booted || state.age == null || baseVisible.length > 0) return;
    const signature = serializeSearchState(state);
    if (zeroTracked.current === signature) return;
    zeroTracked.current = signature;
    track("zero_results", { filters: signature });
  }, [booted, state, baseVisible.length]);

  function update(patch: Partial<SearchState>) {
    setState((current) => {
      const next = applySearchPatch(current, patch);
      track("filter_change", {
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

  function removeChip(chipId: string) {
    if (chipId.startsWith("org-")) {
      const slug = chipId.slice(4);
      setRefinement((current) => {
        const remaining = organizerSlugsFromParam(current.organizer).filter(
          (item) => item !== slug,
        );
        return {
          ...current,
          organizer: normalizeOrganizerParam(remaining.join(",")),
        };
      });
      track("filter_change", { removed: chipId });
      return;
    }
    setState((current) => {
      const next = removeChipFromState(current, chipId);
      track("filter_change", {
        when: next.when,
        distance: next.maxDistanceKm,
        categories: next.categories.join(","),
        activities: next.activities.join(","),
        price: next.price,
        singlesOnly: next.singlesOnly,
        availability: next.availability,
        strictOnly: next.strictOnly,
        sort: next.sort,
        removed: chipId,
      });
      return next;
    });
  }

  function clearDiscoverFilters() {
    update({
      when: "any",
      date: null,
      typesMode: "all",
      categories: [],
      activities: [],
      price: "any",
      singlesOnly: false,
      availability: "any",
      strictOnly: false,
      maxDistanceKm: 100,
    });
  }

  function clearRefinement() {
    setRefinement(defaultResultRefinement());
  }

  function clearOrganizerFilter() {
    setRefinement((current) => ({ ...current, organizer: "" }));
  }

  const organizerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of organizerOptions) map[item.slug] = item.name;
    return map;
  }, [organizerOptions]);

  const chips = activeFilterChips(state, {
    includeCoreTiming: true,
    organizerSlugs: organizerSlugsFromParam(refinement.organizer),
    organizerNames: organizerNameMap,
  });

  const resultHeading =
    state.age == null
      ? "Activiteiten"
      : refineNarrowed
        ? `${visible.length} van ${baseVisible.length} ${
            baseVisible.length === 1 ? "activiteit" : "activiteiten"
          }`
        : `${visible.length} ${
            visible.length === 1 ? "activiteit" : "activiteiten"
          } voor jou`;

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6">
      {upcoming.events.length > 0 ? (
        <UpcomingStrip
          events={upcoming.events}
          hrefBase={eventBasePath}
          today={today}
        />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {resultHeading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rond {placeLabel(state.placeId)}
            {state.age != null ? ` · ${state.age} jaar` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-full px-4"
            onClick={() => {
              setFiltersOpen(true);
              track("more_filters_opened", { source: "ontdek" });
            }}
          >
            <SlidersHorizontal className="size-4" />
            Filters
          </Button>
          {isLoggedIn ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-4"
              disabled={prefsBusy}
              onClick={() => void savePreferences()}
            >
              {prefsBusy ? "Bewaren…" : "Bewaar voorkeuren"}
            </Button>
          ) : null}
        </div>
      </div>
      {prefsStatus ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {prefsStatus}
        </p>
      ) : null}

      {catalogError ? (
        <div className="mt-12 max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight">
            Catalogus tijdelijk niet beschikbaar
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {catalogError}
          </p>
        </div>
      ) : state.age == null ? (
        <form
          className="mt-10 max-w-md space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = ageDraft.trim();
            if (!trimmed) {
              setAgeError("Vul je leeftijd in om activiteiten te tonen.");
              return;
            }
            const age = Number(trimmed);
            if (!Number.isFinite(age) || age < 18 || age > 99) {
              setAgeError("Kies een leeftijd tussen 18 en 99.");
              return;
            }
            setAgeError("");
            update({ age });
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
            value={ageDraft}
            aria-invalid={ageError ? true : undefined}
            aria-describedby={ageError ? "results-age-error" : undefined}
            onChange={(event) => {
              setAgeDraft(event.target.value);
              if (ageError) setAgeError("");
            }}
            className={`h-12 rounded-xl text-base ${
              ageError ? "border-primary ring-2 ring-primary/30" : ""
            }`}
          />
          {ageError ? (
            <p
              id="results-age-error"
              role="alert"
              className="rounded-xl border border-primary/30 bg-[var(--brand-gold-soft)] px-3 py-2 text-sm font-medium text-[var(--brand-gold-ink)]"
            >
              {ageError}
            </p>
          ) : null}
          <ActionButton pendingLabel="Bezig…" className="h-11 rounded-full px-6">
            Toon activiteiten
          </ActionButton>
        </form>
      ) : (
        <>
          {previewBanner}

          {chips.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => removeChip(chip.id)}
                  title={
                    chip.kind === "preference"
                      ? "Voorkeur – beïnvloedt volgorde, niet zichtbaarheid"
                      : `Verwijder filter ${chip.label}`
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:border-foreground ${
                    chip.kind === "preference"
                      ? "border-dashed border-foreground/35 bg-secondary/50"
                      : chip.kind === "date"
                        ? "border-foreground/25 bg-secondary/40"
                        : "border-border bg-white"
                  }`}
                >
                  {chip.label}
                  <X className="size-3.5" />
                  <span className="sr-only">Verwijder filter {chip.label}</span>
                </button>
              ))}
              {chips.length >= 2 ? (
                <button
                  type="button"
                  onClick={clearDiscoverFilters}
                  className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Wis filters
                </button>
              ) : null}
            </div>
          ) : null}

          {state.age != null && baseVisible.length > 0 ? (
            <ResultRefinementBar
              refinement={refinement}
              baseCount={baseVisible.length}
              refinedCount={visible.length}
              organizerOptions={organizerOptions}
              isLoggedIn={isLoggedIn}
              followedCount={followedOrganizerIds.length}
              onChange={setRefinement}
              onClear={clearRefinement}
              onClearOrganizer={clearOrganizerFilter}
            />
          ) : null}

          {result.hiddenStrict > 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm">
              <p>
                {result.hiddenStrict}{" "}
                {result.hiddenStrict === 1
                  ? "activiteit verborgen omdat je niet aan de deelnamevoorwaarden voldoet."
                  : "activiteiten verborgen omdat je niet aan de deelnamevoorwaarden voldoet."}
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer font-medium">Waarom?</summary>
                <p className="mt-1 text-muted-foreground">
                  DateOfflineHub controleert bekende leeftijds-, gender- en andere
                  deelnamevoorwaarden voordat activiteiten worden getoond.
                  Persoonlijke ontmoetingsvoorkeuren verbergen geen activiteiten.
                </p>
              </details>
            </div>
          ) : null}

          {preferenceMiss && preferenceLabel ? (
            <div className="mt-4 rounded-xl border border-border bg-white px-4 py-4 text-sm">
              <p className="font-medium">
                Geen sterke matches voor jouw ontmoetingsvoorkeur.
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Je wil liefst {preferenceLabel} ontmoeten. Daar vonden we
                momenteel geen duidelijke match voor.
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Hieronder tonen we wel activiteiten waarvoor je kunt deelnemen.
              </p>
              <button
                type="button"
                className="mt-3 text-sm font-semibold underline-offset-4 hover:underline"
                onClick={() => setFiltersOpen(true)}
              >
                Voorkeur aanpassen
              </button>
            </div>
          ) : null}

          {preferenceLabel && !preferenceMiss ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Je ontmoet liefst {preferenceLabel}. Dat gebruiken we om te
              sorteren, niet om events te verbergen.
            </p>
          ) : null}

          <SearchLoadingState active={searchPending} className="mt-8" />

          <div
            className={
              searchPending ? "pointer-events-none opacity-45 transition-opacity" : undefined
            }
            aria-hidden={searchPending || undefined}
          >
          {baseVisible.length === 0 ? (
            <div className="mt-12 max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight">
                Geen passende singlesactiviteiten gevonden met deze filters.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Verruim datum, regio of filters. Events met een strikte
                leeftijdsgrens waar je niet aan voldoet blijven verborgen.
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
          ) : visible.length === 0 ? (
            <div className="mt-12 max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight">
                {refinement.organizer.trim()
                  ? refinement.organizer === "followed"
                    ? "Geen events van organisatoren die je volgt binnen je huidige filters."
                    : "Geen events gevonden van deze organisator binnen je huidige filters."
                  : "Geen events binnen deze verfijning."}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Je hoofdzoekopdracht heeft wel {baseVisible.length}{" "}
                {baseVisible.length === 1 ? "resultaat" : "resultaten"}. Pas de
                verfijning aan of wis die.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {refinement.organizer.trim() ? (
                  <button
                    type="button"
                    onClick={clearOrganizerFilter}
                    className="h-11 rounded-full border border-border px-5 text-sm font-semibold hover:border-foreground"
                  >
                    Wis organisatorfilter
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={clearRefinement}
                  className="h-11 rounded-full border border-border px-5 text-sm font-semibold hover:border-foreground"
                >
                  Wis verfijning
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 min-w-0">
              <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
                {visible.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    gender={state.gender}
                    hrefBase={eventBasePath}
                  />
                ))}
              </div>
            </div>
          )}
          </div>
        </>
      )}

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        state={state}
        count={state.age == null ? 0 : visible.length}
        onChange={update}
        organizerOptions={organizerOptions.map((item) => ({
          id: item.slug,
          slug: item.slug,
          name: item.name,
          blurb: null,
        }))}
        selectedOrganizers={organizerSlugsFromParam(refinement.organizer)}
        onOrganizersChange={(slugs) => {
          setRefinement((current) => ({
            ...current,
            organizer: normalizeOrganizerParam(slugs.join(",")),
          }));
          track("filter_change", {
            organizer: normalizeOrganizerParam(slugs.join(",")),
          });
        }}
      />
      <p className="sr-only">{USER_PLACES.length} plaatsen</p>
    </div>
  );
}

function suggestions(state: SearchState): { id: string; label: string; patch: Partial<SearchState> }[] {
  const items: { id: string; label: string; patch: Partial<SearchState> }[] = [];
  const hasRestrictiveFilters =
    state.when !== "any" ||
    state.typesMode === "none" ||
    state.typesMode === "pick" ||
    state.categories.length > 0 ||
    state.activities.length > 0 ||
    state.price !== "any" ||
    state.singlesOnly ||
    state.availability !== "any" ||
    state.strictOnly ||
    state.maxDistanceKm < 100;

  if (hasRestrictiveFilters) {
    items.push({
      id: "clear-all",
      label: "Wis filters en toon alle aankomende",
      patch: {
        when: "any",
        date: null,
        typesMode: "all",
        categories: [],
        activities: [],
        price: "any",
        singlesOnly: false,
        availability: "any",
        strictOnly: false,
        maxDistanceKm: 100,
      },
    });
  }
  if (state.when !== "any") {
    items.push({
      id: "clear-when",
      label: "Alleen datumfilter wissen",
      patch: { when: "any", date: null },
    });
  }
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
  return items;
}
