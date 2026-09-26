"use client";

import { UpcomingCard } from "@/components/discover/upcoming-card";
import type { PreparedEvent } from "@/lib/filters";
import type { UserGender } from "@/types/event";

export function UpcomingStrip({
  events,
  gender = null,
  hrefBase = "/event",
  today,
}: {
  events: PreparedEvent[];
  gender?: UserGender | null;
  hrefBase?: string;
  today: string;
}) {
  if (events.length === 0) return null;

  return (
    <section
      className="mt-8 min-w-0"
      aria-labelledby="binnenkort-heading"
    >
      <div className="min-w-0">
        <h2
          id="binnenkort-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Binnenkort
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Singlesevents die de komende dagen plaatsvinden
        </p>
      </div>

      <div
        className="mt-4 -mx-4 flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 snap-x snap-mandatory scroll-px-4 sm:mx-0 sm:gap-4 sm:px-0 sm:scroll-px-0 [scrollbar-width:thin]"
        role="list"
        tabIndex={0}
        aria-label="Binnenkort: horizontaal scrollbare evenementen"
      >
        {events.map((event) => (
          <div key={event.id} role="listitem" className="min-w-0">
            <UpcomingCard
              event={event}
              gender={gender}
              hrefBase={hrefBase}
              today={today}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
