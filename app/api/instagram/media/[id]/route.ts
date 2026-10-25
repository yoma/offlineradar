import { NextResponse } from "next/server";
import { getQueueMedia } from "@/lib/instagram/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public JPEG for the Instagram queue. Meta fetches these URLs when it
 * creates media containers, so no auth: the 128-bit random id is the key.
 * Content behind an id never changes, so it may be cached.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await context.params;
  const id = raw.replace(/\.jpe?g$/i, "");
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let bytes: Buffer | null = null;
  try {
    bytes = await getQueueMedia(id);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!bytes) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
