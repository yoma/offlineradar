/**
 * Reel settings, read from env so nothing is hardcoded.
 *
 *   INSTAGRAM_REEL_ENABLED            "0" = emergency stop: never publish reels (default on;
 *                                     per post the admin chooses "Plaatsen als reel")
 *   INSTAGRAM_REEL_FALLBACK_TO_POST   "0" = no feed post when the reel fails (default on)
 *   INSTAGRAM_REEL_COLLABORATORS      "0" = don't invite the organisers as collaborators (default on)
 *   INSTAGRAM_REEL_MIN_SECONDS        default 8
 *   INSTAGRAM_REEL_MAX_SECONDS        default 24
 *   INSTAGRAM_REEL_MUSIC_DIR          folder inside remotion/public, default "music"
 *   INSTAGRAM_REEL_MUSIC_VOLUME       0..1, default 0.6
 *   INSTAGRAM_REEL_MUSIC_FADE_IN      seconds, default 0.6
 *   INSTAGRAM_REEL_MUSIC_FADE_OUT     seconds, default 1.2
 */

export type InstagramReelConfig = {
  enabled: boolean;
  fallbackToPost: boolean;
  collaborators: boolean;
  minSeconds: number;
  maxSeconds: number;
  musicDir: string;
  musicVolume: number;
  musicFadeInSeconds: number;
  musicFadeOutSeconds: number;
};

/** Meta Reels accept 3 s to 15 min; we keep to a short 8 to 24 s window. */
const HARD_MIN_SECONDS = 3;
const HARD_MAX_SECONDS = 90;

function num(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = raw == null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function readInstagramReelConfig(
  env: Record<string, string | undefined> = process.env,
): InstagramReelConfig {
  const minSeconds = num(env.INSTAGRAM_REEL_MIN_SECONDS, 8, HARD_MIN_SECONDS, HARD_MAX_SECONDS);
  const maxSeconds = num(env.INSTAGRAM_REEL_MAX_SECONDS, 24, minSeconds, HARD_MAX_SECONDS);
  return {
    enabled: env.INSTAGRAM_REEL_ENABLED?.trim() !== "0",
    fallbackToPost: env.INSTAGRAM_REEL_FALLBACK_TO_POST?.trim() !== "0",
    collaborators: env.INSTAGRAM_REEL_COLLABORATORS?.trim() !== "0",
    minSeconds,
    maxSeconds,
    musicDir: (env.INSTAGRAM_REEL_MUSIC_DIR?.trim() || "music").replace(/^\/+|\/+$/g, ""),
    musicVolume: num(env.INSTAGRAM_REEL_MUSIC_VOLUME, 0.6, 0, 1),
    musicFadeInSeconds: num(env.INSTAGRAM_REEL_MUSIC_FADE_IN, 0.6, 0, 5),
    musicFadeOutSeconds: num(env.INSTAGRAM_REEL_MUSIC_FADE_OUT, 1.2, 0, 5),
  };
}
