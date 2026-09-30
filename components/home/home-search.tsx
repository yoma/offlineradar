"use client";

import Image from "next/image";
import { ChevronDown, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { USER_PLACES, findPlace } from "@/data/places";
import { track } from "@/lib/analytics";
import { DISTANCES, GENDER_LABEL, MEET_GENDER_LABEL, WHEN_LABEL } from "@/lib/format";
import { heroImageUrl } from "@/lib/images";
import { profileFromSearch, serializeSearchState } from "@/lib/search-state";
import { readProfile, writeProfile } from "@/lib/storage";
import { markSearchPending } from "@/components/discover/search-loading";
import type {
  ActivityId,
  EventCategory,
  PreferredMeetGender,
  UserGender,
} from "@/types/event";
import type { SearchState, WhenFilter } from "@/types/search";
import {
  expandActivityFilterSelection,
  isPublicActivityGroupSelected,
  PUBLIC_ACTIVITY_GROUPS,
  type PublicActivityGroupId,
  togglePublicActivityGroup,
} from "@/lib/public-activity-groups";

type QuickChip =
  | {
      kind: "when";
      label: string;
      when: WhenFilter;
    }
  | {
      kind: "category";
      label: string;
      categories: EventCategory[];
    }
  | {
      kind: "activity_group";
      label: string;
      groupId: PublicActivityGroupId;
    };

const TYPE_QUICK: QuickChip[] = [
  { kind: "activity_group", label: "Speeddate", groupId: "speeddate" },
  { kind: "category", label: "Dating", categories: ["dating"] },
  { kind: "category", label: "Nieuwe mensen", categories: ["meet_new_people"] },
  { kind: "activity_group", label: "Sport & actief", groupId: "sport_active" },
  { kind: "activity_group", label: "Dinner / food", groupId: "eten" },
  { kind: "activity_group", label: "Drinks / apero", groupId: "drinken" },
  { kind: "activity_group", label: "Party", groupId: "party" },
  { kind: "activity_group", label: "Workshop", groupId: "workshop" },
  { kind: "activity_group", label: "Weekend / reis", groupId: "travel" },
];

/** Full category set: empty filter means "all" (same as selecting every value). */
const ALL_CATEGORIES: EventCategory[] = [
  "dating",
  "meet_new_people",
  "social",
];

const ALL_ACTIVITY_IDS: ActivityId[] = Array.from(
  new Set(PUBLIC_ACTIVITY_GROUPS.flatMap((group) => [...group.activities])),
);

function includesAll<T>(haystack: T[], needles: T[]) {
  return needles.every((item) => haystack.includes(item));
}

function sameSet<T>(a: T[], b: readonly T[]) {
  return a.length === b.length && includesAll(a, [...b]);
}

function toggleList<T>(current: T[], next: T[]) {
  if (includesAll(current, next)) {
    return current.filter((item) => !next.includes(item));
  }
  return [...new Set([...current, ...next])];
}

export function HomeHero() {
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<UserGender | "">("");
  const [placeId, setPlaceId] = useState("antwerpen");
  const [distance, setDistance] = useState(100);
  const [when, setWhen] = useState<WhenFilter>("any");
  const [date, setDate] = useState("");
  const [activities, setActivities] = useState<ActivityId[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  /** Explicit "Alle soorten" toggle (empty lists alone cannot mean both on and off). */
  const [allTypes, setAllTypes] = useState(true);
  const [prefMin, setPrefMin] = useState("");
  const [prefMax, setPrefMax] = useState("");
  const [meetGender, setMeetGender] =
    useState<PreferredMeetGender>("anyone");
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
      if (profile.age) setAge(String(profile.age));
      if (profile.gender) setGender(profile.gender);
      if (profile.placeId) setPlaceId(findPlace(profile.placeId).id);
      if (profile.maxDistanceKm) setDistance(profile.maxDistanceKm);
      if (profile.interests.length) {
        setAllTypes(false);
        setActivities(expandActivityFilterSelection(profile.interests));
      }
      if (profile.preferredAgeMin) setPrefMin(String(profile.preferredAgeMin));
      if (profile.preferredAgeMax) setPrefMax(String(profile.preferredAgeMax));
      if (profile.preferredMeetGender) setMeetGender(profile.preferredMeetGender);
    });
  }, []);

  function isChipActive(chip: QuickChip) {
    if (chip.kind === "when") return when === chip.when;
    if (allTypes) return true;
    if (chip.kind === "category") {
      return includesAll(categories, chip.categories);
    }
    return isPublicActivityGroupSelected(activities, chip.groupId);
  }

  function applyTypeSelection(
    nextCategories: EventCategory[],
    nextActivities: ActivityId[],
  ) {
    if (
      sameSet(nextCategories, ALL_CATEGORIES) &&
      sameSet(nextActivities, ALL_ACTIVITY_IDS)
    ) {
      setAllTypes(true);
      setCategories([]);
      setActivities([]);
      return;
    }
    setAllTypes(false);
    setCategories(nextCategories);
    setActivities(nextActivities);
  }

  function toggleChip(chip: QuickChip) {
    if (chip.kind === "when") {
      setWhen((current) => (current === chip.when ? "any" : chip.when));
      if (chip.when !== "date") setDate("");
      return;
    }

    const emptyCustom =
      !allTypes && categories.length === 0 && activities.length === 0;

    if (chip.kind === "category") {
      if (allTypes) {
        applyTypeSelection(
          ALL_CATEGORIES.filter((id) => !chip.categories.includes(id)),
          [...ALL_ACTIVITY_IDS],
        );
        return;
      }
      if (emptyCustom) {
        applyTypeSelection([...chip.categories], []);
        return;
      }
      applyTypeSelection(toggleList(categories, chip.categories), activities);
      return;
    }

    if (allTypes) {
      const group = PUBLIC_ACTIVITY_GROUPS.find((g) => g.id === chip.groupId);
      const remove = new Set(group?.activities ?? []);
      applyTypeSelection(
        [...ALL_CATEGORIES],
        ALL_ACTIVITY_IDS.filter((id) => !remove.has(id)),
      );
      return;
    }
    if (emptyCustom) {
      applyTypeSelection(
        [],
        togglePublicActivityGroup([], chip.groupId),
      );
      return;
    }
    applyTypeSelection(
      categories,
      togglePublicActivityGroup(activities, chip.groupId),
    );
  }

  function toggleAlleSoorten() {
    if (allTypes) {
      setAllTypes(false);
      setCategories([]);
      setActivities([]);
      return;
    }
    setAllTypes(true);
    setCategories([]);
    setActivities([]);
  }

  function go() {
    if (searching) return;
    const missing: string[] = [];
    const nextInvalid: { age?: boolean; date?: boolean } = {};
    const ageTrimmed = age.trim();
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

    if (when === "date" && !date) {
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

    const state: SearchState = {
      age: parsedAge,
      gender: gender || null,
      placeId: findPlace(placeId).id,
      maxDistanceKm: distance,
      preferredAgeMin: prefMin ? Number(prefMin) : null,
      preferredAgeMax: prefMax ? Number(prefMax) : null,
      preferredMeetGender: meetGender,
      when,
      date: when === "date" ? date || null : null,
      // "Alles" (allTypes of volledige set) = geen typefilter in de zoek-URL.
      categories:
        allTypes || sameSet(categories, ALL_CATEGORIES) ? [] : categories,
      activities:
        allTypes || sameSet(activities, ALL_ACTIVITY_IDS) ? [] : activities,
      price: "any",
      singlesOnly: false,
      availability: "any",
      strictOnly: false,
      sort: "match",
    };
    setError("");
    setInvalidFields({});
    setSearching(true);
    try {
      writeProfile(profileFromSearch(state));
      track("search_performed", {
        age: state.age,
        placeId: state.placeId,
        distance: state.maxDistanceKm,
        when: state.when,
      });
      markSearchPending();
      const query = serializeSearchState(state);
      const url = query ? `/ontdek?${query}` : "/ontdek";
      // Hard navigation: client soft-nav from the hero was intermittently a no-op
      // on production (submit ran, profile wrote, URL stayed on /).
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

  const extraFilterCount = [
    meetGender !== "anyone",
    Boolean(prefMin || prefMax),
  ].filter(Boolean).length;

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

      <div className="relative mx-auto flex min-h-[100svh] w-full min-w-0 max-w-6xl flex-col justify-center px-4 pb-24 pt-24 sm:px-6 sm:pb-16 sm:pt-28">
        <p className="text-[11px] font-medium tracking-[0.22em] text-white/65 uppercase sm:text-xs">
          OfflineRadar
        </p>
        <h1 className="mt-4 max-w-[18ch] text-balance text-[1.55rem] font-semibold leading-[1.2] tracking-[-0.02em] text-white sm:mt-5 sm:max-w-2xl sm:text-[2.35rem] sm:leading-[1.15] lg:text-[2.75rem] lg:leading-[1.12]">
          Date offline. Ervaar opnieuw de kracht van echte connecties.
        </h1>
        <p className="mt-3.5 max-w-md text-pretty text-[13.5px] leading-6 font-normal text-white/70 sm:mt-4 sm:max-w-lg sm:text-[15px] sm:leading-7">
          Ontdek hier singlesevents en activiteiten waar je andere singles in
          het echt kunt ontmoeten.
        </p>

        <form
          className="mt-8 w-full min-w-0 max-w-4xl sm:mt-10"
          onSubmit={(event) => {
            event.preventDefault();
            go();
          }}
        >
          <div className="search-divider overflow-hidden rounded-3xl bg-white lg:rounded-[2.5rem]">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.2fr)_minmax(0,0.68fr)_minmax(0,0.85fr)_minmax(0,0.72fr)]">
              <Field label="Waar" chevron>
                <select
                  value={placeId}
                  onChange={(event) => setPlaceId(event.target.value)}
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
                  value={when}
                  onChange={(event) => {
                    const next = event.target.value as WhenFilter;
                    setWhen(next);
                    if (next !== "date") {
                      setDate("");
                      setInvalidFields((current) => ({
                        ...current,
                        date: false,
                      }));
                    }
                  }}
                  className="search-field-control w-full bg-transparent text-[15px] font-semibold leading-6 outline-none"
                >
                  <option value="any">{WHEN_LABEL.any}</option>
                  <option value="today">Vandaag</option>
                  <option value="tomorrow">Morgen</option>
                  <option value="weekend">Dit weekend</option>
                  <option value="next_week">Volgende week</option>
                  <option value="month">Deze maand</option>
                  <option value="date">Datum kiezen</option>
                </select>
              </Field>
              <Field
                label="Mijn leeftijd"
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
                  value={age}
                  aria-invalid={invalidFields.age || undefined}
                  aria-describedby={invalidFields.age ? "home-search-error" : undefined}
                  onChange={(event) => {
                    setAge(event.target.value);
                    if (invalidFields.age) {
                      setInvalidFields((current) => ({ ...current, age: false }));
                      setError("");
                    }
                  }}
                  className="search-field-control w-full bg-transparent text-[15px] font-semibold leading-6 outline-none placeholder:font-normal placeholder:text-muted-foreground"
                />
              </Field>
              <Field label="Mijn gender (optioneel)" divide chevron>
                <select
                  value={gender}
                  onChange={(event) =>
                    setGender(event.target.value as UserGender | "")
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
                  value={distance}
                  onChange={(event) => setDistance(Number(event.target.value))}
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
            {when === "date" ? (
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
                      invalidFields.date ? "text-[#e61e4d]" : "text-muted-foreground"
                    }`}
                  >
                    Datum {invalidFields.date ? "(verplicht)" : ""}
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={date}
                    aria-invalid={invalidFields.date || undefined}
                    aria-describedby={
                      invalidFields.date ? "home-search-error" : undefined
                    }
                    onChange={(event) => {
                      setDate(event.target.value);
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
              onClick={() => setMoreOpen((value) => !value)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <SlidersHorizontal className="size-4 shrink-0" />
              Meer filters
              {extraFilterCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-[#e61e4d]">
                  {extraFilterCount}
                </span>
              ) : null}
              <ChevronDown
                className={`size-4 shrink-0 transition ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>
            <p className="max-w-[16rem] pl-1 text-sm leading-5 text-white/70 sm:max-w-none sm:pl-0">
              Extra: voorkeuren voor wie je wilt ontmoeten
            </p>
          </div>

          {moreOpen ? (
            <div className="mt-3 space-y-5 rounded-2xl bg-white p-4 text-foreground shadow-lg sm:p-5">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold tracking-wide uppercase">
                  Wie wil je graag ontmoeten?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Optioneel. Dit rangschikt resultaten, het verbergt geen activiteiten.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(MEET_GENDER_LABEL) as PreferredMeetGender[]).map(
                    (key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={meetGender === key}
                        onClick={() => setMeetGender(key)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          meetGender === key
                            ? "border-foreground bg-foreground text-white"
                            : "border-border bg-white"
                        }`}
                      >
                        {MEET_GENDER_LABEL[key]}
                      </button>
                    ),
                  )}
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <h2 className="text-sm font-semibold tracking-wide uppercase">
                  Gewenste leeftijd
                </h2>
                <p className="text-xs text-muted-foreground">
                  Dit is een voorkeur. We tonen ook andere activiteiten waarvoor je
                  kunt deelnemen.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Van</span>
                    <input
                      type="number"
                      min={18}
                      max={99}
                      value={prefMin}
                      onChange={(event) => setPrefMin(event.target.value)}
                      placeholder="40"
                      className="h-11 w-full rounded-xl border border-border px-3"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Tot</span>
                    <input
                      type="number"
                      min={18}
                      max={99}
                      value={prefMax}
                      onChange={(event) => setPrefMax(event.target.value)}
                      placeholder="52"
                      className="h-11 w-full rounded-xl border border-border px-3"
                    />
                  </label>
                </div>
              </section>
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-white/70 uppercase">
                Waar heb je zin in?
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={allTypes}
                  onClick={toggleAlleSoorten}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm transition ${
                    allTypes
                      ? "border-white bg-white text-foreground"
                      : "border-white/40 bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  Alle soorten
                </button>
                {TYPE_QUICK.map((item) => {
                  const active = isChipActive(item);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleChip(item)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium backdrop-blur-sm transition ${
                        active
                          ? "border-white bg-white text-foreground"
                          : "border-white/25 bg-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

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
    </section>
  );
}

function Field({
  label,
  children,
  divide = false,
  chevron = false,
  invalid = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  divide?: boolean;
  chevron?: boolean;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={`block min-w-0 cursor-pointer px-4 py-3.5 transition hover:bg-black/[0.03] focus-within:bg-black/[0.03] sm:px-5 lg:px-5 lg:py-4 ${
        divide ? "border-t border-border lg:border-t-0 lg:border-l" : ""
      } ${invalid ? "bg-[#fff5f7] ring-2 ring-inset ring-[#e61e4d]/70" : ""}`}
    >
      <span
        className={`mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] uppercase ${
          invalid ? "text-[#e61e4d]" : "text-muted-foreground"
        }`}
      >
        {label}
        {hint ? (
          <span className="rounded-full bg-[#e61e4d] px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-white normal-case">
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className={`relative block min-h-6 min-w-0 ${chevron ? "pr-5" : ""}`}
      >
        {children}
        {chevron ? (
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-0 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </span>
    </label>
  );
}
