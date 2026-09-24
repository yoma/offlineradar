"use client";

import Image from "next/image";
import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { USER_PLACES, placeFromPostcode } from "@/data/places";
import { track } from "@/lib/analytics";
import { DISTANCES, WHEN_LABEL } from "@/lib/format";
import { heroImageUrl } from "@/lib/images";
import { profileFromSearch, serializeSearchState } from "@/lib/search-state";
import { readProfile, writeProfile } from "@/lib/storage";
import type { ActivityId, EventCategory } from "@/types/event";
import type { SearchState, WhenFilter } from "@/types/search";

const QUICK: { label: string; patch: Partial<SearchState> }[] = [
  { label: "Dit weekend", patch: { when: "weekend" } },
  { label: "Dating", patch: { categories: ["dating"] } },
  { label: "Meet new people", patch: { categories: ["meet_new_people"] } },
  { label: "Sport", patch: { activities: ["sport"] } },
  { label: "Eten & drinken", patch: { activities: ["eten", "drinken"] } },
  { label: "Party", patch: { activities: ["party"] } },
  { label: "Wandelen", patch: { activities: ["wandelen"] } },
  { label: "Reizen", patch: { activities: ["reizen"] } },
];

export function HomeHero() {
  const router = useRouter();
  const [age, setAge] = useState("");
  const [placeId, setPlaceId] = useState("antwerpen");
  const [postcode, setPostcode] = useState("");
  const [distance, setDistance] = useState(25);
  const [when, setWhen] = useState<WhenFilter>("weekend");
  const [date, setDate] = useState("");
  const [activities, setActivities] = useState<ActivityId[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [prefMin, setPrefMin] = useState("");
  const [prefMax, setPrefMax] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const profile = readProfile();
    if (profile.age) setAge(String(profile.age));
    if (profile.placeId) setPlaceId(profile.placeId);
    if (profile.maxDistanceKm) setDistance(profile.maxDistanceKm);
    if (profile.interests.length) setActivities(profile.interests);
    if (profile.preferredAgeMin) setPrefMin(String(profile.preferredAgeMin));
    if (profile.preferredAgeMax) setPrefMax(String(profile.preferredAgeMax));
  }, []);

  function go(extra?: Partial<SearchState>) {
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
      placeId: known?.id ?? placeId,
      maxDistanceKm: distance,
      preferredAgeMin: prefMin ? Number(prefMin) : null,
      preferredAgeMax: prefMax ? Number(prefMax) : null,
      when,
      date: when === "date" ? date || null : null,
      categories,
      activities,
      price: "any",
      singlesOnly: false,
      availability: "any",
      strictOnly: false,
      sort: "match",
      ...extra,
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
            <div className="grid lg:grid-cols-[1.2fr_1fr_0.7fr_0.85fr_auto]">
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
              <Field label="Leeftijd" divide>
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
              <div className="flex items-center justify-end p-2">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#e61e4d] px-5 text-sm font-semibold text-white transition hover:bg-[#d70466] lg:w-12 lg:px-0"
                >
                  <Search className="size-4" />
                  <span className="lg:sr-only">Vind activiteiten</span>
                </button>
              </div>
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

          {(error || note) && (
            <p className="mt-3 text-sm font-medium text-white">
              {error || note}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {QUICK.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.patch.when) setWhen(item.patch.when);
                  if (item.patch.categories) setCategories(item.patch.categories);
                  if (item.patch.activities) setActivities(item.patch.activities);
                  go(item.patch);
                }}
                className="rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              className="rounded-full border border-white/25 bg-transparent px-3.5 py-1.5 text-sm font-medium text-white/90"
            >
              Meer opties
            </button>
          </div>

          {moreOpen ? (
            <div className="mt-4 space-y-3 rounded-2xl bg-white/95 p-4 text-foreground backdrop-blur">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Postcode</span>
                  <input
                    value={postcode}
                    onChange={(event) => setPostcode(event.target.value)}
                    placeholder="2000"
                    className="h-11 w-full rounded-xl border border-border px-3"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Ontmoeten vanaf</span>
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
                    <span className="mb-1 block font-medium">tot</span>
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
              </div>
              <p className="text-xs text-muted-foreground">
                Ontmoetingsleeftijd is een voorkeur, geen deelnamevoorwaarde.
              </p>
            </div>
          ) : null}
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
