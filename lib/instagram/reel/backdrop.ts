/**
 * Atmosphere footage behind an event reel's hook and call to action: warm
 * stock clips (Pixabay, Pexels when its key is set) picked the same way as
 * for the promo reels (lib/instagram/promo/select-clips.ts: Claude scores the
 * preview frames, a stock photo with a slow zoom when no clip is good enough).
 *
 * Runs in GitHub Actions only (Pixabay is not reachable from everywhere).
 * Anything missing or failing returns null: the reel then keeps its plain
 * colour scenes, so a post is never lost over a picture.
 *
 * Clips used before are remembered in the stock cache folder (kept between
 * workflow runs), so consecutive reels do not repeat the same footage.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { selectPromoClips } from "@/lib/instagram/promo/select-clips";
import { stockSourcesAvailable } from "@/lib/instagram/promo/stock";
import { clipKey } from "@/lib/instagram/promo/types";
import { REEL_FPS, type ReelProps } from "@/lib/instagram/reel/types";

/**
 * Queries that suit any time of year: people meeting up, small groups. Kept
 * on the bright side: dark, red-lit scenes ("candlelight", "city lights")
 * turned the reel mostly red under the bordeaux wash, or found nothing good.
 */
const YEAR_ROUND = [
  "friends cafe",
  "wine glasses toast",
  "friends laughing dinner",
  "coffee date cafe",
  "friends brunch",
  "cozy bar evening",
  "friends cooking together",
  "board game friends",
  "couple talking cafe",
];
/** Only April to September: outdoor terraces and parks. */
const SUMMER = ["terrace drinks sunset", "string lights terrace", "picnic park sunset", "friends walking park"];

/** Query windows tried per scene before it stays plain. */
const SCENE_TRIES = 3;

/** How many clip keys to remember (about two months of reels). */
const USED_MAX = 120;

function usedFile(): string {
  const dir = process.env.PROMO_STOCK_CACHE_DIR?.trim() || ".cache/promo-stock";
  return path.join(dir, "reel-backdrops-used.json");
}

async function readUsed(): Promise<string[]> {
  try {
    const list = JSON.parse(await readFile(usedFile(), "utf8")) as unknown;
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

async function rememberUsed(keys: string[]): Promise<void> {
  try {
    const list = [...(await readUsed()), ...keys].slice(-USED_MAX);
    await mkdir(path.dirname(usedFile()), { recursive: true });
    await writeFile(usedFile(), JSON.stringify(list));
  } catch {
    // Not remembering only means a clip may come back sooner.
  }
}

/** Small deterministic hash, so one job keeps the same queries on a retry. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The query list for this date, rotated by the seed. */
export function backdropQueries(seed: string, at: Date): string[] {
  const month = at.getUTCMonth() + 1;
  const list = month >= 4 && month <= 9 ? [...SUMMER, ...YEAR_ROUND] : [...YEAR_ROUND];
  const start = seedOf(seed) % list.length;
  return [...list.slice(start), ...list.slice(0, start)];
}

export async function pickReelBackdrops(args: {
  /** Queue job id (or any stable text): decides the queries. */
  seed: string;
  props: ReelProps;
  at?: Date;
  /** clipKey()s of recent promo and event reels, from the site. */
  usedClipKeys?: string[];
  log?: (message: string) => void;
}): Promise<ReelProps["backdrops"]> {
  const log = args.log ?? (() => {});
  if (!stockSourcesAvailable().any || !process.env.ANTHROPIC_API_KEY?.trim()) {
    log("sfeerbeeld: geen PIXABAY_API_KEY of ANTHROPIC_API_KEY, effen achtergrond");
    return null;
  }
  const queries = backdropQueries(args.seed, args.at ?? new Date());
  const { hookFrames, ctaFrames } = args.props.timing;
  const taken = new Set([...(args.usedClipKeys ?? []), ...(await readUsed())]);

  /**
   * One scene: a few query windows in turn (scene 0 starts at query 0,
   * scene 1 at query 1, each retry two further), so one poor query such as
   * an all-AI result list does not leave the scene plain.
   */
  const pickScene = async (scene: number, text: string, seconds: number) => {
    for (let attempt = 0; attempt < SCENE_TRIES; attempt++) {
      const start = (scene + attempt * 2) % queries.length;
      const rotated = [...queries.slice(start), ...queries.slice(0, start)];
      try {
        const [clip] = await selectPromoClips({
          queries: rotated.slice(0, 1),
          sceneTexts: [text],
          fallbackQueries: rotated.slice(1, 4),
          usedClipKeys: taken,
          sceneSeconds: [seconds],
          log: (m) => log(`sfeerbeeld ${scene === 0 ? "intro" : "einde"} ${m}`),
        });
        if (clip) {
          taken.add(clipKey(clip));
          return clip;
        }
      } catch (error) {
        log(`sfeerbeeld ${scene === 0 ? "intro" : "einde"} poging ${attempt + 1}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return null;
  };

  try {
    const hook = await pickScene(0, args.props.hookText, hookFrames / REEL_FPS + 0.5);
    const cta = await pickScene(1, `Meer info en inschrijven op ${args.props.website}`, ctaFrames / REEL_FPS + 0.5);
    if (!hook && !cta) {
      log("sfeerbeeld: niets goed genoeg gevonden, effen achtergrond");
      return null;
    }
    // One good picture for both beats a plain bordeaux scene.
    const backdrops = { hook: hook ?? cta, cta: cta ?? hook };
    await rememberUsed([hook, cta].filter((b) => b !== null).map(clipKey));
    for (const b of [backdrops.hook, backdrops.cta]) {
      if (b) log(`sfeerbeeld: ${b.source} ${b.kind} ${b.pageUrl} (${b.author})`);
    }
    return backdrops;
  } catch (error) {
    log(`sfeerbeeld mislukt, effen achtergrond: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Download with retries on 429/5xx and network errors (2s, 4s, 8s). */
async function download(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2_000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Copy the backdrop files into the render bundle's public folder (`serveUrl`
 * is the folder bundle() wrote), so the render loads them locally. Loading
 * them from the stock site during the render fails: Pixabay answers the many
 * parallel requests with HTTP 429. A file that will not download drops that
 * backdrop (plain scene) instead of failing the reel.
 */
export async function localizeBackdrops(
  backdrops: ReelProps["backdrops"],
  serveUrl: string,
  log: (message: string) => void = () => {},
): Promise<ReelProps["backdrops"]> {
  if (!backdrops) return backdrops;
  const out: NonNullable<ReelProps["backdrops"]> = { hook: null, cta: null };
  for (const slot of ["hook", "cta"] as const) {
    const b = backdrops[slot];
    if (!b) continue;
    const ext = b.kind === "video" ? "mp4" : (/\.(png|webp)(?:$|\?)/i.exec(b.url)?.[1]?.toLowerCase() ?? "jpg");
    const localFile = `backdrops/${b.source}-${b.id}.${ext}`.replace(/[^\w./-]/g, "_");
    const target = path.join(serveUrl, "public", localFile);
    try {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await download(b.url));
      out[slot] = { ...b, localFile };
    } catch (error) {
      log(`sfeerbeeld ${slot} niet gedownload, effen scène: ${error instanceof Error ? error.message : error}`);
    }
  }
  return out.hook || out.cta ? out : null;
}
