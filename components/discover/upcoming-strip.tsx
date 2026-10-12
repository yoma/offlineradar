"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import type { Event } from "@/types/event";
import { upcomingUrgencyLabel } from "@/lib/upcoming";

const PX_PER_SECOND = 32;
const MIN_LOOP_ITEMS = 8;

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
  const trackRef = useRef<HTMLDivElement>(null);
  const isOnDark = variant === "onDark";

  const loopEvents = useMemo(() => {
    if (events.length === 0) return [];
    const filled: Event[] = [];
    while (filled.length < MIN_LOOP_ITEMS) {
      filled.push(...events);
    }
    return filled;
  }, [events]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function syncDuration() {
      if (!track) return;
      const halfWidth = track.scrollWidth / 2;
      if (halfWidth <= 0) return;
      const seconds = Math.max(18, halfWidth / PX_PER_SECOND);
      track.style.setProperty("--upcoming-ticker-duration", `${seconds}s`);
    }

    syncDuration();
    const observer = new ResizeObserver(syncDuration);
    observer.observe(track);
    return () => observer.disconnect();
  }, [loopEvents]);

  if (events.length === 0) return null;

  function renderCards(prefix: string, duplicateHalf: boolean) {
    return loopEvents.map((event, index) => {
      const when = upcomingUrgencyLabel(event.startDate, today);
      const city = (event.city ?? "").trim();
      const forScreenReader = !duplicateHalf && index < events.length;
      return (
        <article
          key={`${prefix}-${event.id}-${index}`}
          role={forScreenReader ? "listitem" : undefined}
          aria-hidden={forScreenReader ? undefined : true}
          className="flex h-11 w-[13.5rem] shrink-0 items-center rounded-lg border border-[color-mix(in_srgb,var(--border)_72%,var(--brand-bordeaux)_28%)] bg-white px-2.5 shadow-[0_4px_12px_-10px_rgba(47,48,53,0.35)] transition-colors hover:border-[color-mix(in_srgb,var(--brand-bordeaux)_40%,var(--border))] hover:bg-[var(--brand-rose-soft)] sm:w-[15rem]"
        >
          <Link
            href={`${hrefBase}/${event.slug}`}
            tabIndex={forScreenReader ? undefined : -1}
            title={forScreenReader ? `${when} · ${event.title}` : undefined}
            className="brand-focus-ring flex min-w-0 flex-1 flex-col justify-center rounded-md"
          >
            <p className="truncate text-[10px] font-semibold tracking-wide text-[var(--brand-gold-ink)] uppercase">
              {when}
              {city ? ` · ${city}` : ""}
            </p>
            <p className="brand-event-title truncate text-[13px] leading-tight font-semibold">
              {event.title}
            </p>
          </Link>
        </article>
      );
    });
  }

  return (
    <section
      className={`min-w-0 ${
        isOnDark
          ? "rounded-xl border border-white/15 bg-[var(--brand-cream)]/95 px-3 py-2 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.55)] backdrop-blur-sm"
          : "mb-5 rounded-xl border border-[color-mix(in_srgb,var(--border)_70%,var(--brand-bordeaux)_30%)] bg-[var(--brand-cream)] px-3 py-2"
      }`}
      aria-labelledby={headingId}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="font-heading-section text-xs text-[var(--brand-bordeaux)]"
          >
            Binnenkort te beleven
          </h2>
          <span className="brand-accent-rule mt-1" aria-hidden />
        </div>
        <Link
          href={seeAllHref}
          className="brand-focus-ring shrink-0 text-xs font-semibold text-[var(--brand-bordeaux)] transition-colors hover:text-[var(--brand-gold-ink)]"
        >
          Bekijk alles →
        </Link>
      </div>

      <div
        className="upcoming-ticker-viewport min-w-0 overflow-hidden"
        role="list"
        aria-label="Binnenkort te beleven: automatisch scrollende activiteiten"
      >
        <div
          ref={trackRef}
          className="upcoming-ticker-track flex w-max gap-1.5"
        >
          {renderCards("a", false)}
          {renderCards("b", true)}
        </div>
      </div>
    </section>
  );
}
