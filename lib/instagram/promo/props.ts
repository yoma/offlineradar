/**
 * Timing, caption and render props for a promo reel.
 */

import { PROMO_REELS_CONFIG, type PromoTemplateId } from "@/config/promo-reels";
import { noEmDash } from "@/lib/instagram/captions";
import { REEL_FPS, type ReelMusic } from "@/lib/instagram/reel/types";
import {
  promoDurationInFrames,
  type PromoClip,
  type PromoReelProps,
  type PromoScript,
  type PromoTiming,
} from "@/lib/instagram/promo/types";

const HOOK_SECONDS = 4.5;
const LINE_SECONDS = 3.8;
const CTA_SECONDS = 2.8;
const OVERLAP_SECONDS = 0.6;

/** Frames per clip for `clipCount` clips, kept within the configured length. */
export function promoTiming(clipCount: number): PromoTiming {
  const s = (sec: number) => Math.round(sec * REEL_FPS);
  let clipFrames = Array.from({ length: clipCount }, (_, i) => s(i === 0 ? HOOK_SECONDS : LINE_SECONDS));
  clipFrames[clipCount - 1]! += s(CTA_SECONDS);
  const overlapFrames = s(OVERLAP_SECONDS);
  const total = promoDurationInFrames({ clipFrames, overlapFrames, ctaFrames: 0 });
  const min = PROMO_REELS_CONFIG.minSeconds * REEL_FPS;
  const max = PROMO_REELS_CONFIG.maxSeconds * REEL_FPS;
  if (total < min) clipFrames[clipCount - 1]! += min - total;
  if (total > max) clipFrames = clipFrames.map((f) => Math.floor((f * max) / total));
  return { clipFrames, overlapFrames, ctaFrames: s(CTA_SECONDS) };
}

/** Seconds of footage each clip needs (with a little slack). */
export function sceneSeconds(timing: PromoTiming): number[] {
  return timing.clipFrames.map((f) => Math.ceil(f / REEL_FPS + 0.5));
}

export function randomClipCount(random: () => number = Math.random): number {
  const { minClips, maxClips } = PROMO_REELS_CONFIG;
  return minClips + Math.floor(random() * (maxClips - minClips + 1));
}

/** Next template after the last one used (rotation). */
export function nextTemplate(lastUsed: string | null): PromoTemplateId {
  const list = PROMO_REELS_CONFIG.templates;
  const i = lastUsed ? list.indexOf(lastUsed as PromoTemplateId) : -1;
  return list[(i + 1) % list.length]!;
}

/** Caption from the script, with the fixed hashtags and a credit for the footage. */
export function promoCaption(script: PromoScript, clips: PromoClip[]): string {
  let caption = noEmDash(script.caption.trim());
  const missing = PROMO_REELS_CONFIG.fixedHashtags.filter(
    (tag) => !caption.toLowerCase().includes(tag.toLowerCase()),
  );
  if (missing.length > 0) caption += `\n${missing.join(" ")}`;
  const sources = [...new Set(clips.map((c) => (c.source === "pexels" ? "Pexels" : "Pixabay")))];
  caption += `\n\nBeelden: ${sources.join(" en ")}`;
  return caption.slice(0, 2200);
}

export function buildPromoProps(args: {
  template: PromoTemplateId;
  script: PromoScript;
  clips: PromoClip[];
  timing: PromoTiming;
  music: ReelMusic;
}): PromoReelProps {
  return {
    template: args.template,
    hook: args.script.hook,
    lines: args.script.lines,
    clips: args.clips,
    timing: args.timing,
    cta: { ...PROMO_REELS_CONFIG.cta },
    music: args.music,
  };
}
