/**
 * Instagram 4:5 templates — premium reference redesign.
 * Official logo, cream event cards, lifestyle atmosphere photos.
 * Atmosphere images are never claimed as edition-specific photos.
 */

import { formatAgeRange } from "@/lib/format";
import { formatDayMonth, formatLongDate, weekdayIndex } from "@/lib/dates";
import type { ActivityId, Event } from "@/types/event";
import { ACTIVITY_LABEL } from "@/lib/format";
import { igColors } from "@/lib/instagram/constants";
import {
  BrandFooter,
  BrandHeader,
  CategoryIconRow,
  GoldCta,
  GoldPill,
  slideStyle,
} from "@/lib/instagram/templates/shared";

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;

function dateBadge(startDate: string): string {
  const day = WEEKDAY_SHORT[weekdayIndex(startDate)].toUpperCase();
  const parts = formatDayMonth(startDate).split(" ");
  const num = parts[0];
  const mon = (parts[1] ?? "").toUpperCase();
  return `${day} ${num} ${mon}`;
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

type EventRowProps = {
  event: Event;
  thumbSrc: string;
  compact?: boolean;
};

function EventRow({ event, thumbSrc, compact }: EventRowProps) {
  const age = ageShort(event);
  const city = locationLine(event);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        width: "100%",
        padding: compact ? "12px 14px" : "14px 16px",
        borderRadius: 18,
        background: igColors.cream,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbSrc}
        width={compact ? 64 : 72}
        height={compact ? 64 : 72}
        style={{
          objectFit: "cover",
          borderRadius: 14,
          flexShrink: 0,
        }}
        alt=""
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: compact ? 88 : 100,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: compact ? 18 : 20,
            fontWeight: 700,
            color: igColors.anthracite,
            fontFamily: "DM Sans",
            lineHeight: 1.2,
          }}
        >
          {dateBadge(event.startDate)}
        </div>
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
            fontFamily: "Bricolage Grotesque",
            fontSize: compact ? 22 : 24,
            fontWeight: 700,
            color: igColors.bordeaux,
            lineHeight: 1.2,
          }}
        >
          {event.title.length > (compact ? 42 : 48)
            ? `${event.title.slice(0, compact ? 39 : 45)}…`
            : event.title}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 14,
            fontSize: 16,
            color: igColors.anthracite,
            fontFamily: "DM Sans",
            opacity: 0.82,
          }}
        >
          <div style={{ display: "flex" }}>📍 {city}</div>
          {age ? <div style={{ display: "flex" }}>👥 {age}</div> : null}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: 36,
          height: 36,
          borderRadius: 999,
          background: igColors.gold,
          alignItems: "center",
          justifyContent: "center",
          color: igColors.bordeaux,
          fontSize: 20,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        →
      </div>
    </div>
  );
}

/** Format A — sfeervolle cover met eventoverzicht */
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroSrc}
        width={1080}
        height={1350}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1350,
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
          height: 1350,
          background:
            "linear-gradient(180deg, rgba(103,40,58,0.72) 0%, rgba(74,28,42,0.88) 42%, rgba(55,20,32,0.96) 100%)",
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
          padding: "44px 48px 36px",
        }}
      >
        <BrandHeader logoSrc={logoSrc} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: 52,
              fontWeight: 700,
              color: igColors.gold,
              lineHeight: 1.12,
              letterSpacing: -0.5,
            }}
          >
            Binnenkort op DateOfflineHub
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: 2,
                color: "rgba(249,242,234,0.9)",
                fontFamily: "DM Sans",
                textTransform: "uppercase" as const,
              }}
            >
              Singles events in Vlaanderen
            </div>
            <div
              style={{
                display: "flex",
                width: 160,
                height: 2,
                background: igColors.gold,
                marginTop: 4,
                marginBottom: 4,
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: 2,
                color: "rgba(249,242,234,0.85)",
                fontFamily: "DM Sans",
                textTransform: "uppercase" as const,
              }}
            >
              {periodLabel || "Komende dagen"}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 22,
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
        <BrandFooter />
      </div>
    </div>
  );
}

/** Individuele eventslide */
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroSrc}
        width={1080}
        height={1350}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1350,
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
          height: 1350,
          background:
            "linear-gradient(180deg, rgba(55,20,32,0.55) 0%, rgba(74,28,42,0.45) 35%, rgba(55,20,32,0.92) 72%, rgba(40,14,24,0.97) 100%)",
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
          padding: "44px 48px 36px",
        }}
      >
        <BrandHeader logoSrc={logoSrc} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 22,
            alignItems: "center",
          }}
        >
          <GoldPill>{(act || eyebrow).toUpperCase()}</GoldPill>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "rgba(249,242,234,0.7)",
              fontFamily: "DM Sans",
              fontWeight: 600,
            }}
          >
            {index}/{total} · sfeerbeeld
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            gap: 18,
            paddingBottom: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: event.title.length > 48 ? 46 : 54,
              fontWeight: 700,
              color: igColors.cream,
              lineHeight: 1.12,
              letterSpacing: -0.4,
            }}
          >
            {event.title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "rgba(249,242,234,0.9)",
              fontFamily: "DM Sans",
              lineHeight: 1.4,
              maxWidth: 920,
            }}
          >
            {shortBlurb(event)}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginTop: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: igColors.goldLight,
                fontFamily: "DM Sans",
                fontWeight: 600,
              }}
            >
              📅  {whenDetail(event)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: igColors.goldLight,
                fontFamily: "DM Sans",
                fontWeight: 600,
              }}
            >
              📍  {city}
            </div>
            {age ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: igColors.goldLight,
                  fontFamily: "DM Sans",
                  fontWeight: 600,
                }}
              >
                👥  {age}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", marginTop: 10 }}>
            <GoldCta>Bekijk dit event →</GoldCta>
          </div>
          <BrandFooter />
        </div>
      </div>
    </div>
  );
}

/** Format B — compact week overzicht */
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroSrc}
        width={1080}
        height={1350}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1350,
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
          height: 1350,
          background:
            "linear-gradient(180deg, rgba(74,28,42,0.62) 0%, rgba(55,20,32,0.78) 40%, rgba(40,14,24,0.96) 100%)",
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
          padding: "44px 48px 36px",
        }}
      >
        <BrandHeader logoSrc={logoSrc} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            gap: 14,
          }}
        >
          <GoldPill>Deze week</GoldPill>
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: 56,
              fontWeight: 700,
              color: igColors.cream,
              lineHeight: 1.1,
            }}
          >
            Nog iets gepland?
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "rgba(249,242,234,0.88)",
              fontFamily: "DM Sans",
            }}
          >
            Ontdek deze singlesactiviteiten de komende dagen
            {periodLabel ? ` · ${periodLabel}` : ""}.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 28,
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

        <div style={{ display: "flex", marginTop: 18 }}>
          <GoldCta>Bekijk alle events →</GoldCta>
        </div>
        <BrandFooter />
      </div>
    </div>
  );
}

/** Format C cover — zelfde premium taal */
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroSrc}
        width={1080}
        height={1350}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1350,
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
          height: 1350,
          background:
            "linear-gradient(180deg, rgba(74,28,42,0.7) 0%, rgba(55,20,32,0.92) 100%)",
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
          padding: "44px 48px 36px",
        }}
      >
        <BrandHeader logoSrc={logoSrc} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
            gap: 20,
          }}
        >
          <GoldPill>Nieuw</GoldPill>
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: 58,
              fontWeight: 700,
              color: igColors.gold,
              lineHeight: 1.12,
            }}
          >
            Nieuw op DateOfflineHub
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "rgba(249,242,234,0.9)",
              fontFamily: "DM Sans",
            }}
          >
            {periodLabel || "Verse singlesactiviteiten"}
          </div>
        </div>
        <GoldCta>Ontdek alle events →</GoldCta>
        <BrandFooter />
      </div>
    </div>
  );
}
