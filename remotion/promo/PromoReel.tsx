/**
 * DateOfflineHub promo reel, 1080x1920 at 30 fps: real footage (2 to 4 stock
 * clips, cross-faded) with a hook, a short line per clip and a call to action.
 * Deliberately unlike the event reels (solid colour, cards): this one is all
 * footage, warm and calm.
 *
 * Three templates:
 *   terras      footage full-bleed, big hook low in the frame, word by word
 *   magazine    footage in a cream passe-partout, text in the margin below
 *   ondertitel  footage full-bleed, centred lines like calm subtitles
 *
 * All text stays inside Instagram's safe zone: below the top 250 px, above
 * the bottom 360 px, and clear of the buttons on the right in the lower half.
 */

import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { brandColors } from "../../lib/brand/tokens";
import type { PromoReelProps } from "../../lib/instagram/promo/types";
import { Footage } from "../footage";
import { Eyes, Music } from "../Reel";
import { BODY, HEADING, MARGIN, SAFE_BOTTOM, SAFE_TOP, progress, rise } from "../theme";

const MARK = staticFile("brand/dateofflinehub-mark.png");
const W = 1080;
const H = 1920;
/** Instagram's like/comment/share column covers the right edge of the lower half. */
const BUTTONS_RIGHT = 150;
const CREAM = brandColors.cream;
const GOLD = brandColors.gold;
const INK = brandColors.anthracite;
const BORDEAUX = brandColors.bordeaux;

/* ------------------------------------------------------------------ */
/* Timeline                                                           */
/* ------------------------------------------------------------------ */

type Slot = { start: number; frames: number };

function clipSlots(props: PromoReelProps): Slot[] {
  const { clipFrames, overlapFrames } = props.timing;
  let from = 0;
  return clipFrames.map((frames) => {
    const slot = { start: from, frames };
    from += frames - overlapFrames;
    return slot;
  });
}

/** Text for clip i: the hook first, then one line per following clip. */
function textFor(props: PromoReelProps, i: number): string {
  return i === 0 ? props.hook : (props.lines[i - 1] ?? "");
}

/* ------------------------------------------------------------------ */
/* Footage                                                            */
/* ------------------------------------------------------------------ */

/** A soft warm grade so clips from different sources sit together. */
function WarmGrade() {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, rgba(255,196,140,0.10) 0%, rgba(255,170,120,0.06) 100%)",
        mixBlendMode: "soft-light",
      }}
    />
  );
}

/** All clips, cross-faded, filling `box` (full frame by default). */
function FootageTrack({ props, box }: { props: PromoReelProps; box?: CSSProperties }) {
  const slots = clipSlots(props);
  const { overlapFrames } = props.timing;
  return (
    <div style={{ position: "absolute", overflow: "hidden", inset: 0, ...box }}>
      {props.clips.map((clip, i) => {
        const slot = slots[i]!;
        return (
          <Sequence key={`${clip.source}-${clip.id}`} from={slot.start} durationInFrames={slot.frames} layout="none">
            <FadeIn frames={i === 0 ? 0 : overlapFrames}>
              <Footage clip={clip} frames={slot.frames} index={i} />
            </FadeIn>
          </Sequence>
        );
      })}
      <WarmGrade />
    </div>
  );
}

function FadeIn({ frames, children }: { frames: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = frames > 0 ? progress(frame, 0, frames) : 1;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                       */
/* ------------------------------------------------------------------ */

/** Font size so the text wraps to about `maxLines` lines in `width` px. */
function fitText(text: string, width: number, max: number, maxLines: number, charEm = 0.52): number {
  const chars = Math.max(text.length, 1);
  const perLine = Math.ceil(chars / maxLines) + 2;
  return Math.max(44, Math.min(max, Math.floor(width / (perLine * charEm))));
}

/** Words that rise in one after another. */
function WordReveal({ text, frame, delay = 0, step = 3, style }: {
  text: string;
  frame: number;
  delay?: number;
  step?: number;
  style?: CSSProperties;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.26em", ...style }}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} style={{ display: "inline-block", ...rise(frame, delay + i * step, 22, 14) }}>
          {word}
        </span>
      ))}
    </div>
  );
}

/** Fade a block out at the end of its slot so the next line can come in. */
function outFade(frame: number, frames: number, length = 10): number {
  return interpolate(frame, [frames - length, frames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Per clip: its text, shown during that clip (except the CTA tail of the last one). */
function TextTrack({ props, render }: {
  props: PromoReelProps;
  render: (text: string, index: number, frames: number) => ReactNode;
}) {
  const slots = clipSlots(props);
  const last = slots.length - 1;
  return (
    <>
      {slots.map((slot, i) => {
        const text = textFor(props, i);
        if (!text) return null;
        // Text of the last clip gives way to the call to action.
        const frames = i === last ? Math.max(30, slot.frames - props.timing.ctaFrames) : slot.frames;
        // Start after the cross-fade so two lines never overlap.
        const offset = i === 0 ? 0 : Math.round(props.timing.overlapFrames / 2);
        return (
          <Sequence key={i} from={slot.start + offset} durationInFrames={frames - offset} layout="none">
            {render(text, i, frames - offset)}
          </Sequence>
        );
      })}
    </>
  );
}

function ctaStart(props: PromoReelProps): number {
  const slots = clipSlots(props);
  const last = slots[slots.length - 1]!;
  return last.start + last.frames - props.timing.ctaFrames;
}

function Mark({ size, style }: { size: number; style?: CSSProperties }) {
  return <Img src={MARK} style={{ width: size, height: size * 0.77, objectFit: "contain", ...style }} />;
}

function Kicker({ color, frame, style }: { color: string; frame: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        ...rise(frame, 0, 12, 12),
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: BODY,
        fontWeight: 600,
        fontSize: 24,
        letterSpacing: 24 * 0.16,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      DateOfflineHub
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template A: terras                                                 */
/* ------------------------------------------------------------------ */

const TERRAS_TEXT_WIDTH = W - MARGIN - BUTTONS_RIGHT;

function TerrasText({ text, index, frames }: { text: string; index: number; frames: number }) {
  const frame = useCurrentFrame();
  const hook = index === 0;
  const size = hook ? fitText(text, TERRAS_TEXT_WIDTH, 108, 3, 0.56) : fitText(text, TERRAS_TEXT_WIDTH, 84, 2);
  return (
    <div
      style={{
        position: "absolute",
        left: MARGIN,
        width: TERRAS_TEXT_WIDTH,
        bottom: SAFE_BOTTOM + 90,
        opacity: outFade(frame, frames),
      }}
    >
      {hook ? (
        <div
          style={{
            ...rise(frame, 0, 10, 12),
            width: interpolate(progress(frame, 2, 20), [0, 1], [0, 120]),
            height: 3,
            background: GOLD,
            marginBottom: 30,
          }}
        />
      ) : null}
      <WordReveal
        text={text}
        frame={frame}
        delay={hook ? 4 : 2}
        step={hook ? 4 : 3}
        style={{
          fontFamily: HEADING,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.04,
          letterSpacing: -size * 0.025,
          color: CREAM,
          textShadow: "0 2px 18px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}

function TerrasCta({ props }: { props: PromoReelProps }) {
  const frame = useCurrentFrame();
  const veil = progress(frame, 0, 14);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(30,16,20,${0.5 * veil})` }} />
      <div
        style={{
          position: "absolute",
          left: MARGIN,
          right: MARGIN,
          top: SAFE_TOP,
          bottom: SAFE_BOTTOM,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Mark size={190} style={rise(frame, 4, 20)} />
        <div style={{ ...rise(frame, 8), fontFamily: BODY, fontSize: 38, color: CREAM, marginTop: 56 }}>
          {props.cta.lead}
        </div>
        <div
          style={{
            ...rise(frame, 11),
            fontFamily: HEADING,
            fontWeight: 700,
            fontSize: 96,
            letterSpacing: -3,
            color: GOLD,
            marginTop: 14,
          }}
        >
          {props.cta.website}
        </div>
        <div
          style={{
            width: interpolate(progress(frame, 14, 20), [0, 1], [0, 220]),
            height: 2,
            background: "rgba(249,242,234,0.6)",
            marginTop: 40,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function Terras(props: PromoReelProps) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: INK }}>
      <FootageTrack props={props} />
      {/* Legibility: a soft dark floor under the text, a light veil at the top. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(20,12,14,0.35) 0%, rgba(20,12,14,0) 22%, rgba(20,12,14,0) 42%, rgba(20,12,14,0.55) 68%, rgba(20,12,14,0.78) 100%)",
        }}
      />
      <div style={{ position: "absolute", left: MARGIN, top: SAFE_TOP }}>
        <Kicker color={CREAM} frame={frame} style={{ opacity: 0.9 }} />
      </div>
      <TextTrack props={props} render={(text, i, frames) => <TerrasText text={text} index={i} frames={frames} />} />
      <Sequence from={ctaStart(props)} layout="none">
        <TerrasCta props={props} />
      </Sequence>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* Template B: magazine                                               */
/* ------------------------------------------------------------------ */

const MAG_SIDE = 64;
const MAG_TOP = SAFE_TOP + 70;
const MAG_PHOTO_BOTTOM = 700;
const MAG_TEXT_WIDTH = W - MAG_SIDE - BUTTONS_RIGHT;

function MagazineText({ text, index, frames }: { text: string; index: number; frames: number }) {
  const frame = useCurrentFrame();
  const hook = index === 0;
  const size = hook ? fitText(text, MAG_TEXT_WIDTH, 92, 3) : fitText(text, MAG_TEXT_WIDTH, 76, 2);
  return (
    <div
      style={{
        position: "absolute",
        left: MAG_SIDE,
        width: MAG_TEXT_WIDTH,
        top: H - MAG_PHOTO_BOTTOM + 44,
        opacity: outFade(frame, frames),
      }}
    >
      <WordReveal
        text={text}
        frame={frame}
        delay={2}
        step={3}
        style={{
          fontFamily: HEADING,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.05,
          letterSpacing: -size * 0.025,
          color: INK,
        }}
      />
    </div>
  );
}

function MagazineCta({ props }: { props: PromoReelProps }) {
  const frame = useCurrentFrame();
  // The cream paper closes over the photo from the bottom.
  const cover = progress(frame, 0, 18);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: `${cover * 100}%`,
          background: CREAM,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: MARGIN,
          right: MARGIN,
          top: SAFE_TOP,
          bottom: SAFE_BOTTOM,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <Mark size={200} style={{ ...rise(frame, 10, 20), marginLeft: -8 }} />
        <div style={{ ...rise(frame, 13), height: 1.5, background: "rgba(47,48,53,0.7)", marginTop: 60 }} />
        <div style={{ ...rise(frame, 15), fontFamily: BODY, fontSize: 38, color: "rgba(47,48,53,0.74)", marginTop: 40 }}>
          {props.cta.lead}
        </div>
        <div
          style={{
            ...rise(frame, 17),
            fontFamily: HEADING,
            fontWeight: 700,
            fontSize: 100,
            letterSpacing: -3,
            color: BORDEAUX,
            marginTop: 12,
          }}
        >
          {props.cta.website}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Magazine(props: PromoReelProps) {
  const frame = useCurrentFrame();
  const issue = progress(frame, 2, 20);
  return (
    <AbsoluteFill style={{ background: CREAM }}>
      {/* Masthead */}
      <div
        style={{
          position: "absolute",
          left: MAG_SIDE,
          right: MAG_SIDE,
          top: SAFE_TOP,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Kicker color={INK} frame={frame} />
        <div style={{ ...rise(frame, 2, 12, 12), fontFamily: BODY, fontSize: 24, color: "rgba(47,48,53,0.52)" }}>
          offline daten
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: MAG_SIDE,
          top: SAFE_TOP + 46,
          height: 1.5,
          width: (W - 2 * MAG_SIDE) * issue,
          background: "rgba(47,48,53,0.7)",
        }}
      />
      {/* The photo in its passe-partout */}
      <FootageTrack
        props={props}
        box={{ left: MAG_SIDE, right: MAG_SIDE, top: MAG_TOP, bottom: MAG_PHOTO_BOTTOM, inset: undefined }}
      />
      <TextTrack props={props} render={(text, i, frames) => <MagazineText text={text} index={i} frames={frames} />} />
      <Sequence from={ctaStart(props)} layout="none">
        <MagazineCta props={props} />
      </Sequence>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* Template C: ondertitel                                             */
/* ------------------------------------------------------------------ */

const SUB_WIDTH = W - 2 * MARGIN - 40;

function SubtitleText({ text, index, frames }: { text: string; index: number; frames: number }) {
  const frame = useCurrentFrame();
  const hook = index === 0;
  const size = hook ? fitText(text, SUB_WIDTH, 78, 3, 0.5) : fitText(text, SUB_WIDTH, 64, 2, 0.5);
  const p = progress(frame, 0, 16);
  return (
    <div
      style={{
        position: "absolute",
        left: (W - SUB_WIDTH) / 2,
        width: SUB_WIDTH,
        top: 820,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        opacity: p * outFade(frame, frames, 12),
        transform: `translateY(${(1 - p) * 12}px)`,
      }}
    >
      <div style={{ width: 56, height: 2, background: GOLD, marginBottom: 30 }} />
      <div
        style={{
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: size,
          lineHeight: 1.22,
          color: CREAM,
          textShadow: "0 2px 22px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.35)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function SubtitleCta({ props }: { props: PromoReelProps }) {
  const frame = useCurrentFrame();
  const bg = progress(frame, 0, 16);
  return (
    <AbsoluteFill style={{ background: BORDEAUX, opacity: bg }}>
      <div
        style={{
          position: "absolute",
          left: MARGIN,
          right: MARGIN,
          top: SAFE_TOP,
          bottom: SAFE_BOTTOM,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Mark size={210} style={rise(frame, 8, 20)} />
        <div style={{ ...rise(frame, 12), fontFamily: BODY, fontSize: 38, color: "rgba(249,242,234,0.74)", marginTop: 60 }}>
          {props.cta.lead}
        </div>
        <div
          style={{
            ...rise(frame, 14),
            fontFamily: HEADING,
            fontWeight: 700,
            fontSize: 96,
            letterSpacing: -3,
            color: GOLD,
            marginTop: 14,
          }}
        >
          {props.cta.website}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Ondertitel(props: PromoReelProps) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: INK }}>
      <FootageTrack props={props} />
      {/* Calm vignette: darker toward the middle band where the lines sit. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 40% at 50% 50%, rgba(15,10,12,0.42) 0%, rgba(15,10,12,0.18) 60%, rgba(15,10,12,0.08) 100%)",
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: SAFE_TOP, display: "flex", justifyContent: "center" }}>
        <Kicker color={CREAM} frame={frame} style={{ opacity: 0.85 }} />
      </div>
      <TextTrack props={props} render={(text, i, frames) => <SubtitleText text={text} index={i} frames={frames} />} />
      <Sequence from={ctaStart(props)} layout="none">
        <SubtitleCta props={props} />
      </Sequence>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* Composition                                                        */
/* ------------------------------------------------------------------ */

const TEMPLATES = { terras: Terras, magazine: Magazine, ondertitel: Ondertitel } as const;

export function PromoReel(props: PromoReelProps) {
  const Template = TEMPLATES[props.template] ?? Terras;
  return (
    <AbsoluteFill>
      <Template {...props} />
      {props.music ? <Music music={props.music} /> : null}
    </AbsoluteFill>
  );
}

/** Frame used for the cover and the story still: the hook, fully on screen. */
export function promoCoverFrame(props: PromoReelProps): number {
  return Math.max(0, (props.timing.clipFrames[0] ?? 60) - 30);
}

/**
 * Story still for when the video story fails: the cover frame with
 * "Nieuwe reel 👀 bekijk ons profiel" above Instagram's reply bar.
 */
export function PromoStoryStill(props: PromoReelProps) {
  const Template = TEMPLATES[props.template] ?? Terras;
  return (
    <AbsoluteFill>
      <Template {...props} />
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: 300, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "26px 44px",
            borderRadius: 999,
            // Cream pill on footage, bordeaux on the cream magazine page.
            background: props.template === "magazine" ? BORDEAUX : CREAM,
            color: props.template === "magazine" ? CREAM : BORDEAUX,
            fontFamily: HEADING,
            fontWeight: 700,
            fontSize: 50,
            letterSpacing: -1,
            boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
          }}
        >
          <span>Nieuwe reel</span>
          <Eyes size={62} />
          <span>bekijk ons profiel</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
