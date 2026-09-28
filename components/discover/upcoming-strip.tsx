"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { Event } from "@/types/event";
import { upcomingStickerLabel } from "@/lib/upcoming";

export function UpcomingStrip({
  events,
  hrefBase = "/event",
  today,
}: {
  events: Event[];
  hrefBase?: string;
  today: string;
}) {
  if (events.length === 0) return null;

  return (
    <section
      className="mb-5 flex min-w-0 items-center gap-2.5 sm:gap-3"
      aria-labelledby="binnenkort-heading"
    >
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
        <CalendarDays
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 id="binnenkort-heading" className="text-xs font-semibold">
          Binnenkort
        </h2>
      </div>

      <div
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain pb-0.5 snap-x snap-mandatory [scrollbar-width:thin]"
        role="list"
        tabIndex={0}
        aria-label="Binnenkort: horizontaal scrollbare evenementen"
      >
        {events.map((event) => {
          const label = upcomingStickerLabel(event, today);
          return (
            <div key={event.id} role="listitem" className="shrink-0 snap-start">
              <Link
                href={`${hrefBase}/${event.slug}`}
                className="inline-flex max-w-[min(70vw,18rem)] items-center truncate rounded-full border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs text-foreground/90 transition-colors hover:border-foreground/40 hover:bg-secondary/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                title={label}
              >
                <span className="truncate">{label}</span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
