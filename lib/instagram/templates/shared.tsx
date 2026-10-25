/**
 * Shared Instagram chrome, "agenda" style.
 *
 * Design intent: read like a city magazine listings page, not a generated
 * poster. Solid colour fields, a strict left edge, large type, hairline rules,
 * one accent colour per slide. No gradients, no glow, no photo washes, no
 * pill buttons (Instagram images are not clickable).
 *
 * Satori-safe CSS only: every element is display:flex.
 */

import {
  IG_FEED,
  INSTAGRAM_WEBSITE,
  igColors,
} from "@/lib/instagram/constants";

/** Outer margin on every slide (also the left text edge). */
export const IG_MARGIN = 72;

export type SlideTone = "bordeaux" | "cream";

/** Colour roles per tone. Keep one accent per slide. */
export function tonePalette(tone: SlideTone) {
  if (tone === "bordeaux") {
    return {
      bg: igColors.bordeaux,
      ink: igColors.cream,
      inkSoft: "rgba(249,242,234,0.72)",
      inkFaint: "rgba(249,242,234,0.5)",
      accent: igColors.gold,
      rule: "rgba(249,242,234,0.2)",
      ruleStrong: "rgba(249,242,234,0.55)",
    };
  }
  return {
    bg: igColors.cream,
    ink: igColors.anthracite,
    inkSoft: "rgba(47,48,53,0.74)",
    inkFaint: "rgba(47,48,53,0.52)",
    accent: igColors.bordeaux,
    rule: "rgba(47,48,53,0.16)",
    ruleStrong: "rgba(47,48,53,0.7)",
  };
}

export function slideStyle(tone: SlideTone) {
  const p = tonePalette(tone);
  return {
    width: IG_FEED.width,
    height: IG_FEED.height,
    display: "flex" as const,
    flexDirection: "column" as const,
    fontFamily: "DM Sans",
    color: p.ink,
    position: "relative" as const,
    overflow: "hidden" as const,
    background: p.bg,
  };
}

/** Small tracked uppercase label (kickers, column labels). */
export function Label({
  children,
  color,
  size = 20,
}: {
  children: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "DM Sans",
        fontWeight: 600,
        fontSize: size,
        letterSpacing: size * 0.16,
        textTransform: "uppercase" as const,
        color,
      }}
    >
      {children}
    </div>
  );
}

export function Rule({
  color,
  thickness = 1,
  marginTop = 0,
}: {
  color: string;
  thickness?: number;
  marginTop?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: thickness,
        background: color,
        marginTop,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Masthead: the bubble mark only (no repeated wordmark image), the name set
 * as small caps, and an optional right-hand label (section or slide count).
 */
export function Masthead({
  markSrc,
  tone,
  right,
}: {
  markSrc: string;
  tone: SlideTone;
  right?: string;
}) {
  const p = tonePalette(tone);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          paddingBottom: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={markSrc}
            width={62}
            height={48}
            style={{ objectFit: "contain" }}
            alt=""
          />
          <Label color={p.ink} size={21}>
            DateOfflineHub
          </Label>
        </div>
        {right ? (
          <Label color={p.inkFaint} size={21}>
            {right}
          </Label>
        ) : null}
      </div>
      <Rule color={p.ruleStrong} />
    </div>
  );
}

/** Bottom line on every slide: what to do + where. */
export function Colophon({
  tone,
  action,
}: {
  tone: SlideTone;
  action: string;
}) {
  const p = tonePalette(tone);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginTop: "auto",
        flexShrink: 0,
      }}
    >
      <Rule color={p.ruleStrong} />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          paddingTop: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 25,
            color: p.inkSoft,
            fontFamily: "DM Sans",
          }}
        >
          {action}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 25,
            fontWeight: 600,
            color: p.accent,
            fontFamily: "DM Sans",
          }}
        >
          {INSTAGRAM_WEBSITE}
        </div>
      </div>
    </div>
  );
}
