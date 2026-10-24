/**
 * Instagram event imagery — same visible URL as the public EventVisual card.
 *
 * Uses `resolveWebsiteVisibleEventImage` (central DateOfflineHub image logic).
 * Never invents a separate Instagram image source.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Event } from "@/types/event";
import {
  NEUTRAL_FALLBACK_DATA_URI,
  publicImageKindLabel,
  type PublicImageKind,
} from "@/lib/image-compatibility";
import { resolveWebsiteVisibleEventImage } from "@/lib/images";
import { igColors } from "@/lib/instagram/constants";

const dataUrlCache = new Map<string, string>();

/**
 * Cream brand surface — only when the website itself has no usable image
 * (resolvePublicEventImage → neutral) or a remote fetch fails for Satori.
 */
export const IG_NEUTRAL_FALLBACK_DATA_URI =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${igColors.cream}"/>
          <stop offset="55%" stop-color="#F3EBE3"/>
          <stop offset="100%" stop-color="#EDE3D8"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="1500" fill="url(#g)"/>
      <circle cx="980" cy="220" r="160" fill="${igColors.gold}" fill-opacity="0.22"/>
      <circle cx="160" cy="1280" r="200" fill="${igColors.bordeaux}" fill-opacity="0.10"/>
      <circle cx="900" cy="1100" r="90" fill="${igColors.gold}" fill-opacity="0.14"/>
    </svg>`,
  );

export type InstagramEventImage = {
  /** Absolute path, https URL, or data URL ready for Satori. */
  url: string;
  /** True when mood/library/neutral — not an official edition photo. */
  isAtmosphere: boolean;
  kind: PublicImageKind;
  label: string;
};

/**
 * Instagram image for one event = exact website-visible URL.
 */
export function imageForEvent(event: Event): InstagramEventImage {
  const resolved = resolveWebsiteVisibleEventImage(event);
  const kind: PublicImageKind = resolved.imageKind ?? "mood";
  const url =
    kind === "neutral_fallback" || resolved.url === NEUTRAL_FALLBACK_DATA_URI
      ? IG_NEUTRAL_FALLBACK_DATA_URI
      : resolved.url;

  return {
    url,
    isAtmosphere:
      resolved.keptAtmosphere === true ||
      kind === "mood" ||
      kind === "neutral_fallback" ||
      kind === "generated",
    kind: url === IG_NEUTRAL_FALLBACK_DATA_URI ? "neutral_fallback" : kind,
    label: publicImageKindLabel(
      url === IG_NEUTRAL_FALLBACK_DATA_URI ? "neutral_fallback" : kind,
    ),
  };
}

/** Cover / overview hero: first event’s website-visible image. */
export function heroForEvents(events: Event[]): InstagramEventImage {
  if (events.length === 0) {
    return {
      url: IG_NEUTRAL_FALLBACK_DATA_URI,
      isAtmosphere: true,
      kind: "neutral_fallback",
      label: publicImageKindLabel("neutral_fallback"),
    };
  }
  return imageForEvent(events[0]!);
}

/** Thumbnail for a list row — same website-visible source per event. */
export function thumbForEvent(event: Event): InstagramEventImage {
  return imageForEvent(event);
}

/** Sniff real image bytes — some `/preview-mood/*.png` files are JPEG on disk. */
function mimeFromBuffer(buf: Buffer, fallback = "image/jpeg"): string {
  if (buf.length >= 8) {
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return "image/png";
    }
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "image/jpeg";
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return "image/gif";
    }
    if (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  return fallback;
}

async function loadImageBuffer(src: string): Promise<{ buf: Buffer; hint: string }> {
  if (src.startsWith("/")) {
    const abs = path.join(process.cwd(), "public", src.replace(/^\//, ""));
    const buf = await readFile(abs);
    let hint = "image/jpeg";
    if (src.endsWith(".png")) hint = "image/png";
    else if (src.endsWith(".webp")) hint = "image/webp";
    return { buf, hint };
  }
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Image fetch failed: ${src} (${res.status})`);
  }
  const ct = res.headers.get("content-type") || "";
  let hint = "image/jpeg";
  if (ct.includes("png")) hint = "image/png";
  else if (ct.includes("webp")) hint = "image/webp";
  else if (ct.includes("jpeg") || ct.includes("jpg")) hint = "image/jpeg";
  return { buf: Buffer.from(await res.arrayBuffer()), hint };
}

/**
 * Lift dark night/mood stock for tiny Instagram row thumbs.
 * Same source image — only exposure for readability at ~70px.
 */
async function liftThumbBuffer(buf: Buffer): Promise<Buffer> {
  // Night/mood stock reads as black blobs at ~80px — lift adaptively for IG rows only.
  const stats = await sharp(buf).stats();
  const mean =
    ((stats.channels[0]?.mean ?? 0) +
      (stats.channels[1]?.mean ?? 0) +
      (stats.channels[2]?.mean ?? 0)) /
    3;
  const brightness = mean < 35 ? 1.85 : mean < 60 ? 1.6 : mean < 100 ? 1.38 : 1.18;
  const offset = mean < 35 ? 40 : mean < 60 ? 30 : mean < 100 ? 20 : 10;
  const linear = mean < 60 ? 1.28 : 1.15;

  return sharp(buf)
    .rotate()
    .resize(180, 180, { fit: "cover", position: "centre" })
    .modulate({ brightness, saturation: 1.06 })
    .gamma(1.12)
    .linear(linear, offset)
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}

/**
 * Resolve any public path, https URL, or data URI to a data URL for Satori.
 * On failure returns the brand-neutral fallback (never empty thumbs).
 */
export async function toImageDataUrl(
  src: string,
  options?: { liftForThumb?: boolean },
): Promise<string> {
  const cacheKey = options?.liftForThumb ? `thumb:${src}` : src;
  const hit = dataUrlCache.get(cacheKey);
  if (hit) return hit;

  if (src.startsWith("data:") && !options?.liftForThumb) {
    dataUrlCache.set(cacheKey, src);
    return src;
  }

  try {
    if (src.startsWith("data:") && options?.liftForThumb) {
      const base64 = src.split(",")[1];
      if (!base64) throw new Error("invalid data url");
      const lifted = await liftThumbBuffer(Buffer.from(base64, "base64"));
      const dataUrl = `data:image/jpeg;base64,${lifted.toString("base64")}`;
      dataUrlCache.set(cacheKey, dataUrl);
      return dataUrl;
    }

    const { buf, hint } = await loadImageBuffer(src);
    if (options?.liftForThumb) {
      const lifted = await liftThumbBuffer(buf);
      const dataUrl = `data:image/jpeg;base64,${lifted.toString("base64")}`;
      dataUrlCache.set(cacheKey, dataUrl);
      return dataUrl;
    }

    const mime = mimeFromBuffer(buf, hint);
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    dataUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    dataUrlCache.set(cacheKey, IG_NEUTRAL_FALLBACK_DATA_URI);
    return IG_NEUTRAL_FALLBACK_DATA_URI;
  }
}

export async function resolveMoodBundle(input: {
  heroSrc: string;
  thumbs?: string[];
}): Promise<{ hero: string; thumbs: string[] }> {
  const thumbs = input.thumbs ?? [];
  const [hero, ...thumbUrls] = await Promise.all([
    toImageDataUrl(input.heroSrc),
    ...thumbs.map((t) => toImageDataUrl(t, { liftForThumb: true })),
  ]);
  return { hero, thumbs: thumbUrls };
}
