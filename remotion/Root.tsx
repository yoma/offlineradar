import { Composition, type CalculateMetadataFunction } from "remotion";
import {
  REEL_FPS,
  REEL_HEIGHT,
  REEL_WIDTH,
  reelDurationInFrames,
  type ReelProps,
} from "../lib/instagram/reel/types";
import { promoDurationInFrames, type PromoReelProps } from "../lib/instagram/promo/types";
import { waitForBrandFonts } from "./fonts";
import { PromoReel, PromoStoryStill } from "./promo/PromoReel";
import { SAMPLE_PROMO_PROPS } from "./promo/sample-props";
import { Reel, ReelStoryStill } from "./Reel";
import { SAMPLE_REEL_PROPS } from "./sample-props";

waitForBrandFonts();

const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => ({
  durationInFrames: reelDurationInFrames(props.timing, props.layout, props.events.length),
});

const calculatePromoMetadata: CalculateMetadataFunction<PromoReelProps> = ({ props }) => ({
  durationInFrames: promoDurationInFrames(props.timing),
});

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="DateOfflineHubReel"
        component={Reel}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        fps={REEL_FPS}
        durationInFrames={REEL_FPS * 10}
        defaultProps={SAMPLE_REEL_PROPS}
        calculateMetadata={calculateMetadata}
      />
      {/* Rendered as one still at the cover frame (see reel/render.ts). */}
      <Composition
        id="DateOfflineHubReelStory"
        component={ReelStoryStill}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        fps={REEL_FPS}
        durationInFrames={REEL_FPS * 4}
        defaultProps={SAMPLE_REEL_PROPS}
      />
      {/* Weekly promo reel on stock footage (lib/instagram/promo). */}
      <Composition
        id="DateOfflineHubPromo"
        component={PromoReel}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        fps={REEL_FPS}
        durationInFrames={REEL_FPS * 12}
        defaultProps={SAMPLE_PROMO_PROPS}
        calculateMetadata={calculatePromoMetadata}
      />
      <Composition
        id="DateOfflineHubPromoStory"
        component={PromoStoryStill}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        fps={REEL_FPS}
        durationInFrames={REEL_FPS * 12}
        defaultProps={SAMPLE_PROMO_PROPS}
        calculateMetadata={calculatePromoMetadata}
      />
    </>
  );
}
