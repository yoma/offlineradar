/**
 * Background music for reels. Tracks are royalty-free files in
 * remotion/public/<musicDir>; each reel takes the next track after the one
 * used last, so the music rotates on its own when tracks are added.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import type { InstagramReelConfig } from "@/lib/instagram/reel/config";
import type { ReelMusic } from "@/lib/instagram/reel/types";

export const REMOTION_PUBLIC_DIR = path.join(process.cwd(), "remotion", "public");

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav"]);

/** Track paths relative to remotion/public, sorted by name. */
export async function listReelTracks(musicDir: string): Promise<string[]> {
  try {
    const files = await readdir(path.join(REMOTION_PUBLIC_DIR, musicDir));
    return files
      .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
      .map((f) => `${musicDir}/${f}`);
  } catch {
    return [];
  }
}

/** The track after `lastUsed` (wraps around); first track when unknown. */
export function nextReelTrack(tracks: string[], lastUsed: string | null): string | null {
  if (tracks.length === 0) return null;
  const i = lastUsed ? tracks.indexOf(lastUsed) : -1;
  return tracks[(i + 1) % tracks.length]!;
}

export async function pickReelMusic(
  config: Pick<
    InstagramReelConfig,
    "musicDir" | "musicVolume" | "musicFadeInSeconds" | "musicFadeOutSeconds"
  >,
  lastUsed: string | null,
): Promise<ReelMusic> {
  const src = nextReelTrack(await listReelTracks(config.musicDir), lastUsed);
  if (!src) return null;
  return {
    src,
    volume: config.musicVolume,
    fadeInSeconds: config.musicFadeInSeconds,
    fadeOutSeconds: config.musicFadeOutSeconds,
  };
}
