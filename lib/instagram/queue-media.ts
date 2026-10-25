/**
 * Turn queue slides into JPEG bytes Instagram accepts:
 * JPEG, sRGB, ≤ 8 MB, aspect ratio between 4:5 and 1.91:1, max 1440 px wide.
 * Bytes are stored in Neon and served from /api/instagram/media/{id}.jpg.
 */

import sharp from "sharp";
import type { InstagramDraft } from "@/lib/instagram/drafts";
import { renderInstagramJpegFromQuery } from "@/lib/instagram/render-jpeg";
import type { Event } from "@/types/event";

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_JPEG_BYTES = 8 * 1024 * 1024;
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;
const MAX_WIDTH = 1440;

export async function renderDraftJpegs(
  draft: Pick<InstagramDraft, "slides">,
  catalog: Event[],
): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const slide of draft.slides.slice(0, 10)) {
    const result = await renderInstagramJpegFromQuery(slide.kind, slide.query, {
      catalog,
    });
    if (!result.ok) {
      throw new Error(`Slide "${slide.label}" kon niet gerenderd worden (${result.error}).`);
    }
    out.push(result.bytes);
  }
  return out;
}

/** Crop/resize any image into an Instagram-safe JPEG. */
export async function toInstagramJpeg(input: Buffer): Promise<Buffer> {
  // Apply EXIF rotation first so width/height match what people see.
  const oriented = await sharp(input, { failOn: "error" }).rotate().toBuffer();
  const image = sharp(oriented);
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error("Onbekend afbeeldingsformaat.");

  let cropW = width;
  let cropH = height;
  const ratio = width / height;
  if (ratio < MIN_RATIO) cropH = Math.round(width / MIN_RATIO);
  else if (ratio > MAX_RATIO) cropW = Math.round(height * MAX_RATIO);

  const targetW = Math.min(cropW, MAX_WIDTH);
  let pipeline = image.resize({
    width: targetW,
    height: Math.round((targetW * cropH) / cropW),
    fit: "cover",
    position: "attention",
  });
  pipeline = pipeline.toColourspace("srgb").flatten({ background: "#ffffff" });

  for (const quality of [88, 80, 70]) {
    const jpeg = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (jpeg.byteLength <= MAX_JPEG_BYTES) return jpeg;
  }
  throw new Error("Afbeelding blijft groter dan 8 MB.");
}

/** Download an admin-supplied https image and convert it to a safe JPEG. */
export async function ingestExternalImage(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Ongeldige URL: ${rawUrl.slice(0, 80)}`);
  }
  if (url.protocol !== "https:") {
    throw new Error("Alleen https-afbeeldingen zijn toegestaan.");
  }
  const res = await fetchImpl(url.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Afbeelding niet bereikbaar (HTTP ${res.status}): ${url.hostname}`);
  }
  const type = res.headers.get("content-type") ?? "";
  if (type && !type.startsWith("image/")) {
    throw new Error(`Geen afbeelding (${type.split(";")[0]}): ${url.hostname}`);
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) throw new Error("Afbeelding is groter dan 20 MB.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("Afbeelding is groter dan 20 MB.");
  }
  return toInstagramJpeg(bytes);
}
