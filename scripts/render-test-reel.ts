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
 *   npm run reel:test -- --plain            # without atmosphere footage
 *
 * Optional env: REMOTION_BROWSER_EXECUTABLE (use a local Chrome headless shell);
 * PIXABAY_API_KEY + ANTHROPIC_API_KEY for the footage behind hook and CTA.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listEvents } from "@/lib/events";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import {
  buildInstagramDraft,
  buildSingleEventDraft,
  listSingleEventCandidates,
  type InstagramDraft,
} from "@/lib/instagram/drafts";
import { pickReelBackdrops } from "@/lib/instagram/reel/backdrop";
import { readInstagramReelConfig } from "@/lib/instagram/reel/config";
import { pickReelMusic } from "@/lib/instagram/reel/music";
import { buildReelProps, noEmDash } from "@/lib/instagram/reel/props";
import { bundleReelTemplate, renderReel } from "@/lib/instagram/reel/render";
import type { ReelProps } from "@/lib/instagram/reel/types";

type TestFormat = InstagramFormatId | "single";
const ALL: TestFormat[] = ["deze_week", "binnenkort", "nieuw", "single"];

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
  const serveUrl = await bundleReelTemplate();
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
    const plainProps: ReelProps = buildReelProps({
      format: draft.format,
      events: draft.events,
      publishAt: now,
      config,
      music,
    });
    const props: ReelProps = process.argv.includes("--plain")
      ? plainProps
      : {
          ...plainProps,
          backdrops: await pickReelBackdrops({
            seed: `${format}-${now.toISOString()}`,
            props: plainProps,
            log: (m) => log(`${format}: ${m}`),
          }),
        };
    const caption = noEmDash(draft.caption);

    const base = path.join(outDir, `reel-${format}`);
    const started = Date.now();
    const reel = await renderReel({ serveUrl, props, outBase: base, browserExecutable });
    log(
      `${format}: "${props.hookText}", ${props.events.length} events, ${reel.seconds.toFixed(1)} s, ` +
        `${(reel.bytes / 1e6).toFixed(1)} MB, muziek ${music?.src ?? "geen"}`,
    );
    await writeFile(`${base}-caption.txt`, `${caption}\n`);
    await writeFile(`${base}-props.json`, `${JSON.stringify(props, null, 2)}\n`);
    log(`${format}: klaar in ${((Date.now() - started) / 1000).toFixed(0)} s → ${base}.mp4`);
  }
}

main().catch((error) => {
  console.error("[reel:test] mislukt:", error instanceof Error ? error.message : error);
  process.exit(1);
});
