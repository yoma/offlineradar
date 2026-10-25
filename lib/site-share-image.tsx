/**
 * Default share image (WhatsApp, Facebook, LinkedIn, X) for pages without
 * their own image. Rendered at build time by app/opengraph-image.tsx and
 * app/twitter-image.tsx.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };
export const SHARE_IMAGE_ALT =
  "DateOfflineHub: singlesevents en activiteiten om in het echt te ontmoeten";

export async function renderSiteShareImage(): Promise<ImageResponse> {
  const [mark, heading, body] = await Promise.all([
    readFile(join(process.cwd(), "public/brand/dateofflinehub-mark.png")),
    readFile(
      join(process.cwd(), "assets/fonts/bricolage-grotesque-latin-700-normal.woff"),
    ),
    readFile(join(process.cwd(), "assets/fonts/dm-sans-latin-400-normal.woff")),
  ]);
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#f9f2ea",
          color: "#2f3035",
          fontFamily: "DM Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={96} height={74} alt="" />
          <div style={{ display: "flex", fontFamily: "Bricolage Grotesque", fontSize: 36, color: "#86691f" }}>
            DateOfflineHub
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: 104,
              lineHeight: 1,
              letterSpacing: -3,
              color: "#67283a",
            }}
          >
            Date offline.
          </div>
          <div style={{ display: "flex", fontSize: 38, marginTop: 24, color: "#5c5d63" }}>
            Singlesevents en activiteiten om in het echt te ontmoeten.
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage Grotesque", fontSize: 28, color: "#86691f" }}>
          dateofflinehub.be
        </div>
      </div>
    ),
    {
      ...SHARE_IMAGE_SIZE,
      fonts: [
        { name: "Bricolage Grotesque", data: heading, weight: 700, style: "normal" },
        { name: "DM Sans", data: body, weight: 400, style: "normal" },
      ],
    },
  );
}
