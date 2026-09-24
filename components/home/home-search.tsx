"use client";

import Image from "next/image";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { USER_PLACES, placeFromPostcode } from "@/data/places";
import { track } from "@/lib/analytics";
import { DISTANCES, GENDER_LABEL, MEET_GENDER_LABEL, WHEN_LABEL } from "@/lib/format";
import { heroImageUrl } from "@/lib/images";
import { profileFromSearch, serializeSearchState } from "@/lib/search-state";
import { readProfile, writeProfile } from "@/lib/storage";
import type {
  ActivityId,
  EventCategory,
  PreferredMeetGender,
  UserGender,
} from "@/types/event";
import type { SearchState, WhenFilter } from "@/types/search";

type QuickChip = {
  label: string;
  when?: WhenFilter;
  categories?: EventCategory[];
  activities?: ActivityId[];
};

const QUICK: QuickChip[] = [
  { label: "Dit weekend", when: "weekend" },
  { label: "Dating", categories: ["dating"] },
  { label: "Nieuwe mensen", categories: ["meet_new_people"] },
  { label: "Sport", activities: ["sport"] },
  { label: "Eten & drinken", activities: ["eten", "drinken"] },
  { label: "Uitgaan", activities: ["party"] },
  { label: "Wandelen", activities: ["wandelen"] },
  { label: "Reizen", activities: ["reizen"] },
];

const ALL_CATEGORIES = [
  ...new Set(QUICK.flatMap((chip) => chip.categories ?? [])),
] as EventCategory[];

const ALL_ACTIVITIES = [
  ...new Set(QUICK.flatMap((chip) => chip.activities ?? [])),
] as ActivityId[];

function includesAll<T>(haystack: T[], needles: T[]) {
  return needles.every((item) => haystack.includes(item));
}

function toggleList<T>(current: T[], next: T[]) {
  if (includesAll(current, next)) {
    return current.filter((item) => !next.includes(item));
  }
  return [...new Set([...current, ...next])];
}

export function HomeHero() {
  const router = useRouter();
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<UserGender | "">("");
  const [placeId, setPlaceId] = useState("antwerpen");
  const [postcode, setPostcode] = useState("");
  const [distance, setDistance] = useState(25);
  const [when, setWhen] = useState<WhenFilter>("weekend");
  const [date, setDate] = useState("");
  const [activities, setActivities] = useState<ActivityId[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [prefMin, setPrefMin] = useState("");
  const [prefMax, setPrefMax] = useState("");
  const [meetGender, setMeetGender] =
    useState<PreferredMeetGender>("anyone");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const profile = readProfile();
    queueMicrotask(() => {
      if (profile.age) setAge(String(profile.age));
      if (profile.gender) setGender(profile.gender);
      if (profile.placeId) setPlaceId(profile.placeId);
      if (profile.maxDistanceKm) setDistance(profile.maxDistanceKm);
      if (profile.interests.length) setActivities(profile.interests);
      if (profile.preferredAgeMin) setPrefMin(String(profile.preferredAgeMin));
      if (profile.preferredAgeMax) setPrefMax(String(profile.preferredAgeMax));
      if (profile.preferredMeetGender) setMeetGender(profile.preferredMeetGender);
    });
  }, []);

  function isChipActive(chip: QuickChip) {
    if (chip.when) return when === chip.when;
    if (chip.categories) return includesAll(categories, chip.categories);
    if (chip.activities) return includesAll(activities, chip.activities);
    return false;
  }

  function toggleChip(chip: QuickChip) {
    if (chip.when) {
      setWhen((current) => (current === chip.when ? "any" : chip.when!));
      return;
    }
    if (chip.categories) {
      setCategories((current) => toggleList(current, chip.categories!));
      return;
    }
    if (chip.activities) {
      setActivities((current) => toggleList(current, chip.activities!));
    }
  }

  const allCategoriesActive =
    includesAll(categories, ALL_CATEGORIES) &&
    includesAll(activities, ALL_ACTIVITIES);

  function toggleAllCategories() {
    if (allCategoriesActive) {
      setCategories([]);
      setActivities([]);
      return;
    }
    setCategories(ALL_CATEGORIES);
    setActivities(ALL_ACTIVITIES);
  }

  function go() {
    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge < 18 || parsedAge > 99) {
      setError("Vul je leeftijd in.");
      return;
    }
    const known = placeFromPostcode(postcode);
    if (postcode.trim() && !known) {
      setNote("Postcode niet herkend. Kies een regio.");
      return;
    }
    const state: SearchState = {
      age: parsedAge,
      gender: gender || null,
      placeId: known?.id ?? placeId,
      maxDistanceKm: distance,
      preferredAgeMin: prefMin ? Number(prefMin) : null,
      preferredAgeMax: prefMax ? Number(prefMax) : null,
      preferredMeetGender: meetGender,
      when,
      date: when === "date" ? date || null : null,
      categories,
      activities,
      price: "any",
      singlesOnly: false,
      availability: "any",
      strictOnly: false,
      sort: "match",
    };
    setError("");
    setNote("");
    writeProfile(profileFromSearch(state));
    track("search_performed", {
      age: state.age,
      placeId: state.placeId,
      distance: state.maxDistanceKm,
      when: state.when,
    });
    const query = serializeSearchState(state);
    router.push(query ? `/ontdek?${query}` : "/ontdek");
  }

  const extraFilterCount = [
    meetGender !== "anyone",
    Boolean(prefMin || prefMax),
    Boolean(postcode.trim()),
  ].filter(Boolean).length;

  return (
    <section className="relative -mt-16 min-h-[100svh] overflow-hidden">
      <Image
        src={heroImageUrl()}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/60" />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col justify-center px-4 pb-16 pt-28 sm:px-6">
        <p className="text-sm font-semibold tracking-[0.18em] text-white/90 uppercase">
          OfflineRadar
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-6xl sm:leading-[1.05]">
          Ga offline. Ontmoet mensen.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-white/85 sm:text-lg">
          Singles-events, diners, wandelingen, sport en meer, op één plek.
        </p>

        <form
          className="mt-8 w-full max-w-4xl"
          onSubmit={(event) => {
            event.preventDefault();
            go();
          }}
        >
          <div className="search-divider overflow-hidden rounded-[40px] bg-white">
            <div className="grid lg:grid-cols-[1.15fr_1fr_0.7fr_0.85fr_0.75fr]">
              <Field label="Waar">
                <select
                  value={placeId}
                  onChange={(event) => setPlaceId(event.target.value)}
                  className="w-full bg-transparent text-[15px] font-semibold outline-none"
                >
                  {USER_PLACES.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Wanneer" divide>
                <select
                  value={when}
                  onChange={(event) => setWhen(event.target.value as WhenFilter)}
                  className="w-full bg-transparent text-[15px] font-semibold outline-none"
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
              <Field label="Mijn leeftijd" divide>
                <input
                  type="number"
                  min={18}
                  max={99}
                  inputMode="numeric"
                  placeholder="bv. 49"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  className="w-full bg-transparent text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
                />
              </Field>
              <Field label="Mijn gender" divide>
                <select
                  value={gender}
                  onChange={(event) =>
                    setGender(event.target.value as UserGender | "")
                  }
                  className="w-full bg-transparent text-[15px] font-semibold outline-none"
                >
                  <option value="">Kies</option>
                  {(Object.keys(GENDER_LABEL) as UserGender[]).map((key) => (
                    <option key={key} value={key}>
                      {GENDER_LABEL[key]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Afstand" divide>
                <select
                  value={distance}
                  onChange={(event) => setDistance(Number(event.target.value))}
                  className="w-full bg-transparent text-[15px] font-semibold outline-none"
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
              <div className="border-t border-border px-6 py-3">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="text-sm font-semibold outline-none"
                />
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <SlidersHorizontal className="size-4" />
              Meer filters
              {extraFilterCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-[#e61e4d]">
                  {extraFilterCount}
                </span>
              ) : null}
              <ChevronDown
                className={`size-4 transition ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>
            <p className="hidden text-sm text-white/75 sm:block">
              Postcode, voorkeuren en meer
            </p>
          </div>

          {moreOpen ? (
            <div className="mt-3 space-y-5 rounded-2xl bg-white p-4 text-foreground shadow-lg sm:p-5">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold tracking-wide uppercase">
                  Locatie verfijnen
                </h2>
                <p className="text-xs text-muted-foreground">
                  Optioneel. Met een postcode zoeken we gerichter rond jouw buurt.
                </p>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Postcode</span>
                  <input
                    value={postcode}
                    onChange={(event) => setPostcode(event.target.value)}
                    placeholder="2000"
                    className="h-11 w-full rounded-xl border border-border px-3"
                  />
                </label>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
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

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-white/70 uppercase">
              Waar heb je zin in?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={allCategoriesActive}
                onClick={toggleAllCategories}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm transition ${
                  allCategoriesActive
                    ? "border-white bg-white text-foreground"
                    : "border-white/40 bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                Alle categorieën
              </button>
              {QUICK.map((item) => {
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

          <div className="mt-6">
            {(error || note) && (
              <p className="mb-3 text-sm font-medium text-white">
                {error || note}
              </p>
            )}
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#e61e4d] px-6 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-[#d70466] sm:w-auto sm:min-w-[240px]"
            >
              <Search className="size-4" />
              Vind activiteiten
            </button>
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
}: {
  label: string;
  children: ReactNode;
  divide?: boolean;
}) {
  return (
    <label
      className={`block cursor-pointer px-6 py-3.5 transition hover:bg-black/[0.03] ${
        divide ? "lg:border-l lg:border-border" : ""
      }`}
    >
      <span className="mb-0.5 block text-[12px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
