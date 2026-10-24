/**
 * Shared Instagram chrome — cream-first like the website.
 * Official logo + website on every slide. Satori-safe CSS only.
 */

import {
  IG_FEED,
  INSTAGRAM_HANDLE,
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
  position: "relative" as const,
  overflow: "hidden" as const,
  background: igColors.cream,
};

/**
 * Top brand row: official logo (square asset → display large) + wordmark + slogan.
 * Logo file is ~1:1; size by height so it stays readable on phone.
 */
export function BrandHeader({
  logoSrc,
  light = false,
}: {
  logoSrc: string;
  /** true = on photo; false = on cream (website default). */
  light?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 18,
        width: "100%",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        width={168}
        height={168}
        style={{ objectFit: "contain", flexShrink: 0 }}
        alt="DateOfflineHub"
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          gap: 6,
          paddingLeft: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 36,
            fontWeight: 700,
            color: light ? igColors.cream : igColors.bordeaux,
            lineHeight: 1.05,
            letterSpacing: -0.4,
          }}
        >
          DateOfflineHub
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            lineHeight: 1.35,
            color: light ? "rgba(249,242,234,0.95)" : igColors.bordeaux,
            fontFamily: "DM Sans",
            fontWeight: 500,
            opacity: 0.92,
          }}
        >
          {INSTAGRAM_SLOGAN}
        </div>
      </div>
    </div>
  );
}

/** Bottom bar: website + handle (every slide). */
export function BrandFooter({
  light = false,
  /** When false, footer sits tight under content (no flex push). */
  pushDown = true,
}: {
  light?: boolean;
  pushDown?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        marginTop: pushDown ? "auto" : 8,
        paddingTop: 16,
        paddingBottom: 6,
        borderTop: `1px solid ${
          light ? igColors.lineGold : "rgba(103,40,58,0.18)"
        }`,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 24,
          fontWeight: 600,
          color: light ? igColors.gold : igColors.goldDeep,
          fontFamily: "DM Sans",
          letterSpacing: 0.4,
        }}
      >
        {INSTAGRAM_WEBSITE}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          fontWeight: 600,
          color: light ? "rgba(249,242,234,0.9)" : igColors.bordeaux,
          fontFamily: "DM Sans",
        }}
      >
        {INSTAGRAM_HANDLE}
      </div>
    </div>
  );
}

export function GoldPill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 18px",
        borderRadius: 999,
        background: igColors.gold,
        color: igColors.bordeaux,
        fontSize: 18,
        fontWeight: 700,
        fontFamily: "DM Sans",
        letterSpacing: 1.2,
        textTransform: "uppercase" as const,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Elegant gold accent line — not a large clickable-looking button.
 * Instagram images are not interactive.
 */
export function GoldCta({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        gap: 10,
        paddingTop: 4,
        paddingBottom: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 120,
          height: 2,
          background: igColors.gold,
          borderRadius: 2,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: igColors.goldDeep,
          fontSize: 20,
          fontWeight: 600,
          fontFamily: "DM Sans",
          letterSpacing: 0.2,
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Category labels as quiet text — not pill buttons. */
export function CategoryIconRow() {
  const items = [
    "Drinks",
    "Sport",
    "Speeddates",
    "Diners",
    "Feestjes",
    "Reizen",
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        gap: 14,
        marginTop: 14,
        flexWrap: "wrap" as const,
      }}
    >
      {items.map((label, i) => (
        <div
          key={label}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          {i > 0 ? (
            <div
              style={{
                display: "flex",
                width: 4,
                height: 4,
                borderRadius: 4,
                background: "rgba(156,124,37,0.55)",
              }}
            />
          ) : null}
          <div
            style={{
              display: "flex",
              color: igColors.goldInk,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "DM Sans",
              letterSpacing: 0.3,
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Soft photo → cream fade (no heavy bordeaux wash). */
export function PhotoCreamFade({ height = 360 }: { height?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: 1080,
        height: Math.round(height * 0.55),
        background: `linear-gradient(180deg, rgba(249,242,234,0) 0%, ${igColors.cream} 100%)`,
        display: "flex",
      }}
    />
  );
}
