"use client";

import { useEffect, useState } from "react";
import { EventCard } from "@/components/events/event-card";
import { withUserDistance } from "@/lib/distance";
import { isEligibleForEvent } from "@/lib/eligibility";
import { readFavorites, readProfile } from "@/lib/storage";
import type { Event, UserGender } from "@/types/event";

export function SavedView({ events }: { events: Event[] }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [placeId, setPlaceId] = useState("antwerpen");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<UserGender | null>(null);

  useEffect(() => {
    const sync = () => {
      setIds(readFavorites());
      const profile = readProfile();
      setPlaceId(profile.placeId);
      setAge(profile.age);
      setGender(profile.gender);
    };
    sync();
    window.addEventListener("offlineradar-store", sync);
    return () => window.removeEventListener("offlineradar-store", sync);
  }, []);

  if (ids == null) {
    return (
      <p className="px-4 py-12 text-sm text-muted-foreground sm:px-6">
        Bewaarde activiteiten laden…
      </p>
    );
  }

  const saved = events
    .filter((event) => ids.includes(event.id))
    .map((event) => {
      const placed = withUserDistance(event, placeId);
      return {
        ...placed,
        participation: isEligibleForEvent({ age, gender }, placed),
      };
    });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Bewaard
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Bewaarde activiteiten blijven op dit toestel. Er is geen account.
      </p>
      {saved.length === 0 ? (
        <p className="mt-12 max-w-md text-[15px] leading-7 text-muted-foreground">
          Je hebt nog niets bewaard. Bewaar een activiteit om ze later terug te
          vinden.
        </p>
      ) : (
        <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((event) => (
            <EventCard key={event.id} event={event} gender={gender} />
          ))}
        </div>
      )}
    </div>
  );
}
