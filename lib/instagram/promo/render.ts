/**
 * Remotion render of one promo reel: MP4, cover JPEG (the hook) and the story
 * still. Same output contract as reel/render.ts, so the queue renderer can
 * upload it the same way. Node only.
 *
 * Stock footage needs more bits than the flat event reels: first a constant
 * quality pass, and when that passes the upload limit a pass at the bitrate
 * that fits (two passes would be better but cost twice the time).
 */

import { stat } from "node:fs/promises";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { REEL_MAX_UPLOAD_BYTES } from "@/lib/instagram/reel/limits";
import type { RenderedReel } from "@/lib/instagram/reel/render";
import { promoDurationInFrames, type PromoReelProps } from "@/lib/instagram/promo/types";
import { REEL_FPS } from "@/lib/instagram/reel/types";

export const PROMO_COMPOSITION_ID = "DateOfflineHubPromo";
export const PROMO_STORY_COMPOSITION_ID = "DateOfflineHubPromoStory";

const FIRST_CRF = 20;
const AUDIO_KBPS = 128;
/** Leave room for the MP4 container and bitrate overshoot. */
const SIZE_SAFETY = 0.88;

/** Video bitrate (kbps) that keeps the file under `maxBytes`. */
export function bitrateForLimit(seconds: number, maxBytes: number): number {
  const totalKbps = (maxBytes * 8 * SIZE_SAFETY) / 1000 / seconds;
  return Math.max(800, Math.floor(totalKbps - AUDIO_KBPS));
}

/** Same frame as PromoReel's promoCoverFrame (kept here so Node does not import the template). */
function coverFrame(props: PromoReelProps): number {
  return Math.max(0, (props.timing.clipFrames[0] ?? 60) - 30);
}

export async function renderPromoReel(args: {
  serveUrl: string;
  props: PromoReelProps;
  /** Output path without extension; writes <base>.mp4, <base>-cover.jpg and <base>-story.jpg. */
  outBase: string;
  browserExecutable?: string | null;
  maxBytes?: number;
}): Promise<RenderedReel> {
  const { serveUrl, props, outBase } = args;
  const browserExecutable = args.browserExecutable ?? null;
  const maxBytes = args.maxBytes ?? REEL_MAX_UPLOAD_BYTES;
  const composition = await selectComposition({
    serveUrl,
    id: PROMO_COMPOSITION_ID,
    inputProps: props,
    browserExecutable,
  });
  const videoPath = `${outBase}.mp4`;
  const coverPath = `${outBase}-cover.jpg`;
  const storyPath = `${outBase}-story.jpg`;
  const seconds = promoDurationInFrames(props.timing) / REEL_FPS;

  const common = {
    serveUrl,
    composition,
    inputProps: props,
    codec: "h264" as const,
    audioCodec: "aac" as const,
    audioBitrate: `${AUDIO_KBPS}k` as const,
    pixelFormat: "yuv420p" as const,
    colorSpace: "bt709" as const,
    x264Preset: "slow" as const,
    enforceAudioTrack: true,
    outputLocation: videoPath,
    browserExecutable,
    overwrite: true,
    // Remote stock files: give the downloads time.
    timeoutInMilliseconds: 120_000,
  };

  await renderMedia({ ...common, crf: FIRST_CRF });
  let bytes = (await stat(videoPath)).size;
  let kbps = bitrateForLimit(seconds, maxBytes);
  for (let attempt = 0; bytes > maxBytes && attempt < 3; attempt++) {
    await renderMedia({ ...common, videoBitrate: `${kbps}k` as const });
    bytes = (await stat(videoPath)).size;
    kbps = Math.floor(kbps * 0.85);
  }
  if (bytes > maxBytes) {
    throw new Error(`MP4 blijft te groot (${(bytes / 1e6).toFixed(1)} MB).`);
  }

  const frame = coverFrame(props);
  await renderStill({
    serveUrl,
    composition,
    inputProps: props,
    frame,
    output: coverPath,
    imageFormat: "jpeg",
    jpegQuality: 90,
    browserExecutable,
    overwrite: true,
  });

  const story = await selectComposition({
    serveUrl,
    id: PROMO_STORY_COMPOSITION_ID,
    inputProps: props,
    browserExecutable,
  });
  await renderStill({
    serveUrl,
    composition: story,
    inputProps: props,
    frame: Math.min(frame, story.durationInFrames - 1),
    output: storyPath,
    imageFormat: "jpeg",
    jpegQuality: 90,
    browserExecutable,
    overwrite: true,
  });

  return { videoPath, coverPath, storyPath, seconds, bytes };
}
