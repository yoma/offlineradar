/** Client-side screenshot prep for admin intake uploads. */

import { INTAKE_MAX_BYTES } from "@/lib/aanvoer/types";

const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 0.82;
const HARD_EDGE_PX = 1600;
const HARD_JPEG_QUALITY = 0.7;

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

async function canvasToJpegBlob(
  source: ImageBitmap | HTMLImageElement,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  if (!width || !height) {
    throw new Error("Afbeelding kon niet worden gelezen.");
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas niet beschikbaar.");
  ctx.drawImage(source, 0, 0, targetW, targetH);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", quality);
  });
  if (!blob) throw new Error("Compressie mislukt.");
  return blob;
}

function jpegFileFromBlob(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^.]+$/, "") || "screenshot";
  return new File([blob], `${base}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/**
 * Accept PNG/JPEG/WEBP, compress when over the intake limit (common for phone photos).
 */
export async function prepareScreenshotForIntake(
  file: File,
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (!file || file.size === 0) {
    return { ok: false, error: "Kies een screenshot (PNG/JPG/WEBP)." };
  }

  const type = (file.type || "").toLowerCase().trim();
  const name = file.name || "screenshot.jpg";
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    name.toLowerCase().endsWith(".heic") ||
    name.toLowerCase().endsWith(".heif")
  ) {
    return {
      ok: false,
      error:
        "HEIC wordt niet ondersteund. Sla op als PNG of JPG (iPhone: Camera → Formaten → Meest compatibel).",
    };
  }

  const looksAllowed =
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/webp" ||
    !type ||
    type === "application/octet-stream";
  const hasExt = /\.(png|jpe?g|webp)$/i.test(name);
  if (!looksAllowed && !hasExt) {
    return {
      ok: false,
      error: "Alleen PNG, JPG/JPEG of WEBP zijn toegestaan.",
    };
  }

  if (file.size <= INTAKE_MAX_BYTES) {
    return { ok: true, file };
  }

  try {
    const bitmap = await loadImageBitmap(file);
    try {
      let blob = await canvasToJpegBlob(bitmap, MAX_EDGE_PX, JPEG_QUALITY);
      if (blob.size > INTAKE_MAX_BYTES) {
        blob = await canvasToJpegBlob(bitmap, HARD_EDGE_PX, HARD_JPEG_QUALITY);
      }
      if (blob.size > INTAKE_MAX_BYTES) {
        return {
          ok: false,
          error: `Screenshot is te groot (${formatMb(file.size)}). Max ${formatMb(INTAKE_MAX_BYTES)} na compressie.`,
        };
      }
      return { ok: true, file: jpegFileFromBlob(blob, name) };
    } finally {
      bitmap.close();
    }
  } catch {
    return {
      ok: false,
      error: `Screenshot is te groot (${formatMb(file.size)}, max ${formatMb(INTAKE_MAX_BYTES)}). Kies een kleinere JPG/PNG.`,
    };
  }
}
