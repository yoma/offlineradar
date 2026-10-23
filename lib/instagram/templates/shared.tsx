/**
 * Shared Instagram chrome — reference redesign (premium / warm).
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
};

/** Top brand row: official logo + slogan (reference layout). */
export function BrandHeader({
  logoSrc,
  light = true,
}: {
  logoSrc: string;
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
        width={300}
        height={96}
        style={{ objectFit: "contain", flexShrink: 0 }}
        alt="DateOfflineHub"
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          paddingLeft: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 17,
            lineHeight: 1.35,
            color: light ? "rgba(249,242,234,0.92)" : igColors.bordeaux,
            fontFamily: "DM Sans",
            fontWeight: 500,
          }}
        >
          {INSTAGRAM_SLOGAN}
        </div>
      </div>
    </div>
  );
}

/** Bottom bar: website + handle (every slide). */
export function BrandFooter() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        marginTop: "auto",
        paddingTop: 18,
        paddingBottom: 8,
        borderTop: `1px solid ${igColors.lineGold}`,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 24,
          fontWeight: 600,
          color: igColors.gold,
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
          color: "rgba(249,242,234,0.9)",
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

export function GoldCta({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        padding: "22px 28px",
        borderRadius: 999,
        background: igColors.gold,
        color: igColors.bordeaux,
        fontSize: 26,
        fontWeight: 700,
        fontFamily: "DM Sans",
        letterSpacing: 0.3,
      }}
    >
      {children}
    </div>
  );
}

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
        justifyContent: "space-between",
        width: "100%",
        gap: 10,
        marginTop: 16,
      }}
    >
      {items.map((label) => (
        <div
          key={label}
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 4px",
            borderRadius: 999,
            border: `1px solid ${igColors.lineGold}`,
            color: igColors.goldLight,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "DM Sans",
            textAlign: "center",
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
