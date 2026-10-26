/**
 * Render test reels locally (nothing is uploaded or published).
 *
 * Uses the same event selection and caption as the feed posts
 * (buildInstagramDraft / buildSingleEventDraft), turns the draft into reel
 * props and renders MP4 + cover JPEG + caption with Remotion.
 *
 * Usage:
 *   npm run reel:test                       # all formats, mock or Neon catalog
 *   npm run reel:test -- --format=deze_week # one of deze_week|binnenkort|nieuw|single
 *   npm run reel:test -- --out=out/reels
 *
 * Optional env: REMOTION_BROWSER_EXECUTABLE (use a local Chrome headless shell).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { listEvents } from "@/lib/events";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import {
  buildInstagramDraft,
  buildSingleEventDraft,
  listSingleEventCandidates,
  type InstagramDraft,
} from "@/lib/instagram/drafts";
import { readInstagramReelConfig } from "@/lib/instagram/reel/config";
import { pickReelMusic, REMOTION_PUBLIC_DIR } from "@/lib/instagram/reel/music";
import { buildReelProps, noEmDash } from "@/lib/instagram/reel/props";
import type { ReelProps } from "@/lib/instagram/reel/types";

type TestFormat = InstagramFormatId | "single";
const ALL: TestFormat[] = ["deze_week", "binnenkort", "nieuw", "single"];
const COMPOSITION_ID = "DateOfflineHubReel";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function log(message: string) {
  console.info(`[reel:test] ${message}`);
}

async function main() {
  const formats = (arg("format")?.split(",") as TestFormat[] | undefined) ?? ALL;
  const outDir = path.resolve(arg("out") ?? "out/reels");
  await mkdir(outDir, { recursive: true });

  const config = readInstagramReelConfig();
  const now = new Date();
  const catalog = await listEvents();
  log(`${catalog.length} events in de catalogus`);

  log("Remotion-bundel maken...");
  const serveUrl = await bundle({
    entryPoint: path.resolve("remotion/index.ts"),
    publicDir: REMOTION_PUBLIC_DIR,
  });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

  let lastTrack: string | null = null;
  for (const format of formats) {
    let draft: InstagramDraft | null;
    if (format === "single") {
      const first = listSingleEventCandidates(catalog, now)[0];
      draft = first ? buildSingleEventDraft(first) : null;
    } else {
      draft = buildInstagramDraft(format, catalog, { now });
    }
    if (!draft) {
      log(`${format}: te weinig geschikte events, overgeslagen`);
      continue;
    }

    const music = await pickReelMusic(config, lastTrack);
    lastTrack = music?.src ?? lastTrack;
    const props: ReelProps = buildReelProps({
      format: draft.format,
      events: draft.events,
      publishAt: now,
      config,
      music,
    });
    const caption = noEmDash(draft.caption);

    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps: props,
      browserExecutable,
    });
    const seconds = (composition.durationInFrames / composition.fps).toFixed(1);
    log(`${format}: "${props.hookText}", ${props.events.length} events, ${seconds} s, muziek ${music?.src ?? "geen"}`);

    const base = path.join(outDir, `reel-${format}`);
    const started = Date.now();
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      codec: "h264",
      audioCodec: "aac",
      audioBitrate: "192k",
      crf: 18,
      pixelFormat: "yuv420p",
      colorSpace: "bt709",
      enforceAudioTrack: true,
      outputLocation: `${base}.mp4`,
      browserExecutable,
      overwrite: true,
    });
    // Cover: the hook, fully on screen.
    await renderStill({
      serveUrl,
      composition,
      inputProps: props,
      frame: Math.max(0, props.timing.hookFrames - 25),
      output: `${base}-cover.jpg`,
      imageFormat: "jpeg",
      jpegQuality: 90,
      browserExecutable,
      overwrite: true,
    });
    await writeFile(`${base}-caption.txt`, `${caption}\n`);
    await writeFile(`${base}-props.json`, `${JSON.stringify(props, null, 2)}\n`);
    log(`${format}: klaar in ${((Date.now() - started) / 1000).toFixed(0)} s → ${base}.mp4`);
  }
}

main().catch((error) => {
  console.error("[reel:test] mislukt:", error instanceof Error ? error.message : error);
  process.exit(1);
});
