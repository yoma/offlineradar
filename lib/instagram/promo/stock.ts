/**
 * Stock footage search: Pixabay (main source) and Pexels (optional extra,
 * only when PEXELS_API_KEY is set; Pexels paused new API keys in Oct 2026).
 * Only clips that fill a 1080x1920 frame without visible upscaling: portrait
 * clips, or landscape clips tall enough (4K) to crop to 9:16.
 *
 * Licences: Pixabay and Pexels content may be used commercially and edited,
 * without attribution (we credit the source in the caption anyway). Not
 * allowed: suggesting the people shown endorse something or belong to it,
 * which config/promo-reels.ts and promo/script.ts guard against. Files are
 * fetched by the renderer at render time, never hotlinked from the site.
 *
 * Env: PIXABAY_API_KEY and/or PEXELS_API_KEY (at least one).
 */

import type { PromoClip, StockSource } from "@/lib/instagram/promo/types";

/** A search hit before Claude picks: the clip plus a preview image. */
export type StockCandidate = PromoClip & { previewUrl: string; description: string };

/** Smallest source height that still looks sharp in a 1920 px tall frame. */
const MIN_PORTRAIT_HEIGHT = 1600;
/**
 * Photos for the Ken Burns fallback may be a bit smaller: Pixabay's API only
 * gives 1280 px images, slightly soft at full height but fine for a still.
 */
const MIN_PHOTO_HEIGHT = 1200;
/** Do not download more than this (4K portrait is ~3840). */
const MAX_PREFERRED_HEIGHT = 2560;
const MIN_CLIP_SECONDS = 4;
const MAX_CLIP_SECONDS = 60;
const TIMEOUT_MS = 15_000;

function key(name: "PEXELS_API_KEY" | "PIXABAY_API_KEY"): string | null {
  return process.env[name]?.trim().split(/\r?\n/)[0]?.trim() || null;
}

export function stockSourcesAvailable(): { pexels: boolean; pixabay: boolean; any: boolean } {
  const pexels = Boolean(key("PEXELS_API_KEY"));
  const pixabay = Boolean(key("PIXABAY_API_KEY"));
  return { pexels, pixabay, any: pexels || pixabay };
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Can this frame be cropped to 9:16 at 1080x1920 without looking soft? */
export function fitsReel(width: number, height: number): boolean {
  if (height < MIN_PORTRAIT_HEIGHT) return false;
  // Width of a 9:16 crop at full height must be at least ~85% of 1080.
  return Math.min(width, (height * 9) / 16) >= 900;
}

type Rendition = { link: string; width: number; height: number };

/** The smallest rendition that still fits the reel; else the largest. */
export function pickRendition(files: Rendition[]): Rendition | null {
  const usable = files.filter((f) => f.link && fitsReel(f.width, f.height));
  if (usable.length === 0) return null;
  usable.sort((a, b) => a.height - b.height);
  return usable.find((f) => f.height <= MAX_PREFERRED_HEIGHT) ?? usable[0]!;
}

/* ------------------------------------------------------------------ */
/* Pexels                                                             */
/* ------------------------------------------------------------------ */

type PexelsVideo = {
  id: number;
  url: string;
  image: string;
  duration: number;
  user: { name: string };
  video_files: { link: string; width: number; height: number; file_type: string }[];
};

/** "https://www.pexels.com/video/friends-laughing-on-a-terrace-123/" → "friends laughing on a terrace" */
function pexelsSlug(pageUrl: string): string {
  const slug = pageUrl.split("/").filter(Boolean).pop() ?? "";
  return slug.replace(/-\d+$/, "").replace(/-/g, " ");
}

export async function searchPexelsVideos(query: string, perPage = 20): Promise<StockCandidate[]> {
  const apiKey = key("PEXELS_API_KEY");
  if (!apiKey) return [];
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", String(perPage));
  const data = await getJson<{ videos?: PexelsVideo[] }>(url.toString(), { Authorization: apiKey });
  const out: StockCandidate[] = [];
  for (const v of data.videos ?? []) {
    if (v.duration < MIN_CLIP_SECONDS || v.duration > MAX_CLIP_SECONDS) continue;
    const file = pickRendition(v.video_files.filter((f) => f.file_type === "video/mp4"));
    if (!file) continue;
    out.push({
      source: "pexels",
      id: String(v.id),
      kind: "video",
      url: file.link,
      width: file.width,
      height: file.height,
      duration: v.duration,
      pageUrl: v.url,
      author: v.user?.name ?? "",
      query,
      previewUrl: v.image,
      description: pexelsSlug(v.url),
    });
  }
  return out;
}

type PexelsPhoto = {
  id: number;
  url: string;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  src: { original: string; large2x: string; large: string; portrait: string };
};

export async function searchPexelsPhotos(query: string, perPage = 15): Promise<StockCandidate[]> {
  const apiKey = key("PEXELS_API_KEY");
  if (!apiKey) return [];
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", String(perPage));
  const data = await getJson<{ photos?: PexelsPhoto[] }>(url.toString(), { Authorization: apiKey });
  return (data.photos ?? [])
    .filter((p) => fitsReel(p.width, p.height))
    .map((p) => {
      // Pexels resizes on the fly; 2400 px tall leaves room for the slow zoom.
      const src = new URL(p.src.original);
      src.searchParams.set("auto", "compress");
      src.searchParams.set("cs", "tinysrgb");
      src.searchParams.set("h", "2400");
      return {
        source: "pexels" as StockSource,
        id: `photo-${p.id}`,
        kind: "photo" as const,
        url: src.toString(),
        width: Math.round((p.width * 2400) / p.height),
        height: 2400,
        duration: 0,
        pageUrl: p.url,
        author: p.photographer,
        query,
        previewUrl: p.src.large,
        description: p.alt || pexelsSlug(p.url),
      };
    });
}

/* ------------------------------------------------------------------ */
/* Pixabay                                                            */
/* ------------------------------------------------------------------ */

type PixabayRendition = { url: string; width: number; height: number; thumbnail?: string };
type PixabayVideo = {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  user: string;
  videos: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayRendition>>;
};

export async function searchPixabayVideos(query: string, perPage = 50): Promise<StockCandidate[]> {
  const apiKey = key("PIXABAY_API_KEY");
  if (!apiKey) return [];
  const url = new URL("https://pixabay.com/api/videos/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("safesearch", "true");
  const data = await getJson<{ hits?: PixabayVideo[] }>(url.toString());
  const out: StockCandidate[] = [];
  for (const v of data.hits ?? []) {
    if (v.duration < MIN_CLIP_SECONDS || v.duration > MAX_CLIP_SECONDS) continue;
    const renditions = Object.values(v.videos).filter(Boolean) as PixabayRendition[];
    const file = pickRendition(renditions.map((r) => ({ link: r.url, width: r.width, height: r.height })));
    const preview = v.videos.large?.thumbnail ?? v.videos.medium?.thumbnail;
    if (!file || !preview) continue;
    out.push({
      source: "pixabay",
      id: String(v.id),
      kind: "video",
      url: file.link,
      width: file.width,
      height: file.height,
      duration: v.duration,
      pageUrl: v.pageURL,
      author: v.user,
      query,
      previewUrl: preview,
      description: v.tags,
    });
  }
  return out;
}

type PixabayPhoto = {
  id: number;
  pageURL: string;
  tags: string;
  user: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
};

export async function searchPixabayPhotos(query: string, perPage = 30): Promise<StockCandidate[]> {
  const apiKey = key("PIXABAY_API_KEY");
  if (!apiKey) return [];
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("safesearch", "true");
  const data = await getJson<{ hits?: PixabayPhoto[] }>(url.toString());
  const out: StockCandidate[] = [];
  for (const p of data.hits ?? []) {
    // largeImageURL is scaled to at most 1280 px on the long side.
    const scale = Math.min(1, 1280 / Math.max(p.imageWidth, p.imageHeight));
    const width = Math.round(p.imageWidth * scale);
    const height = Math.round(p.imageHeight * scale);
    if (height < MIN_PHOTO_HEIGHT || width < (height * 9) / 16 - 1) continue;
    out.push({
      source: "pixabay",
      id: `photo-${p.id}`,
      kind: "photo",
      url: p.largeImageURL,
      width,
      height,
      duration: 0,
      pageUrl: p.pageURL,
      author: p.user,
      query,
      previewUrl: p.webformatURL,
      description: p.tags,
    });
  }
  return out;
}

type Search = (query: string) => Promise<StockCandidate[]>;

/** Run each search in order, keep going while fewer than `minResults` were found. */
async function searchInOrder(query: string, searches: Search[], minResults: number): Promise<StockCandidate[]> {
  const results: StockCandidate[] = [];
  const errors: string[] = [];
  for (const search of searches) {
    if (results.length >= minResults) break;
    try {
      results.push(...(await search(query)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (results.length === 0 && errors.length > 0) {
    console.warn(`[promo/stock] "${query}": ${errors.join("; ")}`);
  }
  return results;
}

/** Pixabay first, Pexels added (when its key is set) if Pixabay has few usable clips. */
export function searchStockVideos(query: string, minResults = 8): Promise<StockCandidate[]> {
  return searchInOrder(query, [searchPixabayVideos, searchPexelsVideos, broader(searchPixabayVideos)], minResults);
}

/**
 * Pixabay matches every word of the query, so "friends laughing on a terrace"
 * finds little; retry with the first two words ("friends laughing").
 */
function broader(search: Search): Search {
  return async (query) => {
    const words = query.trim().split(/\s+/);
    return words.length > 2 ? search(words.slice(0, 2).join(" ")) : [];
  };
}

/** Photos for the Ken Burns fallback: Pexels (sharper) when available, then Pixabay. */
export function searchStockPhotos(query: string, minResults = 6): Promise<StockCandidate[]> {
  return searchInOrder(query, [searchPexelsPhotos, searchPixabayPhotos, broader(searchPixabayPhotos)], minResults);
}
