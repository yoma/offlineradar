"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import type { Event } from "@/types/event";
import { upcomingUrgencyLabel } from "@/lib/upcoming";

export function UpcomingStrip({
  events,
  hrefBase = "/event",
  today,
  variant = "default",
  headingId = "binnenkort-heading",
  seeAllHref = "/ontdek",
}: {
  events: Event[];
  hrefBase?: string;
  today: string;
  /** `onDark` = over hero image; `hero` / `default` = light surfaces. */
  variant?: "default" | "hero" | "onDark";
  headingId?: string;
  seeAllHref?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isOnDark = variant === "onDark";

  if (events.length === 0) return null;

  function scrollByCard(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const card = scroller.querySelector<HTMLElement>("[data-ticker-card]");
    const step = card ? card.offsetWidth + 8 : Math.max(200, scroller.clientWidth * 0.4);
    scroller.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  return (
    <section
      className={`min-w-0 ${
        isOnDark
          ? "rounded-2xl border border-white/15 bg-[var(--brand-cream)]/95 p-3 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.55)] backdrop-blur-sm sm:p-4"
          : variant === "hero"
            ? "mb-5 rounded-2xl border border-border bg-[var(--brand-cream)] p-3 sm:p-4"
            : "mb-5 rounded-2xl border border-border bg-[var(--brand-cream)] p-3 sm:p-4"
      }`}
      aria-labelledby={headingId}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className="font-heading-section text-sm text-[var(--brand-bordeaux)]"
        >
          Binnenkort te beleven
        </h2>
        <Link
          href={seeAllHref}
          className="shrink-0 text-sm font-medium text-[var(--brand-gold-ink)] transition-colors hover:text-[var(--brand-bordeaux)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          Bekijk alles →
        </Link>
      </div>

      <div className="relative">
        <button
          type="button"
          className="absolute top-1/2 -left-1 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-sm transition-colors hover:bg-[var(--brand-gold-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground md:flex"
          aria-label="Vorige activiteiten"
          onClick={() => scrollByCard(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="absolute top-1/2 -right-1 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-sm transition-colors hover:bg-[var(--brand-gold-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground md:flex"
          aria-label="Volgende activiteiten"
          onClick={() => scrollByCard(1)}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>

        <div
          ref={scrollerRef}
          role="list"
          aria-label="Binnenkort te beleven"
          className="upcoming-ticker-scroller flex gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory md:snap-none md:px-7"
        >
          {events.map((event) => {
            const when = upcomingUrgencyLabel(event.startDate, today);
            const city = (event.city ?? "").trim();
            return (
              <article
                key={event.id}
                role="listitem"
                data-ticker-card
                className="flex min-h-[4.5rem] w-[85%] shrink-0 snap-start flex-col justify-center rounded-xl border border-border bg-white px-3 py-2 shadow-[0_6px_16px_-12px_rgba(47,48,53,0.35)] sm:w-[min(16rem,70%)] md:w-[calc((100%-1rem)/2.4)] md:min-w-[12rem]"
              >
                <Link
                  href={`${hrefBase}/${event.slug}`}
                  className="flex min-h-[4.5rem] flex-col justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                >
                  <p className="text-[11px] font-semibold tracking-wide text-[var(--brand-gold-ink)] uppercase">
                    {when}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-snug font-semibold text-[var(--brand-bordeaux)]">
                    {event.title}
                  </p>
                  {city ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {city}
                    </p>
                  ) : null}
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
