/**
 * Pure helpers for publishing a post as a reel (offline-testable).
 */

import { INSTAGRAM_HANDLE } from "@/lib/instagram/constants";

/** Instagram allows up to 3 collaborators on a reel. */
export const REEL_MAX_COLLABORATORS = 3;

/** Paths on instagram.com that are not a profile. */
const NOT_A_PROFILE = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
  "legal",
]);

/** "https://www.instagram.com/singles.gent/?hl=nl" → "singles.gent". */
export function instagramUsernameFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
  const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  if (!first || NOT_A_PROFILE.has(first)) return null;
  return /^[a-z0-9._]{1,30}$/.test(first) ? first : null;
}

/** Organisers' Instagram accounts, without our own, at most 3. */
export function reelCollaborators(
  instagramUrls: (string | null | undefined)[],
  ownHandle = INSTAGRAM_HANDLE,
): string[] {
  const own = ownHandle.replace(/^@/, "").toLowerCase();
  const out: string[] = [];
  for (const raw of instagramUrls) {
    const name = instagramUsernameFromUrl(raw);
    if (!name || name === own || out.includes(name)) continue;
    out.push(name);
    if (out.length === REEL_MAX_COLLABORATORS) break;
  }
  return out;
}

/** Time kept after the reel phase for a fallback post (45 s) and its story. */
export const REEL_RESERVE_AFTER_MS = 100_000;
/** Below this the reel phase is not started (straight to the post). */
export const REEL_MIN_PHASE_MS = 30_000;

/** End of the reel phase (create + Meta processing), or null when too short. */
export function reelPhaseDeadline(nowMs: number, postDeadlineMs: number): number | null {
  const end = postDeadlineMs - REEL_RESERVE_AFTER_MS;
  return end - nowMs >= REEL_MIN_PHASE_MS ? end : null;
}
