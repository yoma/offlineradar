/**
 * Instagram 4:5 templates — cream + lifestyle combo.
 * Petal date badges inspired by the upcoming-events reference,
 * without the heavy dark poster wash. Website-like cream canvas.
 */

import { formatAgeRange, ACTIVITY_LABEL } from "@/lib/format";
import { formatDayMonth, formatLongDate, weekdayIndex } from "@/lib/dates";
import type { ActivityId, Event } from "@/types/event";
import { igColors } from "@/lib/instagram/constants";
import {
  titleForEventRow,
  titleForEventSlide,
} from "@/lib/instagram/title";
import {
  BrandFooter,
  BrandHeader,
  CategoryIconRow,
  GoldCta,
  GoldPill,
  PhotoCreamFade,
  slideStyle,
} from "@/lib/instagram/templates/shared";

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;
const MONTHS_SHORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

function dayNumber(startDate: string): string {
  return String(Number(startDate.slice(8, 10)));
}

function monthShort(startDate: string): string {
  const m = Number(startDate.slice(5, 7));
  return MONTHS_SHORT[m - 1] ?? "";
}

function weekdayShort(startDate: string): string {
  return WEEKDAY_SHORT[weekdayIndex(startDate)];
}

function locationLine(event: Pick<Event, "city" | "region">): string {
  const city = (event.city ?? "").trim();
  const region = (event.region ?? "").trim();
  if (!region) return city;
  if (region.toLowerCase() === city.toLowerCase()) return city;
  if (/brussel|bruxelles/i.test(city) && /brussel|bruxelles/i.test(region)) {
    return city;
  }
  return city;
}

function activityText(event: Event): string | null {
  const id = event.activities[0] as ActivityId | undefined;
  if (id && ACTIVITY_LABEL[id]) return ACTIVITY_LABEL[id];
  return null;
}

function ageShort(event: Event): string | null {
  if (event.eligibilityAgeRule === "unknown") return null;
  if (event.eligibilityAgeMin == null && event.eligibilityAgeMax == null) {
    return null;
  }
  return formatAgeRange(event.eligibilityAgeMin, event.eligibilityAgeMax);
}

function whenDetail(event: Event): string {
  const base = formatLongDate(event.startDate);
  if (event.startTime) return `${base}, ${event.startTime}`;
  return `${base} · startuur te bevestigen`;
}

function timeOnly(event: Event): string {
  if (event.startTime) return event.startTime;
  return "uur tbd";
}

/**
 * Satori treats newlines poorly in flex text (stacked/overlapping glyphs).
 * Scraped page dumps often ship multiline "Adres / Datum" blocks — reject those.
 */
export function sanitizeInstagramBlurb(raw: string): string | null {
  const original = String(raw ?? "");
  const newlineCount = (original.match(/\r\n|\r|\n/g) ?? []).length;
  const collapsed = original
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) return null;
  // Multi-field scrape dumps (address/agenda blocks) are not usable blurbs.
  if (newlineCount >= 4) return null;
  if (/\bAdres\b/i.test(collapsed)) return null;
  if (/\bDatum\s*&\s*tijd\b/i.test(collapsed)) return null;
  // Catalog metadata lines (city | date | url) — not consumer copy.
  if (/\|\s*available\s*\|/i.test(collapsed) && /https?:\/\//i.test(collapsed)) {
    return null;
  }
  return collapsed.length > 140 ? `${collapsed.slice(0, 137)}…` : collapsed;
}

function fallbackBlurb(event: Event): string {
  const act = activityText(event);
  const city = locationLine(event);
  if (act && city) {
    return `Ontmoet andere singles tijdens deze ${act.toLowerCase()} in ${city}.`;
  }
  return "Ontdek dit singles-event via DateOfflineHub.";
}

function shortBlurb(event: Event): string {
  return sanitizeInstagramBlurb(event.shortDescription || "") ?? fallbackBlurb(event);
}

/** SVG petal (opposite corners rounded) — Satori-friendly via data URL. */
function petalShapeDataUrl(fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="86" height="86" viewBox="0 0 86 86"><path fill="${fill}" d="M8 0h46c17.673 0 32 14.327 32 32v46c0 4.418-3.582 8-8 8H32C14.327 86 0 71.673 0 54V8C0 3.582 3.582 0 8 0z"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Petal / leaf date badge (reference icon style).
 * Light cream canvas — no heavy dark poster wash.
 */
function PetalDateBadge({
  startDate,
  tone = "bordeaux",
}: {
  startDate: string;
  tone?: "bordeaux" | "gold";
}) {
  const bg = tone === "gold" ? igColors.gold : igColors.bordeaux;
  const fg = tone === "gold" ? igColors.bordeaux : igColors.cream;
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: 86,
        height: 86,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={petalShapeDataUrl(bg)}
        width={86}
        height={86}
        style={{ position: "absolute", top: 0, left: 0 }}
        alt=""
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          color: fg,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "DM Sans",
            letterSpacing: 0.6,
            textTransform: "uppercase" as const,
            opacity: 0.92,
          }}
        >
          {weekdayShort(startDate)}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1,
            marginTop: 1,
          }}
        >
          {dayNumber(startDate)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "DM Sans",
            textTransform: "uppercase" as const,
            marginTop: 2,
          }}
        >
          {monthShort(startDate)}
        </div>
      </div>
    </div>
  );
}

function EventRow({
  event,
  thumbSrc,
  compact,
}: {
  event: Event;
  thumbSrc: string;
  compact?: boolean;
}) {
  const age = ageShort(event);
  const city = locationLine(event);
  const act = activityText(event);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        width: "100%",
        padding: compact ? "12px 14px" : "14px 16px",
        borderRadius: 20,
        background: igColors.white,
        border: "1px solid rgba(228,213,203,0.95)",
      }}
    >
      <PetalDateBadge startDate={event.startDate} />
      {/* Light frame + lifted thumb so dark mood stock stays readable at small size */}
      <div
        style={{
          display: "flex",
          position: "relative",
          width: compact ? 72 : 80,
          height: compact ? 72 : 80,
          flexShrink: 0,
          borderRadius: "18px 8px 18px 8px",
          overflow: "hidden",
          background: igColors.creamDeep,
          border: "1px solid rgba(228,213,203,0.95)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc}
          width={compact ? 72 : 80}
          height={compact ? 72 : 80}
          style={{
            objectFit: "cover",
            width: compact ? 72 : 80,
            height: compact ? 72 : 80,
          }}
          alt=""
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: compact ? 72 : 80,
            height: compact ? 72 : 80,
            background:
              "linear-gradient(180deg, rgba(249,242,234,0.32) 0%, rgba(249,242,234,0.16) 100%)",
            display: "flex",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: compact ? 21 : 23,
              fontWeight: 700,
              color: igColors.bordeaux,
              lineHeight: 1.22,
              flex: 1,
              maxHeight: compact ? 52 : 58,
              overflow: "hidden",
            }}
          >
            {titleForEventRow(event.title, compact)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontWeight: 600,
              color: igColors.goldDeep,
              fontFamily: "DM Sans",
              flexShrink: 0,
            }}
          >
            {timeOnly(event)}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap" as const,
            gap: 12,
            fontSize: 16,
            color: igColors.anthracite,
            fontFamily: "DM Sans",
            opacity: 0.78,
          }}
        >
          <div style={{ display: "flex" }}>{city}</div>
          {act ? <div style={{ display: "flex" }}>· {act}</div> : null}
          {age ? <div style={{ display: "flex" }}>· {age}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Format A — cream canvas + soft photo header + petal rows */
export function BinnenkortCoverSlide({
  logoSrc,
  heroSrc,
  periodLabel,
  events,
  thumbSrcs,
}: {
  logoSrc: string;
  heroSrc: string;
  periodLabel: string;
  events: Event[];
  thumbSrcs: string[];
}) {
  const shown = events.slice(0, 5);
  return (
    <div style={slideStyle}>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1080,
          height: 320,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          width={1080}
          height={320}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 320,
            objectFit: "cover",
          }}
          alt=""
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 320,
            background:
              "linear-gradient(180deg, rgba(249,242,234,0.15) 0%, rgba(249,242,234,0.35) 55%, rgba(249,242,234,0.92) 100%)",
            display: "flex",
          }}
        />
        <PhotoCreamFade height={320} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: "8px 48px 36px",
          marginTop: -36,
        }}
      >
        <BrandHeader logoSrc={logoSrc} light={false} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 18,
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: 48,
              fontWeight: 700,
              color: igColors.bordeaux,
              lineHeight: 1.12,
              letterSpacing: -0.4,
            }}
          >
            Binnenkort te beleven
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 500,
              color: igColors.anthracite,
              fontFamily: "DM Sans",
              opacity: 0.78,
            }}
          >
            Singlesactiviteiten via DateOfflineHub
            {periodLabel ? ` · ${periodLabel}` : ""}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 20,
            flexGrow: 1,
          }}
        >
          {shown.map((event, i) => (
            <EventRow
              key={event.id}
              event={event}
              thumbSrc={thumbSrcs[i] ?? thumbSrcs[0]}
              compact={shown.length > 4}
            />
          ))}
        </div>

        <div style={{ display: "flex", marginTop: 14 }}>
          <GoldCta>Meer info via dateofflinehub.be</GoldCta>
        </div>
        <CategoryIconRow />
        <BrandFooter light={false} />
      </div>
    </div>
  );
}

/** Individuele eventslide — fuller canvas, balanced photo + info */
export function EventSlide({
  logoSrc,
  heroSrc,
  event,
  index,
  total,
  eyebrow = "Binnenkort",
  showAtmosphereLabel = true,
}: {
  logoSrc: string;
  heroSrc: string;
  event: Event;
  index: number;
  total: number;
  eyebrow?: string;
  showAtmosphereLabel?: boolean;
}) {
  const act = activityText(event);
  const age = ageShort(event);
  const city = locationLine(event);
  const displayTitle = titleForEventSlide(event.title);
  const titleSize = displayTitle.length > 55 ? 36 : displayTitle.length > 40 ? 40 : 44;

  return (
    <div style={slideStyle}>
      {/* Photo grows to fill; info block stays compact at the bottom */}
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1080,
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 560,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          width={1080}
          height={1100}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 1080,
            objectFit: "cover",
          }}
          alt=""
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 1080,
            background:
              "linear-gradient(180deg, rgba(249,242,234,0.3) 0%, rgba(249,242,234,0.04) 48%, rgba(249,242,234,0.98) 100%)",
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
            width: "100%",
            height: "100%",
            padding: "28px 48px 16px",
          }}
        >
          <BrandHeader logoSrc={logoSrc} light={false} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 14,
              alignItems: "center",
            }}
          >
            <GoldPill>{(act || eyebrow).toUpperCase()}</GoldPill>
            <div
              style={{
                display: "flex",
                fontSize: 17,
                color: igColors.bordeaux,
                fontFamily: "DM Sans",
                fontWeight: 600,
                background: "rgba(249,242,234,0.88)",
                padding: "8px 14px",
                borderRadius: 999,
              }}
            >
              {index}/{total}
              {showAtmosphereLabel ? " · Sfeerbeeld" : ""}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          padding: "0 48px 30px",
          marginTop: -52,
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "22px 24px 24px",
            borderRadius: 22,
            background: igColors.white,
            border: "1px solid rgba(228,213,203,0.95)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <PetalDateBadge startDate={event.startDate} tone="gold" />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "Bricolage Grotesque",
                  fontSize: titleSize,
                  fontWeight: 700,
                  color: igColors.bordeaux,
                  lineHeight: 1.15,
                  maxHeight: 104,
                  overflow: "hidden",
                }}
              >
                {displayTitle}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 20,
                  color: igColors.anthracite,
                  fontFamily: "DM Sans",
                  lineHeight: 1.4,
                  opacity: 0.85,
                }}
              >
                {shortBlurb(event)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: "100%",
              height: 1,
              background: "rgba(103,40,58,0.12)",
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: igColors.bordeaux,
                fontFamily: "DM Sans",
                fontWeight: 600,
              }}
            >
              {whenDetail(event)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 21,
                color: igColors.anthracite,
                fontFamily: "DM Sans",
                fontWeight: 500,
              }}
            >
              {city}
              {age ? ` · ${age}` : ""}
              {act ? ` · ${act}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 4 }}>
            <GoldCta>Alle details via link in bio</GoldCta>
          </div>
        </div>

        <BrandFooter light={false} pushDown={false} />
      </div>
    </div>
  );
}

/** Format B — compact week overview, cream + petal rows */
export function DezeWeekOverviewSlide({
  logoSrc,
  heroSrc,
  periodLabel,
  events,
  thumbSrcs,
}: {
  logoSrc: string;
  heroSrc: string;
  periodLabel: string;
  events: Event[];
  thumbSrcs: string[];
}) {
  const shown = events.slice(0, 4);
  return (
    <div style={slideStyle}>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1080,
          height: 300,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          width={1080}
          height={300}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 300,
            objectFit: "cover",
          }}
          alt=""
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 300,
            background:
              "linear-gradient(180deg, rgba(249,242,234,0.2) 0%, rgba(249,242,234,0.9) 100%)",
            display: "flex",
          }}
        />
        <PhotoCreamFade height={300} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: "4px 48px 36px",
          marginTop: -28,
        }}
      >
        <BrandHeader logoSrc={logoSrc} light={false} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 18,
            gap: 12,
          }}
        >
          <GoldPill>Deze week</GoldPill>
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: 48,
              fontWeight: 700,
              color: igColors.bordeaux,
              lineHeight: 1.1,
            }}
          >
            Nog iets gepland?
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: igColors.anthracite,
              fontFamily: "DM Sans",
              opacity: 0.8,
            }}
          >
            Singlesactiviteiten de komende dagen
            {periodLabel ? ` · ${periodLabel}` : ""}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 22,
            flexGrow: 1,
          }}
        >
          {shown.map((event, i) => (
            <EventRow
              key={event.id}
              event={event}
              thumbSrc={thumbSrcs[i] ?? thumbSrcs[0]}
            />
          ))}
        </div>

        <div style={{ display: "flex", marginTop: 14 }}>
          <GoldCta>Ontdek alle activiteiten</GoldCta>
        </div>
        <BrandFooter light={false} />
      </div>
    </div>
  );
}

/** Format C cover */
export function NieuwCoverSlide({
  logoSrc,
  heroSrc,
  periodLabel,
}: {
  logoSrc: string;
  heroSrc: string;
  periodLabel: string;
}) {
  return (
    <div style={slideStyle}>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1080,
          height: 420,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          width={1080}
          height={420}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 420,
            objectFit: "cover",
          }}
          alt=""
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 420,
            background:
              "linear-gradient(180deg, rgba(249,242,234,0.25) 0%, rgba(249,242,234,0.95) 100%)",
            display: "flex",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: "8px 48px 36px",
          marginTop: -40,
          gap: 18,
        }}
      >
        <BrandHeader logoSrc={logoSrc} light={false} />
        <GoldPill>Nieuw</GoldPill>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 52,
            fontWeight: 700,
            color: igColors.bordeaux,
            lineHeight: 1.12,
          }}
        >
          Nieuw op DateOfflineHub
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: igColors.anthracite,
            fontFamily: "DM Sans",
            opacity: 0.8,
          }}
        >
          {periodLabel || "Verse singlesactiviteiten"}
        </div>
        <div style={{ display: "flex", marginTop: "auto" }}>
          <GoldCta>Meer info via dateofflinehub.be</GoldCta>
        </div>
        <BrandFooter light={false} />
      </div>
    </div>
  );
}
