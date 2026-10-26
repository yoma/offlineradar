import { NextResponse } from "next/server";
import { getQueueMediaWithKind } from "@/lib/instagram/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "public, max-age=86400, immutable",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
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

  let media: Awaited<ReturnType<typeof getQueueMediaWithKind>> = null;
  try {
    media = await getQueueMediaWithKind(id);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const isVideo = media?.kind === "reel";
  if (!media || isVideo !== wantsVideo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = media.bytes;
  const type = isVideo ? "video/mp4" : "image/jpeg";
  if (isVideo) {
    const range = parseRange(request.headers.get("range"), bytes.byteLength);
    if (range === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.byteLength}` },
      });
    }
    if (range) {
      const [start, end] = range;
      return new NextResponse(new Uint8Array(bytes.subarray(start, end + 1)), {
        status: 206,
        headers: {
          ...HEADERS,
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...HEADERS,
      "Content-Type": type,
      "Content-Length": String(bytes.byteLength),
      ...(isVideo ? { "Accept-Ranges": "bytes" } : {}),
    },
  });
}
