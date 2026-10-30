import { NextResponse } from "next/server";
import {
  getQueueMediaInfo,
  getQueueMediaSlice,
  getQueueMediaWithKind,
} from "@/lib/instagram/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

/**
 * A file behind an id never changes. Vercel's CDN keeps the full answer for a
 * year, so Instagram, the admin page and the renderer get it from the CDN
 * instead of Neon (whose monthly network transfer is limited).
 */
const FULL_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "CDN-Cache-Control": "public, s-maxage=31536000, immutable",
};

/** Parse "bytes=start-end" (one range only). Null = serve the whole file. */
function parseRange(header: string | null, size: number): [number, number] | "invalid" | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, a, b] = match;
  if (!a && !b) return "invalid";
  let start = a ? Number(a) : size - Number(b);
  let end = a && b ? Number(b) : size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  return start > end || start >= size ? "invalid" : [start, end];
}

/**
 * Public JPEG or MP4 for the Instagram queue. Meta fetches these URLs when it
 * creates media containers, so no auth: the 128-bit random id is the key.
 * Content behind an id never changes, so it may be cached. MP4s answer
 * Range requests so browsers (Safari) can play the preview.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await context.params;
  const wantsVideo = /\.mp4$/i.test(raw);
  const id = raw.replace(/\.(jpe?g|mp4)$/i, "");
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Kind and size first (no bytes): a Range request then reads only its
  // slice, a full request reads the file once and the CDN keeps it.
  let info: Awaited<ReturnType<typeof getQueueMediaInfo>> = null;
  try {
    info = await getQueueMediaInfo(id);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const isVideo = info?.kind === "reel";
  if (!info || isVideo !== wantsVideo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const size = info.size;
  const type = isVideo ? "video/mp4" : "image/jpeg";
  if (isVideo) {
    const range = parseRange(request.headers.get("range"), size);
    if (range === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    if (range) {
      const [start, end] = range;
      let chunk: Buffer | null = null;
      try {
        chunk = await getQueueMediaSlice(id, start, end);
      } catch {
        return NextResponse.json({ error: "unavailable" }, { status: 503 });
      }
      if (!chunk) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          ...BASE_HEADERS,
          // Partial answers: browser may keep them, the CDN must not (its
          // cache key ignores Range).
          "Cache-Control": "private, max-age=86400",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
          "Content-Type": type,
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  let bytes: Buffer | null = null;
  try {
    bytes = (await getQueueMediaWithKind(id))?.bytes ?? null;
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!bytes) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      ...FULL_CACHE_HEADERS,
      "Content-Type": type,
      "Content-Length": String(bytes.byteLength),
      ...(isVideo ? { "Accept-Ranges": "bytes" } : {}),
    },
  });
}
