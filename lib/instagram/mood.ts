/**
 * Atmosphere / mood imagery for Instagram templates.
 * Prefer a compatible official event image; otherwise a matching sfeerbeeld.
 * Never present mood stock as a photo of that specific edition.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Event } from "@/types/event";
import {
  eventImageDiversityKey,
  isKnownMoodAssetUrl,
  publicImageKindLabel,
  resolvePublicEventImage,
  type PublicImageKind,
} from "@/lib/image-compatibility";

const dataUrlCache = new Map<string, string>();

export type InstagramEventImage = {
  url: string;
  /** True when this is mood / fallback stock, not an official edition photo. */
  isAtmosphere: boolean;
  kind: PublicImageKind;
  label: string;
};

function eventImageContext(event: Event) {
  return {
    category: event.category,
    activities: event.activities,
    tags: event.tags,
    title: event.title,
    subCategory: event.subCategory,
    description: event.description,
    shortDescription: event.shortDescription,
    organizerName: event.organizerName,
    minAge: event.eligibilityAgeMin,
    maxAge: event.eligibilityAgeMax,
  };
}

/**
 * Resolve the best Instagram image for one event.
 * Uses the shared semantic image pipeline (theme, city vs nature, sport, …).
 */
export function imageForEvent(event: Event): InstagramEventImage {
  const resolved = resolvePublicEventImage(
    eventImageContext(event),
    event.imageUrl,
    event.imageIsAtmosphere === true,
    eventImageDiversityKey({
      eventId: event.id,
      organizerId: event.organizerId ?? event.organizerSlug ?? null,
    }),
  );

  const kind: PublicImageKind =
    resolved.imageKind ??
    (resolved.keptAtmosphere || isKnownMoodAssetUrl(resolved.url)
      ? "mood"
      : "official");

  const isAtmosphere =
    kind === "mood" ||
    kind === "neutral_fallback" ||
    kind === "generated" ||
    resolved.keptAtmosphere === true;

  return {
    url: resolved.url,
    isAtmosphere,
    kind,
    label: publicImageKindLabel(kind),
  };
}

/** Cover / overview hero: prefer first event’s match, else social mood. */
export function heroForEvents(events: Event[]): InstagramEventImage {
  if (events.length === 0) {
    const fallback = resolvePublicEventImage(
      {
        category: "dating",
        activities: ["speeddate"],
        title: "Singles ontmoeten",
      },
      null,
      true,
      "ig-cover-fallback",
    );
    return {
      url: fallback.url,
      isAtmosphere: true,
      kind: fallback.imageKind ?? "mood",
      label: publicImageKindLabel(fallback.imageKind ?? "mood"),
    };
  }
  return imageForEvent(events[0]!);
}

/** Thumbnail for a list row — per-event semantic match (avoids one photo for all). */
export function thumbForEvent(event: Event): InstagramEventImage {
  return imageForEvent(event);
}

/**
 * Resolve any public path or https URL to a data URL for Satori reliability.
 */
export async function toImageDataUrl(src: string): Promise<string> {
  const hit = dataUrlCache.get(src);
  if (hit) return hit;

  let buf: Buffer;
  let mime = "image/jpeg";

  if (src.startsWith("data:")) {
    dataUrlCache.set(src, src);
    return src;
  }

  if (src.startsWith("/")) {
    const abs = path.join(process.cwd(), "public", src.replace(/^\//, ""));
    buf = await readFile(abs);
    if (src.endsWith(".png")) mime = "image/png";
    else if (src.endsWith(".webp")) mime = "image/webp";
  } else {
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(`Mood image fetch failed: ${src} (${res.status})`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("png")) mime = "image/png";
    else if (ct.includes("webp")) mime = "image/webp";
    buf = Buffer.from(await res.arrayBuffer());
  }

  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  dataUrlCache.set(src, dataUrl);
  return dataUrl;
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
