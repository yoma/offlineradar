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

function shortBlurb(event: Event): string {
  const raw = (event.shortDescription || "").trim();
  if (!raw) {
    const act = activityText(event);
    const city = locationLine(event);
    if (act && city) {
      return `Ontmoet andere singles tijdens deze ${act.toLowerCase()} in ${city}.`;
    }
    return "Ontdek dit singles-event via DateOfflineHub.";
  }
  return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbSrc}
        width={compact ? 58 : 64}
        height={compact ? 58 : 64}
        style={{
          objectFit: "cover",
          borderRadius: "18px 6px 18px 6px",
          flexShrink: 0,
        }}
        alt=""
      />
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
              fontSize: compact ? 22 : 24,
              fontWeight: 700,
              color: igColors.bordeaux,
              lineHeight: 1.2,
              flex: 1,
            }}
          >
            {event.title.length > (compact ? 40 : 46)
              ? `${event.title.slice(0, compact ? 37 : 43)}…`
              : event.title}
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

        <div style={{ display: "flex", marginTop: 16 }}>
          <GoldCta>Ontdek alle events →</GoldCta>
        </div>
        <CategoryIconRow />
        <BrandFooter light={false} />
      </div>
    </div>
  );
}

/** Individuele eventslide — photo top, cream content */
export function EventSlide({
  logoSrc,
  heroSrc,
  event,
  index,
  total,
  eyebrow = "Binnenkort",
}: {
  logoSrc: string;
  heroSrc: string;
  event: Event;
  index: number;
  total: number;
  eyebrow?: string;
}) {
  const act = activityText(event);
  const age = ageShort(event);
  const city = locationLine(event);

  return (
    <div style={slideStyle}>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1080,
          height: 560,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          width={1080}
          height={560}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 560,
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
            height: 560,
            background:
              "linear-gradient(180deg, rgba(249,242,234,0.2) 0%, rgba(249,242,234,0.08) 40%, rgba(249,242,234,0.95) 100%)",
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
            padding: "40px 48px 24px",
          }}
        >
          <BrandHeader logoSrc={logoSrc} light={false} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 20,
              alignItems: "center",
            }}
          >
            <GoldPill>{(act || eyebrow).toUpperCase()}</GoldPill>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: igColors.bordeaux,
                fontFamily: "DM Sans",
                fontWeight: 600,
                background: "rgba(249,242,234,0.88)",
                padding: "8px 14px",
                borderRadius: 999,
              }}
            >
              {index}/{total} · sfeerbeeld
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: "8px 48px 36px",
          marginTop: -28,
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 18,
            alignItems: "flex-start",
          }}
        >
          <PetalDateBadge startDate={event.startDate} tone="gold" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Bricolage Grotesque",
                fontSize: event.title.length > 48 ? 40 : 46,
                fontWeight: 700,
                color: igColors.bordeaux,
                lineHeight: 1.12,
              }}
            >
              {event.title}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 22,
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
            flexDirection: "column",
            gap: 10,
            padding: "18px 20px",
            borderRadius: 18,
            background: igColors.white,
            border: "1px solid rgba(228,213,203,0.95)",
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
              fontSize: 22,
              color: igColors.anthracite,
              fontFamily: "DM Sans",
              fontWeight: 500,
            }}
          >
            {city}
            {age ? ` · ${age}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 4 }}>
          <GoldCta>Bekijk dit event →</GoldCta>
        </div>
        <BrandFooter light={false} />
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

        <div style={{ display: "flex", marginTop: 16 }}>
          <GoldCta>Bekijk alle events →</GoldCta>
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
          <GoldCta>Ontdek alle events →</GoldCta>
        </div>
        <BrandFooter light={false} />
      </div>
    </div>
  );
}
