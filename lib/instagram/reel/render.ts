/**
 * Remotion render of one reel: MP4 (H.264 + AAC, yuv420p, bt709) plus a
 * cover JPEG of the hook. Node only (scripts and GitHub Actions); the Next
 * app never imports this.
 */

import { stat } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { REEL_MAX_UPLOAD_BYTES } from "@/lib/instagram/reel/limits";
import { REMOTION_PUBLIC_DIR } from "@/lib/instagram/reel/music";
import type { ReelProps } from "@/lib/instagram/reel/types";

export const REEL_COMPOSITION_ID = "DateOfflineHubReel";

/** Constant quality first; stricter when a file would pass the upload limit. */
const CRF_STEPS = [18, 23, 28];

export async function bundleReelTemplate(): Promise<string> {
  return bundle({
    entryPoint: path.resolve("remotion/index.ts"),
    publicDir: REMOTION_PUBLIC_DIR,
  });
}

export type RenderedReel = {
  videoPath: string;
  coverPath: string;
  seconds: number;
  bytes: number;
};

export async function renderReel(args: {
  serveUrl: string;
  props: ReelProps;
  /** Output path without extension; writes <base>.mp4 and <base>-cover.jpg. */
  outBase: string;
  browserExecutable?: string | null;
}): Promise<RenderedReel> {
  const { serveUrl, props, outBase } = args;
  const browserExecutable = args.browserExecutable ?? null;
  const composition = await selectComposition({
    serveUrl,
    id: REEL_COMPOSITION_ID,
    inputProps: props,
    browserExecutable,
  });
  const videoPath = `${outBase}.mp4`;
  const coverPath = `${outBase}-cover.jpg`;

  let bytes = Infinity;
  for (const crf of CRF_STEPS) {
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      codec: "h264",
      audioCodec: "aac",
      audioBitrate: "192k",
      crf,
      pixelFormat: "yuv420p",
      colorSpace: "bt709",
      enforceAudioTrack: true,
      outputLocation: videoPath,
      browserExecutable,
      overwrite: true,
    });
    bytes = (await stat(videoPath)).size;
    if (bytes <= REEL_MAX_UPLOAD_BYTES) break;
  }
  if (bytes > REEL_MAX_UPLOAD_BYTES) {
    throw new Error(`MP4 blijft te groot (${(bytes / 1e6).toFixed(1)} MB).`);
  }

  // Cover: the hook, fully on screen.
  await renderStill({
    serveUrl,
    composition,
    inputProps: props,
    frame: Math.max(0, props.timing.hookFrames - 25),
    output: coverPath,
    imageFormat: "jpeg",
    jpegQuality: 90,
    browserExecutable,
    overwrite: true,
  });

  return {
    videoPath,
    coverPath,
    seconds: composition.durationInFrames / composition.fps,
    bytes,
  };
}
