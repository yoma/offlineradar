/**
 * Load logo + fonts for Instagram ImageResponse renders.
 * Uses the real DateOfflineHub logo from public/brand.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

let logoDataUrlCache: string | null = null;
let logoMarkDataUrlCache: string | null = null;

const fontCache = new Map<string, ArrayBuffer>();

async function fileAsDataUrl(
  relativePath: string,
  mime: string,
): Promise<string> {
  const abs = path.join(process.cwd(), relativePath);
  const buf = await readFile(abs);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function getLogoDataUrl(): Promise<string> {
  if (logoDataUrlCache) return logoDataUrlCache;
  logoDataUrlCache = await fileAsDataUrl(
    "public/brand/dateofflinehub-logo.png",
    "image/png",
  );
  return logoDataUrlCache;
}

export async function getLogoMarkDataUrl(): Promise<string> {
  if (logoMarkDataUrlCache) return logoMarkDataUrlCache;
  logoMarkDataUrlCache = await fileAsDataUrl(
    "public/brand/dateofflinehub-mark.png",
    "image/png",
  );
  return logoMarkDataUrlCache;
}

/**
 * Fontsource TTF URLs (Satori-friendly). Matches website brand typography.
 */
const FONT_URLS: Record<string, string> = {
  "Bricolage Grotesque:700":
    "https://cdn.jsdelivr.net/fontsource/fonts/bricolage-grotesque@latest/latin-700-normal.ttf",
  "DM Sans:400":
    "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-400-normal.ttf",
  "DM Sans:600":
    "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-600-normal.ttf",
};

export async function loadGoogleFont(
  family: string,
  weight: number,
): Promise<ArrayBuffer> {
  const key = `${family}:${weight}`;
  const hit = fontCache.get(key);
  if (hit) return hit;

  const url = FONT_URLS[key];
  if (!url) {
    throw new Error(`No font URL configured for ${key}`);
  }
  const fontRes = await fetch(url);
  if (!fontRes.ok) {
    throw new Error(`Font binary fetch failed for ${key}: ${fontRes.status}`);
  }
  const data = await fontRes.arrayBuffer();
  fontCache.set(key, data);
  return data;
}

export type InstagramFontSet = {
  heading: { name: string; data: ArrayBuffer; weight: 600 | 700; style: "normal" };
  body: { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: "normal" };
  bodySemibold: {
    name: string;
    data: ArrayBuffer;
    weight: 600;
    style: "normal";
  };
};

export async function loadInstagramFonts(): Promise<InstagramFontSet> {
  const [heading, body, bodySemibold] = await Promise.all([
    loadGoogleFont("Bricolage Grotesque", 700),
    loadGoogleFont("DM Sans", 400),
    loadGoogleFont("DM Sans", 600),
  ]);
  return {
    heading: {
      name: "Bricolage Grotesque",
      data: heading,
      weight: 700,
      style: "normal",
    },
    body: {
      name: "DM Sans",
      data: body,
      weight: 400,
      style: "normal",
    },
    bodySemibold: {
      name: "DM Sans",
      data: bodySemibold,
      weight: 600,
      style: "normal",
    },
  };
}
