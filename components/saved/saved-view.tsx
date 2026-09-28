"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { listSavedIdsAction } from "@/app/account/actions";
import { EventCard } from "@/components/events/event-card";
import { withUserDistance } from "@/lib/distance";
import { isEligibleForEvent } from "@/lib/eligibility";
import { readFavorites, readProfile, writeFavorites } from "@/lib/storage";
import type { Event, UserGender } from "@/types/event";

export function SavedView({ events }: { events: Event[] }) {
  const { data: session, status } = useSession();
  const loggedIn = Boolean(session?.user?.id);
  const [ids, setIds] = useState<string[] | null>(null);
  const [placeId, setPlaceId] = useState("antwerpen");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<UserGender | null>(null);

  useEffect(() => {
    const syncLocal = () => {
      const profile = readProfile();
      setPlaceId(profile.placeId);
      setAge(profile.age);
      setGender(profile.gender);
      if (!loggedIn) setIds(readFavorites());
    };
    syncLocal();
    window.addEventListener("offlineradar-store", syncLocal);
    return () => window.removeEventListener("offlineradar-store", syncLocal);
  }, [loggedIn]);

  useEffect(() => {
    if (status === "loading") return;
    if (!loggedIn) {
      setIds(readFavorites());
      return;
    }
    let cancelled = false;
    void listSavedIdsAction().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        writeFavorites(result.ids);
        setIds(result.ids);
      } else {
        setIds(readFavorites());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loggedIn, status]);

  if (ids == null || status === "loading") {
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
        {loggedIn
          ? "Je bewaarde activiteiten zijn gekoppeld aan je account en beschikbaar op al je toestellen."
          : "Bewaarde activiteiten blijven op dit toestel."}
      </p>
      {!loggedIn ? (
        <p className="mt-2 text-sm text-muted-foreground">
          <Link
            href="/inloggen?callbackUrl=/bewaard"
            className="font-medium underline-offset-4 hover:underline"
          >
            Log in
          </Link>{" "}
          om je bewaarde events op al je toestellen terug te zien.
        </p>
      ) : null}
      {saved.length === 0 ? (
        <p className="mt-12 max-w-md text-[15px] leading-7 text-muted-foreground">
          Je hebt nog niets bewaard. Bewaar een activiteit om ze later terug te
          vinden.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {saved.map((event) => (
            <EventCard key={event.id} event={event} gender={gender} />
          ))}
        </div>
      )}
    </div>
  );
}
