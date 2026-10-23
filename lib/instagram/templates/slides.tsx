/**
 * Instagram 4:5 slide templates (1080×1350).
 * Brand: bordeaux + gold + cream, real logo, website on every slide.
 */

import {
  ACTIVITY_LABEL,
  formatAgeRange,
  formatPrice,
  formatPriceFrom,
} from "@/lib/format";
import { formatDayMonth, weekdayIndex } from "@/lib/dates";
import type { ActivityId, Event } from "@/types/event";
import {
  INSTAGRAM_SLOGAN,
  igColors,
} from "@/lib/instagram/constants";
import {
  GoldRule,
  LogoHeader,
  MetaChip,
  SlideFooter,
  slideStyle,
} from "@/lib/instagram/templates/shared";

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;

/** Compact when-line for Instagram (never dump internal review notes). */
function igFormatWhen(
  event: Pick<Event, "startDate" | "startTime"> & {
    startTimeDisplayNote?: string | null;
  },
): string {
  const day = WEEKDAY_SHORT[weekdayIndex(event.startDate)];
  const datePart = `${day} ${formatDayMonth(event.startDate)}`;
  if (event.startTime) return `${datePart} · ${event.startTime}`;
  if (event.startTimeDisplayNote) {
    return `${datePart} · startuur te bevestigen`;
  }
  return `${datePart} · startuur te bevestigen`;
}

function locationLine(event: Pick<Event, "city" | "region">): string {
  const city = (event.city ?? "").trim();
  const region = (event.region ?? "").trim();
  if (!region) return city;
  if (region.toLowerCase() === city.toLowerCase()) return city;
  // "Brussel · Brussel" / city already names the region
  if (
    /brussel|bruxelles/i.test(city) &&
    /brussel|bruxelles/i.test(region)
  ) {
    return city;
  }
  return `${city} · ${region}`;
}

function activityText(event: Event): string | null {
  const id = event.activities[0] as ActivityId | undefined;
  if (id && ACTIVITY_LABEL[id]) return ACTIVITY_LABEL[id];
  const sub = event.subCategory?.trim() || "";
  // Skip internal / intake junk as public activity labels.
  if (!sub) return null;
  if (/e-commerce|winkel|incidenteel|needs_review|internal|\//i.test(sub)) {
    return null;
  }
  if (sub.length > 40) return null;
  return sub;
}

function ageText(event: Event): string | null {
  if (event.eligibilityAgeMin == null && event.eligibilityAgeMax == null) {
    return null;
  }
  if (event.eligibilityAgeRule === "unknown") return null;
  const range = formatAgeRange(
    event.eligibilityAgeMin,
    event.eligibilityAgeMax,
  );
  if (!range) return null;
  if (event.eligibilityAgeRule === "guideline") return `Richtleeftijd ${range}`;
  return range;
}

function priceText(event: Event): string | null {
  if (event.price == null) return null;
  return event.priceIsFrom
    ? formatPriceFrom(event.price, event.currency)
    : formatPrice(event.price, event.currency);
}

/** Format A — cover slide */
export function BinnenkortCoverSlide({
  logoSrc,
  periodLabel,
  eventCount,
}: {
  logoSrc: string;
  periodLabel: string;
  eventCount: number;
}) {
  return (
    <div
      style={{
        ...slideStyle,
        background: `linear-gradient(165deg, ${igColors.bordeaux} 0%, ${igColors.bordeauxSoft} 55%, #4A1C2A 100%)`,
        padding: "72px 64px 56px",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <LogoHeader logoSrc={logoSrc} />
        <GoldRule width={220} />
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontFamily: "Bricolage Grotesque",
            fontSize: 64,
            fontWeight: 700,
            color: igColors.cream,
            textAlign: "center",
            lineHeight: 1.15,
            letterSpacing: -0.5,
          }}
        >
          Binnenkort op DateOfflineHub
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 30,
            color: igColors.goldLight,
            fontFamily: "DM Sans",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {periodLabel}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 24,
            color: "rgba(249,242,234,0.78)",
            fontFamily: "DM Sans",
          }}
        >
          {eventCount} singlesactiviteiten
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: igColors.gold,
            fontFamily: "DM Sans",
            fontWeight: 600,
            textAlign: "center",
            maxWidth: 780,
          }}
        >
          {INSTAGRAM_SLOGAN}
        </div>
        <SlideFooter />
      </div>
    </div>
  );
}

/** Individual event slide (carousel body / Format B detail) */
export function EventSlide({
  logoSrc,
  event,
  index,
  total,
  eyebrow = "Binnenkort",
}: {
  logoSrc: string;
  event: Event;
  index: number;
  total: number;
  eyebrow?: string;
}) {
  const activity = activityText(event);
  const age = ageText(event);
  const price = priceText(event);
  const chips = [activity, age, price].filter(Boolean) as string[];

  return (
    <div
      style={{
        ...slideStyle,
        background: igColors.cream,
        padding: "56px 56px 48px",
      }}
    >
      <LogoHeader logoSrc={logoSrc} compact />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: igColors.goldDeep,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase" as const,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: igColors.bordeaux,
            fontWeight: 600,
          }}
        >
          {index}/{total}
        </div>
      </div>
      <GoldRule />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          gap: 28,
          paddingTop: 36,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: event.title.length > 55 ? 44 : 52,
            fontWeight: 700,
            color: igColors.bordeaux,
            lineHeight: 1.18,
            letterSpacing: -0.4,
          }}
        >
          {event.title}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 32,
              color: igColors.anthracite,
              fontWeight: 600,
            }}
          >
            {igFormatWhen(event)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: igColors.bordeaux,
              fontWeight: 600,
            }}
          >
            {locationLine(event)}
          </div>
        </div>

        {chips.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap" as const,
              gap: 12,
            }}
          >
            {chips.map((chip) => (
              <MetaChip key={chip}>{chip}</MetaChip>
            ))}
          </div>
        ) : null}
      </div>

      <SlideFooter showSlogan />
    </div>
  );
}

/** Format B — single overview image "Deze week nog iets gepland?" */
export function DezeWeekOverviewSlide({
  logoSrc,
  periodLabel,
  events,
}: {
  logoSrc: string;
  periodLabel: string;
  events: Event[];
}) {
  return (
    <div
      style={{
        ...slideStyle,
        background: igColors.cream,
        padding: "52px 52px 44px",
      }}
    >
      <LogoHeader logoSrc={logoSrc} compact />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 48,
            fontWeight: 700,
            color: igColors.bordeaux,
            lineHeight: 1.15,
          }}
        >
          Deze week nog iets gepland?
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: igColors.goldDeep,
            fontWeight: 600,
          }}
        >
          {periodLabel}
        </div>
      </div>
      <GoldRule />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: 28,
          flexGrow: 1,
        }}
      >
        {events.slice(0, 5).map((event) => {
          const activity = activityText(event);
          return (
            <div
              key={event.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "18px 22px",
                borderRadius: 16,
                background: igColors.white,
                border: `1px solid ${igColors.lineGold}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 20,
                  color: igColors.goldDeep,
                  fontWeight: 600,
                }}
              >
                {igFormatWhen(event)}
                {activity ? ` · ${activity}` : ""}
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Bricolage Grotesque",
                  fontSize: 28,
                  fontWeight: 700,
                  color: igColors.bordeaux,
                  lineHeight: 1.2,
                }}
              >
                {event.title.length > 60
                  ? `${event.title.slice(0, 57)}…`
                  : event.title}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  color: igColors.anthracite,
                }}
              >
                {event.city}
              </div>
            </div>
          );
        })}
      </div>

      <SlideFooter showSlogan />
    </div>
  );
}

/** Format C — cover for newly published events */
export function NieuwCoverSlide({
  logoSrc,
  periodLabel,
}: {
  logoSrc: string;
  periodLabel: string;
}) {
  return (
    <div
      style={{
        ...slideStyle,
        background: `linear-gradient(180deg, ${igColors.cream} 0%, ${igColors.goldSoft} 100%)`,
        padding: "72px 64px 56px",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <LogoHeader logoSrc={logoSrc} />
        <div
          style={{
            display: "flex",
            marginTop: 12,
            padding: "10px 20px",
            borderRadius: 999,
            background: igColors.bordeaux,
            color: igColors.cream,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 1.4,
            textTransform: "uppercase" as const,
          }}
        >
          Nieuw
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontFamily: "Bricolage Grotesque",
            fontSize: 58,
            fontWeight: 700,
            color: igColors.bordeaux,
            textAlign: "center",
            lineHeight: 1.15,
          }}
        >
          Nieuw op DateOfflineHub
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 28,
            color: igColors.goldInk,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {periodLabel}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: igColors.bordeaux,
            fontWeight: 600,
            textAlign: "center",
            maxWidth: 720,
          }}
        >
          {INSTAGRAM_SLOGAN}
        </div>
        <SlideFooter />
      </div>
    </div>
  );
}
