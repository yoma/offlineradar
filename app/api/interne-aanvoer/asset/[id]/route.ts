import { NextResponse } from "next/server";
import { getIntakeAsset } from "@/lib/aanvoer/assets";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Admin-only private screenshot evidence.
 * Not public. Not cacheable. Never used as event hero.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const asset = await getIntakeAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.byteSize),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="intake-${asset.id}"`,
    },
  });
}
