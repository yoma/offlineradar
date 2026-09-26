"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SEARCH_PENDING_KEY = "or-search-pending";

const SUBTITLES = [
  "We checken je regio en afstand…",
  "We kijken welke leeftijden bij je filters passen…",
  "We filteren op je gekozen activiteiten…",
  "We controleren welke events binnenkort plaatsvinden…",
  "Bijna klaar — we zetten de beste matches vooraan.",
] as const;

const TITLE = "We zoeken passende singlesevents voor jou…";

/** Mark an outgoing home→ontdek search so the results page can show pending UX. */
export function markSearchPending(): void {
  try {
    sessionStorage.setItem(SEARCH_PENDING_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function consumeSearchPending(): boolean {
  try {
    const raw = sessionStorage.getItem(SEARCH_PENDING_KEY);
    sessionStorage.removeItem(SEARCH_PENDING_KEY);
    if (!raw) return false;
    const started = Number(raw);
    if (!Number.isFinite(started)) return true;
    // Ignore stale flags older than 60s.
    return Date.now() - started < 60_000;
  } catch {
    return false;
  }
}

/**
 * Results-zone search loading card.
 * - Fixed title + rotating subtitles (900–1200ms)
 * - Delayed mount (~250ms) to avoid flicker on fast navigations
 * - Respects prefers-reduced-motion
 */
export function SearchLoadingState({
  active,
  className,
  immediate = false,
}: {
  active: boolean;
  className?: string;
  /** Skip the anti-flicker delay (e.g. route loading.tsx). */
  immediate?: boolean;
}) {
  const [visible, setVisible] = useState(immediate && active);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      setSubtitleIndex(0);
      return;
    }
    if (immediate) {
      setVisible(true);
      return;
    }
    const showTimer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(showTimer);
  }, [active, immediate]);

  useEffect(() => {
    if (!active || !visible || reduceMotion) return;
    const timer = window.setInterval(() => {
      setSubtitleIndex((i) => (i + 1) % SUBTITLES.length);
    }, 1050);
    return () => window.clearInterval(timer);
  }, [active, visible, reduceMotion]);

  if (!active || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "rounded-2xl border border-border bg-secondary/40 px-5 py-8 text-center",
        className,
      )}
    >
      <div className="mx-auto mb-5 flex size-12 items-center justify-center">
        <span
          className={cn(
            "block size-10 rounded-full border-2 border-foreground/15 border-t-foreground/70",
            !reduceMotion && "animate-spin",
          )}
          aria-hidden
        />
      </div>
      <p className="text-[15px] font-semibold tracking-tight">{TITLE}</p>
      <p
        key={reduceMotion ? "static" : subtitleIndex}
        className={cn(
          "mt-2 text-sm text-muted-foreground",
          !reduceMotion && "animate-in fade-in duration-300",
        )}
      >
        {reduceMotion ? SUBTITLES[0] : SUBTITLES[subtitleIndex]}
      </p>
    </div>
  );
}

export { TITLE as SEARCH_LOADING_TITLE, SUBTITLES as SEARCH_LOADING_SUBTITLES };
