/**
 * Promo reels: weekly reels that bring people to the site (not about events).
 * Real stock footage (Pexels / Pixabay) with a hook and a call to action.
 *
 * Plain JSON only: the props go to the Remotion render in a headless browser.
 */

// Relative imports: this file is also bundled by Remotion (no "@/" alias).
import type { PromoTemplateId } from "../../../config/promo-reels";
import type { ReelMusic } from "../reel/types";

export type { PromoTemplateId };

/** What Claude writes for one reel. */
export type PromoScript = {
  themeId: string;
  /** Opening line, readable in one second. */
  hook: string;
  /** One short line per extra clip (shown by the templates that use them). */
  lines: string[];
  /** One English stock search query per clip, in order. */
  searchQueries: string[];
  /** Instagram caption, hashtags included. */
  caption: string;
};

export type StockSource = "pexels" | "pixabay";

/** One clip (or a still for the Ken Burns fallback) as used in a reel. */
export type PromoClip = {
  source: StockSource;
  /** Id at the source; with `source` the key that avoids reuse. */
  id: string;
  kind: "video" | "photo";
  /** Direct file URL the renderer loads. */
  url: string;
  width: number;
  height: number;
  /** Video length in seconds (0 for a photo). */
  duration: number;
  /** Page at the source, for the licence record. */
  pageUrl: string;
  author: string;
  query: string;
};

export type PromoTiming = {
  /** Frames per clip; the last one carries the CTA. */
  clipFrames: number[];
  /** Cross-fade overlap between clips. */
  overlapFrames: number;
  /** Frames at the end for the call to action (inside the last clip). */
  ctaFrames: number;
};

export type PromoReelProps = {
  template: PromoTemplateId;
  hook: string;
  lines: string[];
  clips: PromoClip[];
  timing: PromoTiming;
  cta: { lead: string; website: string };
  music: ReelMusic;
};

export function promoDurationInFrames(timing: PromoTiming): number {
  const total = timing.clipFrames.reduce((a, b) => a + b, 0);
  return total - timing.overlapFrames * Math.max(0, timing.clipFrames.length - 1);
}

export function clipKey(clip: Pick<PromoClip, "source" | "id">): string {
  return `${clip.source}:${clip.id}`;
}
