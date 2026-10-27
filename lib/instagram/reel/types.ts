/**
 * Props for the Remotion reel (remotion/Reel.tsx). Plain JSON only: the
 * render runs in a headless browser, so every text is prepared up front by
 * lib/instagram/reel/props.ts from the same draft as the feed post.
 */

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;

/** How the events are shown, mirroring the feed post's slides. */
export type ReelLayout =
  /** One event, one large card (single-event post). */
  | "single"
  /** One card per event (Binnenkort / Nieuw carousels). */
  | "cards"
  /** One agenda page with all events (Deze week overview). */
  | "listing";

export type ReelEvent = {
  id: string;
  /** "Speeddate", "Wandelen", ... or null when unknown. */
  activity: string | null;
  title: string;
  /** "31" */
  day: string;
  /** "zaterdag" */
  weekday: string;
  /** "za" */
  weekdayShort: string;
  /** "oktober" */
  month: string;
  /** "okt" */
  monthShort: string;
  /** "19:30" or "uur volgt" */
  time: string;
  city: string;
  /** "Gent  ·  19:30  ·  30–45 jaar" for listing rows. */
  meta: string;
  /** Organiser's own short description (single layout only). */
  blurb: string | null;
  facts: { label: string; value: string }[];
};

export type ReelTiming = {
  hookFrames: number;
  /** Frames per event card ("single"/"cards") or for the whole listing. */
  bodyFrames: number;
  ctaFrames: number;
  /** Cross-fade overlap between scenes. */
  overlapFrames: number;
};

export type ReelMusic = {
  /** Path relative to remotion/public, e.g. "music/rustig-01.mp3". */
  src: string;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  /** 0..1 */
  volume: number;
} | null;

/**
 * Stock clip or photo behind the hook or the call to action (Pixabay, or
 * Pexels when its key is set), under a bordeaux wash. Same shape as a promo
 * clip; chosen in GitHub Actions by lib/instagram/reel/backdrop.ts.
 */
export type ReelBackdrop = {
  source: "pexels" | "pixabay";
  id: string;
  kind: "video" | "photo";
  url: string;
  width: number;
  height: number;
  /** Video length in seconds (0 for a photo). */
  duration: number;
  pageUrl: string;
  author: string;
  query: string;
  /** Copy in the render bundle's public folder (set just before the render). */
  localFile?: string;
};

export type ReelProps = {
  layout: ReelLayout;
  /** Hook shown in the first second: optional big count + short lines. */
  hook: { count: string | null; lines: string[] };
  /** The hook as one sentence, e.g. "3 singles-events in Antwerpen dit weekend". */
  hookText: string;
  /** Small kicker above the hook ("Deze week", "Nieuw op de agenda"). */
  hookKicker: string;
  /** Right-hand masthead label on the event scenes ("Deze week", "Agenda"). */
  sectionLabel: string;
  events: ReelEvent[];
  timing: ReelTiming;
  music: ReelMusic;
  website: string;
  slogan: string;
  /** Atmosphere footage; absent or null = the plain colour scenes. */
  backdrops?: { hook: ReelBackdrop | null; cta: ReelBackdrop | null } | null;
};

export function reelDurationInFrames(timing: ReelTiming, layout: ReelLayout, eventCount: number): number {
  const bodyScenes = layout === "cards" ? Math.max(1, eventCount) : 1;
  const scenes = 2 + bodyScenes;
  return (
    timing.hookFrames +
    timing.bodyFrames * bodyScenes +
    timing.ctaFrames -
    timing.overlapFrames * (scenes - 1)
  );
}
