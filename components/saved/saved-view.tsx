"use client";

import { useEffect, useState } from "react";
import { EventCard } from "@/components/events/event-card";
import { withUserDistance } from "@/lib/distance";
import { isEligibleForEvent } from "@/lib/eligibility";
import { readFavorites, readProfile } from "@/lib/storage";
import type { Event } from "@/types/event";

export function SavedView({ events }: { events: Event[] }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [placeId, setPlaceId] = useState("antwerpen");
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => {
      setIds(readFavorites());
      const profile = readProfile();
      setPlaceId(profile.placeId);
      setAge(profile.age);
    };
    sync();
    window.addEventListener("offlineradar-store", sync);
    return () => window.removeEventListener("offlineradar-store", sync);
  }, []);

  if (ids == null) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Bewaarde activiteiten laden…</p>;
  }

  const saved = events
    .filter((event) => ids.includes(event.id))
    .map((event) => {
      const placed = withUserDistance(event, placeId);
      return {
        ...placed,
        eligibility: isEligibleForEvent({ age }, placed),
      };
    });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="font-heading text-3xl">Bewaard</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Bewaarde activiteiten blijven op dit toestel. Er is geen account.
      </p>
      {saved.length === 0 ? (
        <p className="mt-8 rounded-2xl border bg-card p-5 text-sm leading-6">
          Je hebt nog niets bewaard. Bewaar een activiteit om ze later terug te vinden.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {saved.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
