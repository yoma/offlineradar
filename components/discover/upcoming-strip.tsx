"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { Event } from "@/types/event";
import { upcomingStickerLabel } from "@/lib/upcoming";

const PX_PER_SECOND = 36;
/** Enough stickers so the loop rarely shows empty space on wide screens. */
const MIN_LOOP_ITEMS = 10;

export function UpcomingStrip({
  events,
  hrefBase = "/event",
  today,
  variant = "default",
  headingId = "binnenkort-heading",
}: {
  events: Event[];
  hrefBase?: string;
  today: string;
  /** `onDark` = over hero image; `hero` = soft light band; `default` = Ontdek. */
  variant?: "default" | "hero" | "onDark";
  headingId?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isHero = variant === "hero";
  const isOnDark = variant === "onDark";
  const calmSpeed = isHero || isOnDark;

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
      // Homepage a touch slower for a calmer first impression.
      const speed = calmSpeed ? 28 : PX_PER_SECOND;
      const seconds = Math.max(16, halfWidth / speed);
      track.style.setProperty("--upcoming-marquee-duration", `${seconds}s`);
    }

    syncDuration();
    const observer = new ResizeObserver(syncDuration);
    observer.observe(track);
    return () => observer.disconnect();
  }, [loopEvents, calmSpeed]);

  if (events.length === 0) return null;

  const linkClass = isOnDark
    ? "inline-flex max-w-[min(70vw,18rem)] items-center truncate rounded-full border border-white/25 bg-white/12 px-3 py-1.5 text-xs text-white/90 backdrop-blur-sm transition-colors hover:border-white/45 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    : isHero
      ? "inline-flex max-w-[min(70vw,18rem)] items-center truncate rounded-full border border-border/70 bg-white/80 px-3 py-1.5 text-xs text-foreground/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-colors hover:border-foreground/25 hover:bg-white hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      : "inline-flex max-w-[min(70vw,18rem)] items-center truncate rounded-full border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs text-foreground/90 transition-colors hover:border-foreground/40 hover:bg-secondary/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

  function renderStickers(prefix: string, duplicateHalf: boolean) {
    return loopEvents.map((event, index) => {
      const label = upcomingStickerLabel(event, today);
      const forScreenReader = !duplicateHalf && index < events.length;
      return (
        <div
          key={`${prefix}-${event.id}-${index}`}
          role={forScreenReader ? "listitem" : undefined}
          className="shrink-0"
          aria-hidden={forScreenReader ? undefined : true}
        >
          <Link
            href={`${hrefBase}/${event.slug}`}
            tabIndex={forScreenReader ? undefined : -1}
            className={linkClass}
            title={forScreenReader ? label : undefined}
          >
            <span className="truncate">{label}</span>
          </Link>
        </div>
      );
    });
  }

  return (
    <section
      className={`flex min-w-0 items-center gap-2.5 sm:gap-3 ${
        isHero || isOnDark ? "" : "mb-5"
      }`}
      aria-labelledby={headingId}
    >
      <div
        className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-tight ${
          isOnDark
            ? "text-white/70"
            : isHero
              ? "text-muted-foreground"
              : "text-foreground"
        }`}
      >
        <CalendarDays
          className={`size-3.5 ${
            isOnDark
              ? "text-white/55"
              : isHero
                ? "text-muted-foreground/80"
                : "text-muted-foreground"
          }`}
          aria-hidden="true"
        />
        <h2 id={headingId} className="text-xs font-semibold">
          Binnenkort
        </h2>
      </div>

      <div
        className="upcoming-marquee-viewport min-w-0 flex-1 overflow-hidden"
        role="list"
        aria-label="Binnenkort: automatisch scrollende evenementen"
      >
        <div ref={trackRef} className="upcoming-marquee-track flex w-max gap-2">
          {renderStickers("a", false)}
          {renderStickers("b", true)}
        </div>
      </div>
    </section>
  );
}
