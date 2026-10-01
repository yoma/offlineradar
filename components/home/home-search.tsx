"use client";

import Image from "next/image";
import { Plus, Search, SlidersHorizontal, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { markSearchPending } from "@/components/discover/search-loading";
import { UpcomingStrip } from "@/components/discover/upcoming-strip";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { USER_PLACES, findPlace } from "@/data/places";
import { track } from "@/lib/analytics";
import { matchingEvents } from "@/lib/filters";
import { DISTANCES, GENDER_LABEL } from "@/lib/format";
import { heroImageUrl } from "@/lib/images";
import type { PublishedOrganizerOption } from "@/lib/organizers/published-options";
import {
  normalizeOrganizerParam,
} from "@/lib/result-refinement";
import {
  activeFilterChips,
  countExtraFilters,
  extraFiltersSummary,
  removeChipFromState,
} from "@/lib/search-chips";
import {
  applySearchPatch,
  defaultSearchState,
  profileFromSearch,
  serializeSearchState,
} from "@/lib/search-state";
import { expandActivityFilterSelection } from "@/lib/public-activity-groups";
import { readProfile, writeProfile } from "@/lib/storage";
import type { Event, UserGender } from "@/types/event";
import type { SearchState, WhenFilter } from "@/types/search";

export function HomeHero({
  organizerOptions = [],
  upcomingEvents = [],
  events = [],
  today,
}: {
  organizerOptions?: PublishedOrganizerOption[];
  upcomingEvents?: Event[];
  /** Catalog events for live Meer-filters result count (client-side). */
  events?: Event[];
  today?: string;
}) {
  const [state, setState] = useState<SearchState>(() => defaultSearchState());
  const [ageDraft, setAgeDraft] = useState("");
  const [selectedOrganizers, setSelectedOrganizers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<{
    age?: boolean;
    date?: boolean;
  }>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const ageInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const profile = readProfile();
    queueMicrotask(() => {
      setState((current) => {
        let next = { ...current };
        if (profile.placeId) next.placeId = findPlace(profile.placeId).id;
        if (profile.maxDistanceKm) next.maxDistanceKm = profile.maxDistanceKm;
        if (profile.gender) next.gender = profile.gender;
        if (profile.preferredAgeMin != null) {
          next.preferredAgeMin = profile.preferredAgeMin;
        }
        if (profile.preferredAgeMax != null) {
          next.preferredAgeMax = profile.preferredAgeMax;
        }
        if (profile.preferredMeetGender) {
          next.preferredMeetGender = profile.preferredMeetGender;
        }
        if (profile.interests.length) {
          next.activities = expandActivityFilterSelection(profile.interests);
        }
        return next;
      });
      if (profile.age) setAgeDraft(String(profile.age));
    });
  }, []);

  const organizerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of organizerOptions) map[item.slug] = item.name;
    return map;
  }, [organizerOptions]);

  const advancedChips = useMemo(
    () =>
      activeFilterChips(state, {
        includeCoreTiming: false,
        organizerSlugs: selectedOrganizers,
        organizerNames,
      }),
    [state, selectedOrganizers, organizerNames],
  );

  const extraCount = countExtraFilters(state, selectedOrganizers);
  const extraSummary = extraFiltersSummary(
    state,
    selectedOrganizers,
    organizerNames,
  );

  const filterCount = useMemo(() => {
    const age = Number(ageDraft.trim());
    const searchAge =
      Number.isFinite(age) && age >= 18 && age <= 99 ? age : null;
    const forCount: SearchState = { ...state, age: searchAge };
    return matchingEvents(events, forCount).visible.length;
  }, [events, state, ageDraft]);

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
      setSelectedOrganizers((current) =>
        current.filter((item) => item !== slug),
      );
      track("filter_change", { removed: chipId, organizer: slug });
      return;
    }
    setState((current) => {
      const next = removeChipFromState(current, chipId);
      track("filter_change", { removed: chipId });
      return next;
    });
  }

  function openMoreFilters() {
    setMoreOpen(true);
    track("more_filters_opened", { source: "homepage" });
  }

  function go() {
    if (searching) return;
    const missing: string[] = [];
    const nextInvalid: { age?: boolean; date?: boolean } = {};
    const ageTrimmed = ageDraft.trim();
    const parsedAge = Number(ageTrimmed);

    if (!ageTrimmed) {
      missing.push("vul je leeftijd in");
      nextInvalid.age = true;
    } else if (
      !Number.isFinite(parsedAge) ||
      parsedAge < 18 ||
      parsedAge > 99
    ) {
      missing.push("kies een leeftijd tussen 18 en 99");
      nextInvalid.age = true;
    }

    if (state.when === "date" && !state.date) {
      missing.push("kies een datum");
      nextInvalid.date = true;
    }

    if (missing.length > 0) {
      setInvalidFields(nextInvalid);
      const list =
        missing.length === 1
          ? missing[0]
          : `${missing.slice(0, -1).join(", ")} en ${missing[missing.length - 1]}`;
      setError(
        `Nog nodig om te zoeken: ${list.charAt(0).toUpperCase()}${list.slice(1)}.`,
      );
      queueMicrotask(() => {
        if (nextInvalid.age) ageInputRef.current?.focus();
        else if (nextInvalid.date) dateInputRef.current?.focus();
      });
      return;
    }

    const searchState: SearchState = {
      ...state,
      age: parsedAge,
      placeId: findPlace(state.placeId).id,
      date: state.when === "date" ? state.date : null,
    };
    setError("");
    setInvalidFields({});
    setSearching(true);
    try {
      writeProfile(profileFromSearch(searchState));
      track("discovery_search", {
        age: searchState.age,
        placeId: searchState.placeId,
        distance: searchState.maxDistanceKm,
        when: searchState.when,
      });
      markSearchPending();
      const query = serializeSearchState(searchState);
      const params = new URLSearchParams(query);
      const organizerParam = normalizeOrganizerParam(
        selectedOrganizers.join(","),
      );
      if (organizerParam) params.set("organizer", organizerParam);
      const qs = params.toString();
      const url = qs ? `/ontdek?${qs}` : "/ontdek";
      window.location.assign(url);
      window.setTimeout(() => {
        if (window.location.pathname === "/") {
          window.location.href = url;
        }
      }, 500);
      window.setTimeout(() => {
        if (window.location.pathname === "/") {
          setSearching(false);
          setError("Zoeken lukte even niet. Probeer opnieuw.");
        }
      }, 2500);
    } catch {
      setSearching(false);
      setError("Zoeken lukte even niet. Probeer opnieuw.");
    }
  }

  return (
    <section className="relative -mt-16 min-h-[100svh] min-w-0 overflow-x-clip">
      <Image
        src={heroImageUrl()}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/60" />

      <div className="relative mx-auto flex min-h-[100svh] w-full min-w-0 max-w-6xl flex-col justify-center px-4 pt-24 pb-24 sm:px-6 sm:pt-28 sm:pb-16">
        <p className="text-[11px] font-medium tracking-[0.22em] text-white/65 uppercase sm:text-xs">
          DateOfflineHub
        </p>
        <h1 className="mt-4 max-w-[18ch] text-balance text-[1.55rem] font-semibold leading-[1.2] tracking-[-0.02em] text-white sm:mt-5 sm:max-w-2xl sm:text-[2.35rem] sm:leading-[1.15] lg:text-[2.75rem] lg:leading-[1.12]">
          Date offline. Ervaar opnieuw de kracht van echte connecties.
        </h1>
        <p className="mt-3.5 max-w-md text-pretty text-[13.5px] leading-6 font-normal text-white/70 sm:mt-4 sm:max-w-lg sm:text-[15px] sm:leading-7">
          Ontdek hier singlesevents en activiteiten waar je andere singles in
          het echt kunt ontmoeten.
        </p>

        {upcomingEvents.length > 0 && today ? (
          <div className="mt-5 w-full min-w-0 max-w-4xl sm:mt-6">
            <UpcomingStrip
              events={upcomingEvents}
              today={today}
              variant="onDark"
              headingId="home-binnenkort-heading"
            />
          </div>
        ) : null}

        <form
          className="mt-6 w-full min-w-0 max-w-4xl sm:mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            go();
          }}
        >
          <div className="search-divider overflow-hidden rounded-3xl bg-white lg:rounded-[2.5rem]">
            <div className="grid grid-cols-1 lg:grid-cols-5 lg:items-stretch">
              <Field label="Waar" chevron>
                <select
                  value={state.placeId}
                  onChange={(event) => update({ placeId: event.target.value })}
                  className="search-field-control w-full bg-transparent text-[15px] font-semibold leading-6 outline-none"
                >
                  {USER_PLACES.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Wanneer" divide chevron>
                <select
                  value={state.when}
                  onChange={(event) => {
                    const next = event.target.value as WhenFilter;
                    update({
                      when: next,
                      date: next === "date" ? state.date : null,
                    });
                    if (next !== "date") {
                      setInvalidFields((current) => ({
                        ...current,
                        date: false,
                      }));
                    }
                  }}
                  className="search-field-control w-full bg-transparent text-[15px] font-semibold leading-6 outline-none"
                >
                  <option value="any">Alle datums</option>
                  <option value="today">Vandaag</option>
                  <option value="tomorrow">Morgen</option>
                  <option value="weekend">Dit weekend</option>
                  <option value="next_week">Volgende week</option>
                  <option value="month">Deze maand</option>
                  <option value="date">Datum kiezen</option>
                </select>
              </Field>
              <Field
                label="Leeftijd"
                divide
                invalid={Boolean(invalidFields.age)}
                hint={invalidFields.age ? "Verplicht" : undefined}
              >
                <input
                  ref={ageInputRef}
                  type="number"
                  min={18}
                  max={99}
                  inputMode="numeric"
                  placeholder="bv. 49"
                  value={ageDraft}
                  aria-invalid={invalidFields.age || undefined}
                  aria-describedby={
                    invalidFields.age ? "home-search-error" : undefined
                  }
                  onChange={(event) => {
                    setAgeDraft(event.target.value);
                    if (invalidFields.age) {
                      setInvalidFields((current) => ({
                        ...current,
                        age: false,
                      }));
                      setError("");
                    }
                  }}
                  className="search-field-control w-full bg-transparent text-[15px] font-semibold leading-6 outline-none placeholder:font-normal placeholder:text-muted-foreground"
                />
              </Field>
              <Field label="Gender" divide chevron optional>
                <select
                  value={state.gender ?? ""}
                  onChange={(event) =>
                    update({
                      gender: (event.target.value || null) as UserGender | null,
                    })
                  }
                  className="search-field-control w-full bg-transparent text-[15px] font-semibold leading-6 outline-none"
                >
                  <option value="">Kies</option>
                  {(Object.keys(GENDER_LABEL) as UserGender[]).map((key) => (
                    <option key={key} value={key}>
                      {GENDER_LABEL[key]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Afstand" divide chevron>
                <select
                  value={state.maxDistanceKm}
                  onChange={(event) =>
                    update({ maxDistanceKm: Number(event.target.value) })
                  }
                  className="search-field-control w-full bg-transparent text-[15px] font-semibold leading-6 outline-none"
                >
                  {DISTANCES.map((km) => (
                    <option key={km} value={km}>
                      {km} km
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {state.when === "date" ? (
              <div
                className={`border-t px-5 py-3.5 sm:px-6 ${
                  invalidFields.date
                    ? "border-[#e61e4d]/40 bg-[#e61e4d]/5"
                    : "border-border"
                }`}
              >
                <label className="block">
                  <span
                    className={`mb-1.5 block text-[11px] font-semibold tracking-[0.08em] uppercase ${
                      invalidFields.date
                        ? "text-[#e61e4d]"
                        : "text-muted-foreground"
                    }`}
                  >
                    Datum {invalidFields.date ? "(verplicht)" : ""}
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={state.date ?? ""}
                    aria-invalid={invalidFields.date || undefined}
                    aria-describedby={
                      invalidFields.date ? "home-search-error" : undefined
                    }
                    onChange={(event) => {
                      update({
                        when: "date",
                        date: event.target.value || null,
                      });
                      if (invalidFields.date) {
                        setInvalidFields((current) => ({
                          ...current,
                          date: false,
                        }));
                        setError("");
                      }
                    }}
                    className="w-full min-w-0 text-sm font-semibold leading-6 outline-none"
                  />
                </label>
              </div>
            ) : null}
            {error ? (
              <div
                id="home-search-error"
                role="alert"
                className="border-t border-[#e61e4d]/25 bg-[#fff5f7] px-4 py-3 sm:px-5"
              >
                <p className="text-sm font-semibold text-[#9f1239]">{error}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col items-start gap-1.5 sm:mt-3.5 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={openMoreFilters}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <SlidersHorizontal className="size-4 shrink-0" />
              Meer filters
              {extraCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-[#e61e4d]">
                  {extraCount}
                </span>
              ) : null}
            </button>
            {extraCount > 0 && extraSummary ? (
              <p className="max-w-[20rem] truncate pl-1 text-sm leading-5 text-white/70 sm:max-w-md sm:pl-0">
                {extraCount} extra {extraCount === 1 ? "filter" : "filters"}:{" "}
                {extraSummary}
              </p>
            ) : (
              <p className="max-w-[16rem] pl-1 text-sm leading-5 text-white/70 sm:max-w-none sm:pl-0">
                Organisator, type, prijs en meer
              </p>
            )}
          </div>

          {advancedChips.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {advancedChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => removeChip(chip.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur-sm hover:bg-white/25"
                >
                  {chip.label}
                  <X className="size-3.5 opacity-80" aria-hidden />
                  <span className="sr-only">Verwijder filter {chip.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-5 space-y-3 sm:mt-6">
            {searching ? (
              <div
                role="status"
                aria-live="polite"
                aria-busy="true"
                className="rounded-2xl border border-white/25 bg-black/35 px-5 py-6 text-center text-white backdrop-blur-sm"
              >
                <span
                  className="mx-auto mb-4 block size-9 animate-spin rounded-full border-2 border-white/25 border-t-white"
                  aria-hidden
                />
                <p className="text-[15px] font-semibold">
                  We zoeken passende singlesevents voor jou…
                </p>
                <p className="mt-2 text-sm text-white/75">
                  We checken je regio en afstand…
                </p>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
              <button
                type="button"
                onClick={go}
                disabled={searching}
                aria-busy={searching}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#e61e4d] px-6 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-[#d70466] disabled:cursor-wait disabled:opacity-80 sm:w-auto sm:min-w-[240px]"
              >
                <Search className="size-4" />
                {searching ? "Bezig met zoeken…" : "Vind activiteiten"}
              </button>
              <a
                href="#tip-een-activiteit"
                aria-label="Ken je een singlesevent? Geef het aan ons door."
                className="inline-flex w-full flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/40 bg-white/10 px-5 py-3 text-center text-white backdrop-blur-sm transition hover:bg-white/20 sm:w-auto sm:min-w-[220px] sm:items-start sm:text-left"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.setTimeout(() => {
                    window.dispatchEvent(new Event("offlineradar:open-tip"));
                  }, 0);
                }}
              >
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold leading-5">
                  <Plus className="size-3.5 shrink-0 opacity-90" aria-hidden />
                  Ken je een singlesevent?
                </span>
                <span className="text-[13px] font-normal leading-5 text-white/75">
                  Geef het aan ons door.
                </span>
              </a>
            </div>
          </div>
        </form>
      </div>

      <FilterSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        state={{
          ...state,
          age: (() => {
            const n = Number(ageDraft.trim());
            return Number.isFinite(n) && n >= 18 && n <= 99 ? n : null;
          })(),
        }}
        count={filterCount}
        onChange={update}
        organizerOptions={organizerOptions}
        selectedOrganizers={selectedOrganizers}
        onOrganizersChange={(slugs) => {
          setSelectedOrganizers(slugs);
          track("filter_change", {
            organizer: normalizeOrganizerParam(slugs.join(",")),
          });
        }}
      />
    </section>
  );
}

function Field({
  label,
  children,
  divide = false,
  chevron = false,
  invalid = false,
  optional = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  divide?: boolean;
  chevron?: boolean;
  invalid?: boolean;
  optional?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={`flex min-h-[4.75rem] min-w-0 cursor-pointer flex-col justify-center px-4 py-3.5 transition hover:bg-black/[0.03] focus-within:bg-black/[0.03] sm:px-5 lg:min-h-[5.25rem] lg:px-5 lg:py-4 ${
        divide ? "border-t border-border lg:border-t-0 lg:border-l" : ""
      } ${invalid ? "bg-[#fff5f7] ring-2 ring-inset ring-[#e61e4d]/70" : ""}`}
    >
      <span
        className={`mb-1.5 flex h-4 items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold tracking-[0.08em] uppercase ${
          invalid ? "text-[#e61e4d]" : "text-muted-foreground"
        }`}
      >
        <span className="truncate">{label}</span>
        {optional ? (
          <span className="truncate text-[10px] font-medium tracking-normal text-muted-foreground/80 normal-case">
            optioneel
          </span>
        ) : null}
        {hint ? (
          <span className="rounded-full bg-[#e61e4d] px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-white normal-case">
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className={`relative flex h-6 min-w-0 items-center ${chevron ? "pr-5" : ""}`}
      >
        {children}
        {chevron ? (
          <span
            className="pointer-events-none absolute right-0 text-muted-foreground"
            aria-hidden
          >
            ▾
          </span>
        ) : null}
      </span>
    </label>
  );
}
