/**
 * Render test promo reels locally. Nothing is published or put in the queue.
 *
 * Usage:
 *   npm run promo:test                          # one reel per template
 *   npm run promo:test -- --template=magazine   # terras | magazine | ondertitel
 *   npm run promo:test -- --theme=swipen-beu    # a theme id from config/promo-reels.ts
 *   npm run promo:test -- --count=2             # reels per template
 *   npm run promo:test -- --clips-dir=pad/naar/clips  # own mp4/jpg files, no APIs
 *
 * Needs ANTHROPIC_API_KEY and PIXABAY_API_KEY (PEXELS_API_KEY optional extra),
 * except with --clips-dir. Output in out/promo/: per reel an MP4, cover,
 * story still, caption and a JSON with the script and the clip sources
 * (licence record). out/promo/history.json keeps hooks and clips so the next
 * run does not repeat them.
 *
 * Optional env: REMOTION_BROWSER_EXECUTABLE (local Chrome headless shell).
 */

import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { PROMO_REELS_CONFIG, type PromoTemplateId } from "@/config/promo-reels";
import { listEvents } from "@/lib/events";
import {
  EMPTY_PROMO_HISTORY,
  countEventsThisWeek,
  planPromoReel,
  type PromoHistory,
  type PromoPlan,
} from "@/lib/instagram/promo/generate";
import { buildPromoProps, promoCaption, promoTiming } from "@/lib/instagram/promo/props";
import { renderPromoReel } from "@/lib/instagram/promo/render";
import { stockSourcesAvailable } from "@/lib/instagram/promo/stock";
import { clipKey, type PromoClip, type PromoScript } from "@/lib/instagram/promo/types";
import { readInstagramReelConfig } from "@/lib/instagram/reel/config";
import { listReelTracks, pickReelMusic } from "@/lib/instagram/reel/music";
import { bundleReelTemplate } from "@/lib/instagram/reel/render";
import type { ReelMusic } from "@/lib/instagram/reel/types";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function log(message: string) {
  console.info(`[promo:test] ${message}`);
}

/** Fixed texts for --clips-dir, so the look can be judged without any API. */
const OFFLINE_SCRIPTS: Omit<PromoScript, "searchQueries">[] = [
  {
    themeId: "swipen-beu",
    hook: "Swipen beu? Ontmoet mensen in het echt.",
    lines: ["Een glas, een gesprek, een lach.", "Alle singles-events op één plek."],
    caption:
      "Soms is een gesprek aan een tafeltje gewoon beter dan nog een avond swipen. Op dateofflinehub.be vind je singles-events in heel Vlaanderen.\n#dateofflinehub #singlesvlaanderen #offlinedaten",
  },
  {
    themeId: "offline-event",
    hook: "Zoek je een offline event?",
    lines: ["Speeddaten, wandelen, samen koken.", "Kies wat bij jou past."],
    caption:
      "Liever iemand in het echt leren kennen? Op dateofflinehub.be staan singles-events in heel Vlaanderen bij elkaar.\n#dateofflinehub #singlesvlaanderen #singlesevent",
  },
  {
    themeId: "anders-daten",
    hook: "Pak het eens anders aan. Ga echt daten.",
    lines: ["Minder chatten, meer doen.", "Je volgende avond begint hier."],
    caption:
      "Minder chatten, meer doen. Ontdek singles-events bij jou in de buurt op dateofflinehub.be.\n#dateofflinehub #singlesvlaanderen #echtdaten",
  },
];

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);
const MEDIA_EXT = new Set([...VIDEO_EXT, ".jpg", ".jpeg", ".png"]);

type LocalClips = { server: Server; base: string; dir: string; files: string[] };

/** Serve local clips over http (Remotion loads footage by URL). */
async function serveDir(dir: string): Promise<LocalClips> {
  const files = (await readdir(dir)).filter((f) => MEDIA_EXT.has(path.extname(f).toLowerCase())).sort();
  if (files.length === 0) throw new Error(`Geen mp4/jpg-bestanden in ${dir}`);
  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? "/").slice(1));
    if (!files.includes(name)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const ext = path.extname(name).toLowerCase();
    res.setHeader("Content-Type", VIDEO_EXT.has(ext) ? "video/mp4" : ext === ".png" ? "image/png" : "image/jpeg");
    createReadStream(path.join(dir, name)).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${port}`, dir, files };
}

function probeSeconds(file: string): Promise<number> {
  return new Promise((resolve) => {
    execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], (error, stdout) =>
      resolve(error ? 10 : Number(stdout.trim()) || 10),
    );
  });
}

async function localPlan(
  local: LocalClips,
  n: number,
  template: PromoTemplateId,
  music: ReelMusic,
): Promise<PromoPlan> {
  const base = OFFLINE_SCRIPTS[n % OFFLINE_SCRIPTS.length]!;
  const clipCount = base.lines.length + 1;
  const clips: PromoClip[] = [];
  for (let i = 0; i < clipCount; i++) {
    const file = local.files[(n * clipCount + i) % local.files.length]!;
    const video = VIDEO_EXT.has(path.extname(file).toLowerCase());
    clips.push({
      source: "pexels",
      id: `local-${file}`,
      kind: video ? "video" : "photo",
      url: `${local.base}/${encodeURIComponent(file)}`,
      width: 1080,
      height: 1920,
      duration: video ? await probeSeconds(path.join(local.dir, file)) : 0,
      pageUrl: "",
      author: "lokaal bestand",
      query: file,
    });
  }
  const script: PromoScript = { ...base, searchQueries: clips.map((c) => c.query) };
  const timing = promoTiming(clipCount);
  return {
    script,
    clips,
    template,
    caption: promoCaption(script, clips),
    props: buildPromoProps({ template, script, clips, timing, music }),
  };
}

async function loadHistory(file: string): Promise<PromoHistory> {
  try {
    return { ...EMPTY_PROMO_HISTORY, ...(JSON.parse(await readFile(file, "utf8")) as PromoHistory) };
  } catch {
    return { ...EMPTY_PROMO_HISTORY, recentHooks: [], usedClipKeys: [] };
  }
}

async function main() {
  const templates: PromoTemplateId[] = arg("template")
    ? (arg("template")!.split(",") as PromoTemplateId[])
    : [...PROMO_REELS_CONFIG.templates];
  const perTemplate = Math.max(1, Number(arg("count") ?? 1));
  const outDir = path.resolve(arg("out") ?? "out/promo");
  const clipsDir = arg("clips-dir");
  await mkdir(outDir, { recursive: true });
  const historyFile = path.join(outDir, "history.json");
  const history = await loadHistory(historyFile);

  let local: LocalClips | null = null;
  let eventCount: number | null = null;
  if (clipsDir) {
    local = await serveDir(path.resolve(clipsDir));
    log(`${local.files.length} eigen clips uit ${clipsDir} (geen API's)`);
  } else {
    const sources = stockSourcesAvailable();
    if (!sources.any) throw new Error("PIXABAY_API_KEY (of PEXELS_API_KEY) ontbreekt, of gebruik --clips-dir.");
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ontbreekt.");
    log(`beeldbronnen: ${[sources.pixabay && "Pixabay", sources.pexels && "Pexels"].filter(Boolean).join(" + ")}`);
    try {
      eventCount = countEventsThisWeek(await listEvents());
      log(`${eventCount} events in de komende 7 dagen`);
    } catch (error) {
      log(`catalogus niet bereikbaar, geen telling: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Promo music folder first; the normal reel music when it is empty.
  const reelConfig = readInstagramReelConfig();
  const promoTracks = await listReelTracks(PROMO_REELS_CONFIG.musicDir);
  const musicConfig = {
    ...reelConfig,
    musicDir: promoTracks.length > 0 ? PROMO_REELS_CONFIG.musicDir : reelConfig.musicDir,
  };
  log(`muziek uit remotion/public/${musicConfig.musicDir}`);

  log("Remotion-bundel maken...");
  const serveUrl = await bundleReelTemplate();
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

  let lastTrack: string | null = null;
  let n = 0;
  try {
    for (const template of templates) {
      for (let k = 0; k < perTemplate; k++) {
        const music = await pickReelMusic(musicConfig, lastTrack);
        lastTrack = music?.src ?? lastTrack;
        const plan = local
          ? await localPlan(local, n, template, music)
          : await planPromoReel({ history, eventCount, music, template, themeId: arg("theme"), log });

        const name = `promo-${template}${perTemplate > 1 ? `-${k + 1}` : ""}`;
        const outBase = path.join(outDir, name);
        const started = Date.now();
        const reel = await renderPromoReel({ serveUrl, props: plan.props, outBase, browserExecutable });
        log(
          `${name}: "${plan.script.hook}", ${plan.clips.length} clips, ${reel.seconds.toFixed(1)} s, ` +
            `${(reel.bytes / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s, ` +
            `muziek ${music?.src ?? "geen"}`,
        );
        await writeFile(`${outBase}-caption.txt`, `${plan.caption}\n`);
        const record = {
          template: plan.template,
          script: plan.script,
          clips: plan.clips.map((c) => ({
            source: c.source,
            id: c.id,
            kind: c.kind,
            author: c.author,
            pageUrl: c.pageUrl,
            query: c.query,
          })),
          props: plan.props,
        };
        await writeFile(`${outBase}-plan.json`, `${JSON.stringify(record, null, 2)}\n`);

        if (!local) {
          history.recentHooks.unshift(plan.script.hook);
          history.usedClipKeys.unshift(...plan.clips.map(clipKey));
          history.lastThemeId = plan.script.themeId;
          history.lastTemplate = plan.template;
          await writeFile(historyFile, `${JSON.stringify(history, null, 2)}\n`);
        }
        n++;
      }
    }
  } finally {
    local?.server.close();
  }
  log(`klaar: ${n} reel(s) in ${outDir}`);
}

main().catch((error) => {
  console.error("[promo:test] mislukt:", error instanceof Error ? error.message : error);
  process.exit(1);
});
