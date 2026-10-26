import { Composition, type CalculateMetadataFunction } from "remotion";
import {
  REEL_FPS,
  REEL_HEIGHT,
  REEL_WIDTH,
  reelDurationInFrames,
  type ReelProps,
} from "../lib/instagram/reel/types";
import { waitForBrandFonts } from "./fonts";
import { Reel, ReelStoryStill } from "./Reel";
import { SAMPLE_REEL_PROPS } from "./sample-props";

waitForBrandFonts();

const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => ({
  durationInFrames: reelDurationInFrames(props.timing, props.layout, props.events.length),
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
    </>
  );
}
