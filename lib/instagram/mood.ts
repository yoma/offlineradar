/**
 * Instagram event imagery — same catalog source as the public website.
 *
 * Priority:
 * 1. Stored `event.imageUrl` (Neon primary image → consumer map)
 * 2. That URL may already be a DateOfflineHub library asset (`/preview-mood/…`)
 * 3. Brand-neutral cream fallback — never hunt Unsplash / AI / new libraries
 *
 * Does not re-run mood-pool substitution (unlike EventVisual’s resolvePublicEventImage).
 * If the site already stores a less-ideal image, Instagram keeps that same source.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Event } from "@/types/event";
import {
  isKnownMoodAssetUrl,
  publicImageKindLabel,
  rewriteDeadMoodUrl,
  type PublicImageKind,
} from "@/lib/image-compatibility";
import { igColors } from "@/lib/instagram/constants";

const dataUrlCache = new Map<string, string>();

/**
 * Cream + soft gold/bordeaux — DateOfflineHub house style for missing images.
 * Always a valid data URL so cards never show empty gaps.
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
 * Central Instagram image resolver — mirrors the website catalog field
 * (`event.imageUrl` from Neon primary image), without external mood hunting.
 */
export function resolveInstagramCatalogImage(
  imageUrl: string | null | undefined,
  imageIsAtmosphere?: boolean | null,
): InstagramEventImage {
  const stored = rewriteDeadMoodUrl(imageUrl?.trim() || null);

  if (stored) {
    const library = isKnownMoodAssetUrl(stored) || stored.startsWith("/preview-mood/");
    const atmosphere = imageIsAtmosphere === true || library;
    const kind: PublicImageKind = library
      ? "mood"
      : atmosphere
        ? "mood"
        : "official";
    return {
      url: stored,
      isAtmosphere: atmosphere,
      kind,
      label: publicImageKindLabel(kind),
    };
  }

  return {
    url: IG_NEUTRAL_FALLBACK_DATA_URI,
    isAtmosphere: true,
    kind: "neutral_fallback",
    label: publicImageKindLabel("neutral_fallback"),
  };
}

/** Resolve the Instagram image for one catalog event. */
export function imageForEvent(event: Event): InstagramEventImage {
  return resolveInstagramCatalogImage(event.imageUrl, event.imageIsAtmosphere);
}

/** Cover / overview hero: first event with a stored image, else brand neutral. */
export function heroForEvents(events: Event[]): InstagramEventImage {
  for (const event of events) {
    if (event.imageUrl?.trim()) return imageForEvent(event);
  }
  return resolveInstagramCatalogImage(null);
}

/** Thumbnail for a list row — same catalog source per event. */
export function thumbForEvent(event: Event): InstagramEventImage {
  return imageForEvent(event);
}

/** Sniff real image bytes — some `/preview-mood/*.png` files are JPEG on disk. */
function mimeFromBuffer(buf: Buffer, fallback = "image/jpeg"): string {
  if (buf.length >= 8) {
    // PNG
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return "image/png";
    }
    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "image/jpeg";
    }
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return "image/gif";
    }
    // WEBP (RIFF....WEBP)
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

/**
 * Resolve any public path, https URL, or data URI to a data URL for Satori.
 * On failure returns the brand-neutral fallback (never throws empty thumbs).
 */
export async function toImageDataUrl(src: string): Promise<string> {
  const hit = dataUrlCache.get(src);
  if (hit) return hit;

  if (src.startsWith("data:")) {
    dataUrlCache.set(src, src);
    return src;
  }

  try {
    let buf: Buffer;
    let hint = "image/jpeg";

    if (src.startsWith("/")) {
      const abs = path.join(process.cwd(), "public", src.replace(/^\//, ""));
      buf = await readFile(abs);
      if (src.endsWith(".png")) hint = "image/png";
      else if (src.endsWith(".webp")) hint = "image/webp";
    } else {
      const res = await fetch(src);
      if (!res.ok) {
        throw new Error(`Image fetch failed: ${src} (${res.status})`);
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("png")) hint = "image/png";
      else if (ct.includes("webp")) hint = "image/webp";
      else if (ct.includes("jpeg") || ct.includes("jpg")) hint = "image/jpeg";
      buf = Buffer.from(await res.arrayBuffer());
    }

    const mime = mimeFromBuffer(buf, hint);
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    dataUrlCache.set(src, dataUrl);
    return dataUrl;
  } catch {
    dataUrlCache.set(src, IG_NEUTRAL_FALLBACK_DATA_URI);
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
    ...thumbs.map((t) => toImageDataUrl(t)),
  ]);
  return { hero, thumbs: thumbUrls };
}
