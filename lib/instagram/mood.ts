/**
 * Atmosphere / mood imagery for Instagram templates.
 * Never presented as photos of a specific edition — only generic sfeerbeelden.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ActivityId, Event } from "@/types/event";

const dataUrlCache = new Map<string, string>();

/** Warm lifestyle heroes (Unsplash) — connection / social atmosphere only. */
export const IG_HERO = {
  social:
    "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1600&q=80",
  drinks:
    "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1600&q=80",
  dinner:
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80",
  walk:
    "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1600&q=80",
  party:
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1600&q=80",
  sport:
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1600&q=80",
} as const;

export function heroForActivities(activities: ActivityId[]): string {
  if (activities.includes("wandelen") || activities.includes("outdoor")) {
    return IG_HERO.walk;
  }
  if (activities.includes("party") || activities.includes("dans")) {
    return IG_HERO.party;
  }
  if (activities.includes("eten")) return IG_HERO.dinner;
  if (activities.includes("drinken")) return IG_HERO.drinks;
  if (
    activities.includes("sport") ||
    activities.includes("padel") ||
    activities.includes("lopen")
  ) {
    return IG_HERO.sport;
  }
  return IG_HERO.social;
}

export function heroForEvents(events: Event[]): string {
  const acts = events.flatMap((e) => e.activities);
  return heroForActivities(acts);
}

/**
 * Thumbnail for a list row. Prefer activity hero (reliable Unsplash sfeerbeeld)
 * so every card has a visible photo. Event-specific images are never implied.
 */
export function thumbForEvent(event: Event): string {
  // Stable, activity-matched atmosphere — avoids blank/broken catalog thumbs in OG.
  return heroForActivities(event.activities);
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
