/**
 * Stock footage as a full-bleed layer: the promo reels' clips and the
 * backdrops behind the event reels' hook and call to action.
 */

import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { PromoClip } from "../lib/instagram/promo/types";

/** A clip whose file was downloaded into the bundle's public folder before the render. */
export type FootageClip = PromoClip & { localFile?: string };

/** One clip, cover-cropped, with a slow push-in; photos get a Ken Burns move. */
export function Footage({ clip, frames, index }: { clip: FootageClip; frames: number; index: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / Math.max(1, frames);
  const style: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

  if (!clip.url) {
    // Studio sample without footage: a warm placeholder so the layout shows.
    const hue = 18 + index * 14;
    return (
      <AbsoluteFill
        style={{ background: `linear-gradient(${150 + index * 40}deg, hsl(${hue},45%,38%), hsl(${hue + 20},35%,18%))` }}
      />
    );
  }

  // Local copy first: stock sites refuse (HTTP 429) the many parallel
  // requests of a render, and their photo links expire.
  const src = clip.localFile ? staticFile(clip.localFile) : clip.url;

  if (clip.kind === "photo") {
    // Alternate the direction so consecutive stills do not drift the same way.
    const dir = index % 2 === 0 ? 1 : -1;
    const scale = interpolate(t, [0, 1], [1.08, 1.2]);
    const x = interpolate(t, [0, 1], [-18 * dir, 18 * dir]);
    const y = interpolate(t, [0, 1], [10, -14]);
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img src={src} style={{ ...style, transform: `scale(${scale}) translate(${x}px, ${y}px)` }} />
      </AbsoluteFill>
    );
  }

  // Skip the first half second when the clip is long enough (fade-ins, camera settling).
  const spare = clip.duration * fps - frames;
  const trimBefore = spare > fps ? Math.round(Math.min(spare / 2, fps * 0.5)) : 0;
  const scale = interpolate(t, [0, 1], [1.0, 1.05]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <OffthreadVideo
        src={src}
        muted
        trimBefore={trimBefore}
        style={{ ...style, transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
}
