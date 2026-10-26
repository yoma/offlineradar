/**
 * DateOfflineHub reel, 1080x1920 at 30 fps.
 *
 * Hook (first second) → events (one card each, one agenda page, or one
 * uitgelicht event) → call to action. Same "agenda" look as the feed slides:
 * solid colour, a strict left edge, large type, hairline rules. Scenes
 * cross-fade; elements only fade and rise a little.
 */

import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ReelEvent, ReelProps } from "../lib/instagram/reel/types";
import {
  BODY,
  HEADING,
  MARGIN,
  SAFE_BOTTOM,
  SAFE_TOP,
  palette,
  progress,
  rise,
  type Tone,
} from "./theme";

const MARK = staticFile("brand/dateofflinehub-mark.png");

/* ------------------------------------------------------------------ */
/* Building blocks                                                    */
/* ------------------------------------------------------------------ */

function Label({ children, color, size = 24, style }: {
  children: ReactNode;
  color: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 600,
        fontSize: size,
        letterSpacing: size * 0.16,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Rule({ color, style }: { color: string; style?: CSSProperties }) {
  return <div style={{ height: 1.5, width: "100%", background: color, ...style }} />;
}

function Masthead({ tone, right, frame }: { tone: Tone; right?: string; frame: number }) {
  const p = palette(tone);
  const ruleWidth = progress(frame, 2, 22);
  return (
    <div style={{ ...rise(frame, 0, 12), width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Img src={MARK} style={{ width: 70, height: 54, objectFit: "contain" }} />
          <Label color={p.ink} size={24}>DateOfflineHub</Label>
        </div>
        {right ? <Label color={p.inkFaint} size={24}>{right}</Label> : null}
      </div>
      <Rule color={p.ruleStrong} style={{ width: `${ruleWidth * 100}%` }} />
    </div>
  );
}

/** Full-bleed scene with the safe margins; fades in when it is not the first. */
function Scene({ tone, fadeIn, children }: { tone: Tone; fadeIn: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = fadeIn > 0 ? progress(frame, 0, fadeIn) : 1;
  return (
    <AbsoluteFill style={{ background: palette(tone).bg, opacity }}>
      <div
        style={{
          position: "absolute",
          left: MARGIN,
          right: MARGIN,
          top: SAFE_TOP,
          bottom: SAFE_BOTTOM,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

/** Font size so the longest line fits the text width (Bricolage ~0.52em/char). */
function fitSize(lines: string[], max: number, width = 1080 - 2 * MARGIN): number {
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return Math.min(max, Math.floor(width / (longest * 0.53)));
}

/* ------------------------------------------------------------------ */
/* Scenes                                                             */
/* ------------------------------------------------------------------ */

function HookScene({ props }: { props: ReelProps }) {
  const frame = useCurrentFrame();
  const p = palette("bordeaux");
  const [lead = "", ...rest] = props.hook.lines;
  const leadSize = fitSize([lead], 128);
  const restSize = Math.min(leadSize, fitSize(rest, 80));
  return (
    <Scene tone="bordeaux" fadeIn={0}>
      <Masthead tone="bordeaux" frame={frame} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto" }}>
        <Label color={p.accent} size={28} style={rise(frame, 0, 18, 12)}>
          {props.hookKicker}
        </Label>
        {props.hook.count ? (
          <div
            style={{
              ...rise(frame, 2, 30, 14),
              fontFamily: HEADING,
              fontWeight: 700,
              fontSize: 380,
              lineHeight: 0.82,
              letterSpacing: -16,
              color: p.accent,
              marginTop: 28,
            }}
          >
            {props.hook.count}
          </div>
        ) : null}
        <div style={{ marginTop: props.hook.count ? 34 : 30 }}>
          {props.hook.lines.map((line, i) => (
            <div
              key={line}
              style={{
                ...rise(frame, 5 + i * 4, 24, 14),
                fontFamily: HEADING,
                fontWeight: 700,
                fontSize: i === 0 ? leadSize : restSize,
                lineHeight: 1.04,
                letterSpacing: -(i === 0 ? leadSize : restSize) * 0.03,
                color: i === 0 ? p.ink : p.inkSoft,
                marginTop: i === 1 ? 14 : 0,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </Scene>
  );
}

function FactRows({ event, tone, frame, delay }: {
  event: ReelEvent;
  tone: Tone;
  frame: number;
  delay: number;
}) {
  const p = palette(tone);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {event.facts.map((f, i) => (
        <div key={f.label} style={rise(frame, delay + i * 4, 16, 14)}>
          <Rule color={p.rule} />
          <div style={{ display: "flex", alignItems: "center", padding: "20px 0" }}>
            <div style={{ width: 250, flexShrink: 0 }}>
              <Label color={p.inkFaint} size={22}>{f.label}</Label>
            </div>
            <div style={{ fontFamily: BODY, fontSize: 34, color: p.ink }}>{f.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventCardScene({ props, event, index, single, fadeIn }: {
  props: ReelProps;
  event: ReelEvent;
  index: number;
  single: boolean;
  fadeIn: number;
}) {
  const frame = useCurrentFrame();
  const tone: Tone = "cream";
  const p = palette(tone);
  const right = single ? props.sectionLabel : `${index + 1} / ${props.events.length}`;
  const titleSize = event.title.length > 36 ? 70 : event.title.length > 24 ? 80 : 92;
  return (
    <Scene tone={tone} fadeIn={fadeIn}>
      <Masthead tone={tone} right={right} frame={frame} />
      <Label color={p.accent} size={26} style={{ ...rise(frame, 4), marginTop: 70 }}>
        {event.activity ?? props.sectionLabel}
      </Label>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 34, marginTop: 18 }}>
        <div
          style={{
            ...rise(frame, 6, 30),
            fontFamily: HEADING,
            fontWeight: 700,
            fontSize: 300,
            lineHeight: 0.8,
            letterSpacing: -12,
            color: p.accent,
          }}
        >
          {event.day}
        </div>
        <div style={{ ...rise(frame, 9), display: "flex", flexDirection: "column", paddingBottom: 4 }}>
          <div style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 54, lineHeight: 1.06, color: p.ink }}>
            {event.weekday}
          </div>
          <div style={{ fontFamily: BODY, fontSize: 54, lineHeight: 1.06, color: p.inkSoft }}>
            {event.month}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 54, lineHeight: 1.06, color: p.ink }}>
            {event.time}
          </div>
        </div>
      </div>
      <div
        style={{
          ...rise(frame, 12),
          fontFamily: HEADING,
          fontWeight: 700,
          fontSize: titleSize,
          lineHeight: 1.04,
          letterSpacing: -titleSize * 0.02,
          color: p.ink,
          marginTop: 54,
        }}
      >
        {event.title}
      </div>
      {single && event.blurb ? (
        <div
          style={{
            ...rise(frame, 16),
            fontFamily: BODY,
            fontSize: 34,
            lineHeight: 1.4,
            color: p.inkSoft,
            marginTop: 26,
          }}
        >
          {event.blurb}
        </div>
      ) : null}
      <div style={{ marginTop: 64 }}>
        <FactRows event={event} tone={tone} frame={frame} delay={16} />
      </div>
    </Scene>
  );
}

function ListingScene({ props, fadeIn }: { props: ReelProps; fadeIn: number }) {
  const frame = useCurrentFrame();
  const tone: Tone = "cream";
  const p = palette(tone);
  const events = props.events.slice(0, 7);
  const dense = events.length > 5;
  return (
    <Scene tone={tone} fadeIn={fadeIn}>
      <Masthead tone={tone} right={props.sectionLabel} frame={frame} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: dense ? 40 : 64 }}>
        {events.map((event, i) => (
          <div key={event.id} style={rise(frame, 8 + i * 12, 22, 16)}>
            {i > 0 ? <Rule color={p.rule} /> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 34, padding: dense ? "22px 0" : "30px 0" }}>
              <div style={{ width: 128, flexShrink: 0, display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    fontFamily: HEADING,
                    fontWeight: 700,
                    fontSize: dense ? 76 : 92,
                    lineHeight: 0.9,
                    letterSpacing: -3,
                    color: p.accent,
                  }}
                >
                  {event.day}
                </div>
                <Label color={p.inkFaint} size={20} style={{ marginTop: 8 }}>
                  {`${event.weekdayShort} ${event.monthShort}`}
                </Label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: HEADING,
                    fontWeight: 700,
                    fontSize: dense ? 40 : 46,
                    lineHeight: 1.08,
                    color: p.ink,
                  }}
                >
                  {event.title}
                </div>
                <div style={{ fontFamily: BODY, fontSize: dense ? 26 : 28, color: p.inkSoft, marginTop: 8 }}>
                  {event.meta}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Scene>
  );
}

function CtaScene({ props, fadeIn }: { props: ReelProps; fadeIn: number }) {
  const frame = useCurrentFrame();
  const p = palette("bordeaux");
  return (
    <Scene tone="bordeaux" fadeIn={fadeIn}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto" }}>
        <Img
          src={MARK}
          style={{ ...rise(frame, 4, 20), width: 230, height: 177, objectFit: "contain", marginLeft: -8 }}
        />
        <Label color={p.inkSoft} size={28} style={{ ...rise(frame, 8), marginTop: 64 }}>
          Meer info en inschrijven
        </Label>
        <div
          style={{
            ...rise(frame, 11),
            fontFamily: HEADING,
            fontWeight: 700,
            fontSize: 100,
            lineHeight: 1,
            letterSpacing: -3,
            color: p.accent,
            marginTop: 20,
          }}
        >
          {props.website}
        </div>
        <div style={{ ...rise(frame, 14), fontFamily: BODY, fontSize: 36, color: p.ink, marginTop: 22 }}>
          of via de link in onze bio
        </div>
        <Rule color={p.rule} style={{ ...rise(frame, 18), marginTop: 70 }} />
        <div style={{ ...rise(frame, 20), fontFamily: BODY, fontSize: 32, color: p.inkFaint, marginTop: 26 }}>
          {props.slogan}
        </div>
      </div>
    </Scene>
  );
}

/* ------------------------------------------------------------------ */
/* Composition                                                        */
/* ------------------------------------------------------------------ */

function Music({ music }: { music: NonNullable<ReelProps["music"]> }) {
  const { fps, durationInFrames } = useVideoConfig();
  const fadeIn = Math.max(1, Math.round(music.fadeInSeconds * fps));
  const fadeOut = Math.max(1, Math.round(music.fadeOutSeconds * fps));
  return (
    <Html5Audio
      src={staticFile(music.src)}
      volume={(f) =>
        music.volume *
        interpolate(
          f,
          [0, fadeIn, durationInFrames - fadeOut, durationInFrames - 1],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      }
    />
  );
}

export function Reel(props: ReelProps) {
  const { hookFrames, bodyFrames, ctaFrames, overlapFrames } = props.timing;
  const body =
    props.layout === "cards"
      ? props.events.map((event, i) => ({
          key: event.id,
          node: (
            <EventCardScene props={props} event={event} index={i} single={false} fadeIn={overlapFrames} />
          ),
        }))
      : [
          {
            key: "body",
            node:
              props.layout === "listing" ? (
                <ListingScene props={props} fadeIn={overlapFrames} />
              ) : (
                <EventCardScene props={props} event={props.events[0]!} index={0} single fadeIn={overlapFrames} />
              ),
          },
        ];

  const scenes = [
    { key: "hook", frames: hookFrames, node: <HookScene props={props} /> },
    ...body.map((b) => ({ ...b, frames: bodyFrames })),
    { key: "cta", frames: ctaFrames, node: <CtaScene props={props} fadeIn={overlapFrames} /> },
  ];

  let from = 0;
  return (
    <AbsoluteFill style={{ background: palette("bordeaux").bg }}>
      {scenes.map((scene) => {
        const start = from;
        from += scene.frames - overlapFrames;
        return (
          <Sequence key={scene.key} from={start} durationInFrames={scene.frames} layout="none">
            {scene.node}
          </Sequence>
        );
      })}
      {props.music ? <Music music={props.music} /> : null}
    </AbsoluteFill>
  );
}
