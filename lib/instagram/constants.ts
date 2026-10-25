/**
 * Instagram Autopilot Phase 3A — shared constants.
 * Visual + copy constants. Meta publish is gated in lib/instagram/publish.ts.
 */

import { brandColors, instagramFormats } from "@/lib/brand/tokens";

export const INSTAGRAM_HANDLE = "@dateofflinehub";
export const INSTAGRAM_WEBSITE = "dateofflinehub.be";
export const INSTAGRAM_SLOGAN = "Minder swipen, terug echte connecties";
export const INSTAGRAM_SITE_URL = "https://dateofflinehub.be";
/** Link-in-bio page with the events from recent posts. */
export const INSTAGRAM_LINK_PAGE_PATH = "/instagram";
export const INSTAGRAM_LINK_PAGE_LABEL = `${INSTAGRAM_WEBSITE}${INSTAGRAM_LINK_PAGE_PATH}`;

export const IG_FEED = instagramFormats.feedPortrait;

export const igColors = {
  ...brandColors,
  creamDeep: "#F3EBE3",
  bordeauxSoft: "#7A3548",
  lineGold: "rgba(212, 175, 55, 0.55)",
} as const;

/** Objective selection windows (days from today, inclusive). */
export const IG_WINDOW_NEAR = 7;
export const IG_WINDOW_MID = 14;
export const IG_THIS_WEEK_MIN = 3;
export const IG_THIS_WEEK_MAX = 7;

export const IG_CAROUSEL_MIN = 4;
export const IG_CAROUSEL_MAX = 6;
export const IG_THIS_WEEK_MAX_EVENTS = 5;
export const IG_NIEUW_MAX_EVENTS = 4;

/** Soft caps so one format / organizer never fills a post alone. */
export const IG_MAX_SAME_ACTIVITY = 2;
export const IG_MAX_SAME_ORGANIZER = 2;
export const IG_MAX_BRUSSELS = 2;

export type InstagramFormatId = "binnenkort" | "deze_week" | "nieuw";

export type InstagramSlideKind = "cover" | "event" | "week_overview" | "nieuw_cover";

export type InstagramDraftStatus =
  | "concept"
  | "approved"
  | "needs_edit"
  | "skipped";
