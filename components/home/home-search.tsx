"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_PLACES, placeFromPostcode } from "@/data/places";
import { track } from "@/lib/analytics";
import { ACTIVITY_LABEL, DISTANCES, WHEN_LABEL } from "@/lib/format";
import { profileFromSearch, serializeSearchState } from "@/lib/search-state";
import { readProfile, writeProfile } from "@/lib/storage";
import type { ActivityId, EventCategory } from "@/types/event";
import type { SearchState, WhenFilter } from "@/types/search";

const QUICK: {
  label: string;
  patch: Partial<SearchState>;
}[] = [
  { label: "Dit weekend", patch: { when: "weekend" } },
  { label: "Dating", patch: { categories: ["dating"] } },
  { label: "Meet new people", patch: { categories: ["meet_new_people"] } },
  { label: "Sport", patch: { activities: ["sport"] } },
  { label: "Eten & drinken", patch: { activities: ["eten", "drinken"] } },
  { label: "Party", patch: { activities: ["party"] } },
  { label: "Wandelen", patch: { activities: ["wandelen"] } },
  { label: "Reizen", patch: { activities: ["reizen"] } },
];

export function HomeSearch() {
  const router = useRouter();
  const [age, setAge] = useState("");
  const [placeId, setPlaceId] = useState("antwerpen");
  const [postcode, setPostcode] = useState("");
  const [postcodeNote, setPostcodeNote] = useState("");
  const [distance, setDistance] = useState(25);
  const [when, setWhen] = useState<WhenFilter>("any");
  const [date, setDate] = useState("");
  const [activities, setActivities] = useState<ActivityId[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [prefMin, setPrefMin] = useState("");
  const [prefMax, setPrefMax] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const profile = readProfile();
    if (profile.age) setAge(String(profile.age));
    if (profile.placeId) setPlaceId(profile.placeId);
    if (profile.maxDistanceKm) setDistance(profile.maxDistanceKm);
    if (profile.interests.length) setActivities(profile.interests);
    if (profile.preferredAgeMin) setPrefMin(String(profile.preferredAgeMin));
    if (profile.preferredAgeMax) setPrefMax(String(profile.preferredAgeMax));
  }, []);

  function toggleActivity(id: ActivityId) {
    setActivities((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function go(extra?: Partial<SearchState>) {
    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge < 18 || parsedAge > 99) {
      setError("Vul je leeftijd in. We gebruiken die alleen om te zien of je mag deelnemen.");
      document.getElementById("age")?.focus();
      return;
    }
    const knownPlace = placeFromPostcode(postcode);
    if (postcode.trim() && !knownPlace) {
      setPostcodeNote("Die postcode kennen we in dit prototype nog niet. Kies een gemeente.");
      return;
    }
    const nextPlace = knownPlace?.id ?? placeId;
    const state: SearchState = {
      age: parsedAge,
      placeId: nextPlace,
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
    if (
      state.preferredAgeMin != null &&
      state.preferredAgeMax != null &&
      state.preferredAgeMin > state.preferredAgeMax
    ) {
      setError("De minimumleeftijd van je voorkeur moet lager zijn dan de maximumleeftijd.");
      return;
    }
    setError("");
    writeProfile(profileFromSearch(state));
    track("search_performed", {
      age: state.age,
      placeId: state.placeId,
      distance: state.maxDistanceKm,
      when: state.when,
      activities: state.activities.join(","),
      categories: state.categories.join(","),
    });
    const query = serializeSearchState(state);
    router.push(query ? `/ontdek?${query}` : "/ontdek");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <form
        className="space-y-5 rounded-3xl border bg-card p-4 shadow-sm sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          go();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="when">Wanneer</Label>
            <select
              id="when"
              value={when}
              onChange={(event) => setWhen(event.target.value as WhenFilter)}
              className="h-12 w-full rounded-xl border bg-background px-3 text-base"
            >
              <option value="any">{WHEN_LABEL.any}</option>
              <option value="today">Vandaag</option>
              <option value="tomorrow">Morgen</option>
              <option value="weekend">Dit weekend</option>
              <option value="next_week">Volgende week</option>
              <option value="month">Deze maand</option>
              <option value="date">Datum kiezen</option>
            </select>
            {when === "date" ? (
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-12 text-base"
                required
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="place">Regio</Label>
            <select
              id="place"
              value={placeId}
              onChange={(event) => setPlaceId(event.target.value)}
              className="h-12 w-full rounded-xl border bg-background px-3 text-base"
            >
              {USER_PLACES.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="postcode">Of postcode</Label>
            <Input
              id="postcode"
              inputMode="numeric"
              placeholder="2000"
              value={postcode}
              onChange={(event) => {
                setPostcode(event.target.value);
                setPostcodeNote("");
              }}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Mijn leeftijd</Label>
            <Input
              id="age"
              type="number"
              min={18}
              max={99}
              required
              value={age}
              onChange={(event) => setAge(event.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Maximale afstand</p>
          <div className="grid grid-cols-4 gap-2">
            {DISTANCES.map((km) => (
              <button
                key={km}
                type="button"
                aria-pressed={distance === km}
                onClick={() => setDistance(km)}
                className={`h-11 rounded-xl border text-sm ${
                  distance === km ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                {km} km
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Wat wil ik doen?</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACTIVITY_LABEL) as ActivityId[]).map((activity) => (
              <button
                key={activity}
                type="button"
                aria-pressed={activities.includes(activity)}
                onClick={() => toggleActivity(activity)}
                className={`rounded-full border px-3 py-2 text-sm ${
                  activities.includes(activity)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background"
                }`}
              >
                {ACTIVITY_LABEL[activity]}
              </button>
            ))}
          </div>
        </div>

        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Welke leeftijdsgroep wil je liefst ontmoeten?
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Dit is een voorkeur. Het bepaalt niet of je mag deelnemen.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Input
              type="number"
              min={18}
              max={99}
              placeholder="40"
              aria-label="Voorkeur vanaf"
              value={prefMin}
              onChange={(event) => setPrefMin(event.target.value)}
              className="h-11"
            />
            <Input
              type="number"
              min={18}
              max={99}
              placeholder="52"
              aria-label="Voorkeur tot"
              value={prefMax}
              onChange={(event) => setPrefMax(event.target.value)}
              className="h-11"
            />
          </div>
        </details>

        {postcodeNote ? <p className="text-sm text-amber-800">{postcodeNote}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <Button type="submit" className="h-12 w-full rounded-xl text-base">
          Vind activiteiten
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Geen account. Tickets altijd bij de organisator.
        </p>
      </form>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
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
            className="shrink-0 rounded-full border bg-card px-3 py-2 text-sm"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
