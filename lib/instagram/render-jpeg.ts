/**
 * Render an Instagram slide as JPEG bytes (Meta requires JPEG, not PNG).
 */

import sharp from "sharp";
import { listEvents } from "@/lib/events";
import {
  parseInstagramRenderKind,
  resolveInstagramRenderInput,
} from "@/lib/instagram/image-query";
import { renderInstagramImage } from "@/lib/instagram/render";

export async function renderInstagramJpegFromQuery(
  kindRaw: string,
  query: Record<string, string> | URLSearchParams,
): Promise<
  | { ok: true; bytes: Buffer; contentType: "image/jpeg" }
  | { ok: false; error: string; status: number }
> {
  const kind = parseInstagramRenderKind(kindRaw);
  if (!kind) return { ok: false, error: "invalid_kind", status: 400 };

  const params =
    query instanceof URLSearchParams
      ? query
      : new URLSearchParams(query);

  let catalog = [] as Awaited<ReturnType<typeof listEvents>>;
  if (kind !== "nieuw_cover") {
    try {
      catalog = await listEvents();
    } catch {
      return { ok: false, error: "catalog_unavailable", status: 503 };
    }
  }

  const resolved = resolveInstagramRenderInput(kind, params, catalog);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, status: resolved.status };
  }

  try {
    const image = await renderInstagramImage(resolved.input);
    const png = Buffer.from(await image.arrayBuffer());
    const jpeg = await sharp(png)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { ok: true, bytes: jpeg, contentType: "image/jpeg" };
  } catch (error) {
    console.error("[instagram/render-jpeg]", error);
    return { ok: false, error: "render_failed", status: 500 };
  }
}
