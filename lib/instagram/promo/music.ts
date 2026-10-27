/**
 * Music for promo reels: the promo folder from config/promo-reels.ts,
 * rotating; the normal reel music while that folder is empty.
 */

import { PROMO_REELS_CONFIG } from "@/config/promo-reels";
import { readInstagramReelConfig } from "@/lib/instagram/reel/config";
import { listReelTracks, pickReelMusic } from "@/lib/instagram/reel/music";
import type { ReelMusic } from "@/lib/instagram/reel/types";

/** Folder (inside remotion/public) the promo music comes from right now. */
export async function promoMusicDir(): Promise<string> {
  const tracks = await listReelTracks(PROMO_REELS_CONFIG.musicDir);
  return tracks.length > 0 ? PROMO_REELS_CONFIG.musicDir : readInstagramReelConfig().musicDir;
}

export async function pickPromoMusic(lastUsed: string | null): Promise<ReelMusic> {
  return pickReelMusic({ ...readInstagramReelConfig(), musicDir: await promoMusicDir() }, lastUsed);
}
