/**
 * Reel palette and motion, taken from the feed templates
 * (lib/instagram/templates/shared.tsx): solid colour fields, hairline rules,
 * one accent per scene, calm movement only.
 */

import { Easing, interpolate } from "remotion";
import { brandColors } from "../lib/brand/tokens";

export const MARGIN = 84;
/** Instagram's own UI covers the top ~220px and bottom ~340px of a reel. */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 360;

export const HEADING = "Bricolage Grotesque";
export const BODY = "DM Sans";

export type Tone = "bordeaux" | "cream";

export function palette(tone: Tone) {
  if (tone === "bordeaux") {
    return {
      bg: brandColors.bordeaux,
      ink: brandColors.cream,
      inkSoft: "rgba(249,242,234,0.74)",
      inkFaint: "rgba(249,242,234,0.5)",
      accent: brandColors.gold,
      rule: "rgba(249,242,234,0.2)",
      ruleStrong: "rgba(249,242,234,0.55)",
    };
  }
  return {
    bg: brandColors.cream,
    ink: brandColors.anthracite,
    inkSoft: "rgba(47,48,53,0.74)",
    inkFaint: "rgba(47,48,53,0.52)",
    accent: brandColors.bordeaux,
    rule: "rgba(47,48,53,0.16)",
    ruleStrong: "rgba(47,48,53,0.7)",
  };
}

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/** 0 → 1 over `duration` frames, starting at `delay`. */
export function progress(frame: number, delay: number, duration = 16): number {
  return interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
}

/** Soft rise: fade in while moving up a little. */
export function rise(frame: number, delay: number, distance = 26, duration = 16) {
  const p = progress(frame, delay, duration);
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` };
}
