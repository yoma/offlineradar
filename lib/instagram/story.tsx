/**
 * Instagram story image (1080 × 1920): the post's first slide on the cream
 * brand canvas, with the website below it. Stories carry no caption and the
 * API cannot add a link sticker, so the address must be in the image itself.
 */

import { ImageResponse } from "next/og";
import sharp from "sharp";
import { instagramFormats } from "@/lib/brand/tokens";
import { igColors, INSTAGRAM_WEBSITE } from "@/lib/instagram/constants";
import { loadInstagramFontList } from "@/lib/instagram/render";

const STORY = instagramFormats.story;
const SLIDE_W = 880;
const SLIDE_H = 1100;

export async function renderStoryJpeg(firstSlideJpeg: Buffer): Promise<Buffer> {
  const fonts = await loadInstagramFontList();
  const slideSrc = `data:image/jpeg;base64,${firstSlideJpeg.toString("base64")}`;

  // Top ~220px and bottom ~300px sit under Instagram's own story UI.
  const element = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: STORY.width,
        height: STORY.height,
        backgroundColor: igColors.cream,
        // The slide already carries the logo; start below Instagram's header.
        paddingTop: 240,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slideSrc}
        width={SLIDE_W}
        height={SLIDE_H}
        alt=""
        style={{
          borderRadius: 20,
          boxShadow: "0 18px 40px rgba(47, 48, 53, 0.18)",
        }}
      />

      <div
        style={{
          display: "flex",
          marginTop: 48,
          fontFamily: "DM Sans",
          fontSize: 32,
          color: igColors.anthracite,
        }}
      >
        Meer info en inschrijven
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 10,
          fontFamily: "Bricolage Grotesque",
          fontWeight: 700,
          fontSize: 64,
          color: igColors.bordeaux,
        }}
      >
        {INSTAGRAM_WEBSITE}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontFamily: "DM Sans",
          fontWeight: 600,
          fontSize: 28,
          color: igColors.goldInk,
        }}
      >
        of tik op de link in onze bio
      </div>
    </div>
  );

  const png = Buffer.from(
    await new ImageResponse(element, {
      width: STORY.width,
      height: STORY.height,
      fonts,
    }).arrayBuffer(),
  );
  return sharp(png).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** Story render for new posts; null (render later, at publish) on failure. */
export async function renderStoryOrNull(firstSlideJpeg: Buffer): Promise<Buffer | null> {
  try {
    return await renderStoryJpeg(firstSlideJpeg);
  } catch (error) {
    console.warn(
      "[instagram/story] render failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
