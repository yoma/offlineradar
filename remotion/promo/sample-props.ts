/**
 * Default props for `npm run reel:studio` (DateOfflineHubPromo). No footage:
 * the clips are placeholders so the layout and text can be judged offline.
 * Real reels come from `npm run promo:test`.
 */

import type { PromoClip, PromoReelProps } from "../../lib/instagram/promo/types";

const placeholder = (id: string, query: string): PromoClip => ({
  source: "pexels",
  id,
  kind: "photo",
  url: "",
  width: 1080,
  height: 1920,
  duration: 0,
  pageUrl: "",
  author: "",
  query,
});

export const SAMPLE_PROMO_PROPS: PromoReelProps = {
  template: "terras",
  hook: "Swipen beu? Ontmoet mensen in het echt.",
  lines: ["Een glas, een gesprek, een lach.", "Alle singles-events op één plek."],
  clips: [
    placeholder("sample-1", "friends laughing terrace"),
    placeholder("sample-2", "couple talking cafe"),
    placeholder("sample-3", "people walking city evening"),
  ],
  timing: { clipFrames: [135, 114, 198], overlapFrames: 18, ctaFrames: 84 },
  cta: { lead: "Ontdek alle events op", website: "dateofflinehub.be" },
  music: null,
};
