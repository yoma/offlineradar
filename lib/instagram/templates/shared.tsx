/**
 * Shared Instagram slide chrome (logo, website, gold accents).
 * JSX is consumed by next/og ImageResponse (Satori subset of CSS).
 */

import {
  IG_FEED,
  INSTAGRAM_SLOGAN,
  INSTAGRAM_WEBSITE,
  igColors,
} from "@/lib/instagram/constants";

export const slideStyle = {
  width: IG_FEED.width,
  height: IG_FEED.height,
  display: "flex" as const,
  flexDirection: "column" as const,
  fontFamily: "DM Sans",
  color: igColors.anthracite,
};

export function GoldRule({ width = "100%" }: { width?: number | string }) {
  return (
    <div
      style={{
        display: "flex",
        width,
        height: 2,
        background: `linear-gradient(90deg, ${igColors.goldDeep}, ${igColors.gold}, ${igColors.goldLight})`,
        borderRadius: 2,
      }}
    />
  );
}

export function SlideFooter({
  showSlogan = false,
}: {
  showSlogan?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        marginTop: "auto",
        paddingTop: 24,
      }}
    >
      <GoldRule width={180} />
      {showSlogan ? (
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: igColors.bordeaux,
            fontFamily: "DM Sans",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {INSTAGRAM_SLOGAN}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          fontSize: 28,
          letterSpacing: 1.5,
          color: igColors.goldDeep,
          fontFamily: "DM Sans",
          fontWeight: 600,
        }}
      >
        {INSTAGRAM_WEBSITE}
      </div>
    </div>
  );
}

export function LogoHeader({
  logoSrc,
  compact = false,
}: {
  logoSrc: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: compact ? 18 : 28,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        width={compact ? 280 : 420}
        height={compact ? 90 : 135}
        style={{
          objectFit: "contain",
        }}
        alt="DateOfflineHub"
      />
    </div>
  );
}

export function MetaChip({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 18px",
        borderRadius: 999,
        border: `1.5px solid ${igColors.gold}`,
        background: igColors.goldSoft,
        color: igColors.goldInk,
        fontSize: 22,
        fontWeight: 600,
        fontFamily: "DM Sans",
      }}
    >
      {children}
    </div>
  );
}
