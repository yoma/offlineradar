/**
 * Instagram 4:5 templates, "agenda" style (see templates/shared.tsx).
 *
 * - Photos are the same website-visible image per event (official, own,
 *   generated or semantic mood pick), resolved fresh on every render. They
 *   are shown clean: no washes, no gradients, no text on top.
 * - Covers and overviews are listings pages: date column, photo thumbnail,
 *   title and facts. Event slides put the photo on top, facts below.
 * - Atmosphere images carry a small "Sfeerbeeld" tag, as on the website.
 *   Only when no image loads does a slide fall back to pure typography.
 * - Facts come only from the Event. Unknown stays out; nothing is invented.
 */

import { ACTIVITY_LABEL, formatAgeRange, formatPrice, formatPriceFrom } from "@/lib/format";
import { weekdayIndex } from "@/lib/dates";
import type { ActivityId, Event } from "@/types/event";
import { sanitizeInstagramBlurb } from "@/lib/instagram/blurb";
import {
  IG_CAROUSEL_MAX,
  IG_THIS_WEEK_MAX_EVENTS,
} from "@/lib/instagram/constants";
import { shortenTitle } from "@/lib/instagram/title";
import {
  Colophon,
  IG_MARGIN,
  Label,
  Masthead,
  Rule,
  type SlideTone,
  slideStyle,
  tonePalette,
} from "@/lib/instagram/templates/shared";

/** @deprecated use sanitizeInstagramBlurb from `@/lib/instagram/blurb` */
export { sanitizeInstagramBlurb } from "@/lib/instagram/blurb";

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;
const WEEKDAY_LONG = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
] as const;
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
const MONTHS_LONG = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
] as const;

function dayNumber(startDate: string): string {
  return String(Number(startDate.slice(8, 10)));
}

function monthIndex(startDate: string): number {
  return Number(startDate.slice(5, 7)) - 1;
}

function activityText(event: Event): string | null {
  const id = event.activities[0] as ActivityId | undefined;
  if (id && ACTIVITY_LABEL[id]) return ACTIVITY_LABEL[id];
  return null;
}

/** Age as shown on the slide. Guideline ages are labelled as such. */
function ageText(event: Event): string | null {
  if (event.eligibilityAgeRule === "unknown") return null;
  const range = formatAgeRange(event.eligibilityAgeMin, event.eligibilityAgeMax);
  if (!range) return null;
  return event.eligibilityAgeRule === "guideline"
    ? `richtleeftijd ${range}`
    : range;
}

/** Price only when known. "Prijs onbekend" is not something to advertise. */
function priceText(event: Event): string | null {
  if (event.price == null) return null;
  return event.priceIsFrom
    ? formatPriceFrom(event.price, event.currency)
    : formatPrice(event.price, event.currency);
}

function placeText(event: Event): string {
  const city = (event.city ?? "").trim();
  const venue = (event.venue ?? "").trim();
  if (venue && city && !venue.toLowerCase().includes(city.toLowerCase())) {
    return `${venue}, ${city}`;
  }
  return venue || city;
}

/** Row meta: "Gent · 19:30 · 40–50 jaar" */
function rowMeta(event: Event): string {
  return [
    (event.city ?? "").trim(),
    event.startTime ?? null,
    ageText(event),
  ]
    .filter(Boolean)
    .join("  ·  ");
}

/* ------------------------------------------------------------------ */
/* Listings (cover + week overview)                                   */
/* ------------------------------------------------------------------ */

function ListingRow({
  event,
  thumbSrc,
  thumbSlot = false,
  tone,
  dense,
  tight = false,
}: {
  event: Event;
  thumbSrc?: string;
  /** Keep the photo column when this row has no image but others do. */
  thumbSlot?: boolean;
  tone: SlideTone;
  dense: boolean;
  tight?: boolean;
}) {
  const p = tonePalette(tone);
  const thumb = tight ? 84 : dense ? 96 : 112;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        flexShrink: 0,
      }}
    >
      <Rule color={p.rule} />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          width: "100%",
          paddingTop: tight ? 14 : dense ? 18 : 26,
          paddingBottom: tight ? 14 : dense ? 18 : 26,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 124,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: dense ? 60 : 68,
              lineHeight: 0.9,
              letterSpacing: -2,
              color: p.accent,
            }}
          >
            {dayNumber(event.startDate)}
          </div>
          <div style={{ display: "flex", marginTop: 8 }}>
            <Label color={p.inkFaint} size={19}>
              {`${WEEKDAY_SHORT[weekdayIndex(event.startDate)]} ${MONTHS_SHORT[monthIndex(event.startDate)]}`}
            </Label>
          </div>
        </div>
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            width={thumb}
            height={thumb}
            style={{
              width: thumb,
              height: thumb,
              objectFit: "cover",
              flexShrink: 0,
              marginRight: 28,
            }}
            alt=""
          />
        ) : thumbSlot ? (
          <div
            style={{
              display: "flex",
              width: thumb,
              height: thumb,
              flexShrink: 0,
              marginRight: 28,
              background: p.rule,
            }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            paddingTop: 2,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: dense ? 34 : 38,
              lineHeight: 1.1,
              letterSpacing: -0.4,
              color: p.ink,
              // Six rows only fit with one-line titles.
              maxHeight: tight ? 38 : dense ? 76 : 86,
              overflow: "hidden",
            }}
          >
            {shortenTitle(event.title, tight ? 34 : dense ? 54 : 56)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: dense ? 24 : 26,
              color: p.inkSoft,
              marginTop: 8,
              fontFamily: "DM Sans",
            }}
          >
            {rowMeta(event)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListingSlide({
  markSrc,
  tone,
  sectionLabel,
  headline,
  intro,
  events,
  thumbSrcs,
  max,
  action,
}: {
  markSrc: string;
  tone: SlideTone;
  sectionLabel: string;
  headline: string[];
  intro: string;
  events: Event[];
  thumbSrcs: string[];
  max: number;
  action: string;
}) {
  const p = tonePalette(tone);
  // Every selected event must be on the image: the caption lists them all.
  const shown = events.slice(0, max);
  const hidden = events.length - shown.length;
  const dense = shown.length > 4;
  const tight = shown.length > 5;
  const thumbSlot = thumbSrcs.slice(0, max).some(Boolean);
  return (
    <div style={slideStyle(tone)}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: `${IG_MARGIN}px ${IG_MARGIN}px 60px`,
        }}
      >
        <Masthead markSrc={markSrc} tone={tone} right={sectionLabel} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: tight ? 36 : dense ? 44 : 64,
            flexShrink: 0,
          }}
        >
          {headline.map((line) => (
            <div
              key={line}
              style={{
                display: "flex",
                fontFamily: "Bricolage Grotesque",
                fontWeight: 700,
                fontSize: tight ? 92 : dense ? 104 : 116,
                lineHeight: 0.98,
                letterSpacing: -3.5,
                color: p.ink,
              }}
            >
              {line}
            </div>
          ))}
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: p.inkSoft,
              marginTop: 24,
              fontFamily: "DM Sans",
            }}
          >
            {intro}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: tight ? 26 : dense ? 36 : 52,
            flexShrink: 0,
          }}
        >
          {shown.map((event, i) => (
            <ListingRow
              key={event.id}
              event={event}
              thumbSrc={thumbSrcs[i]}
              thumbSlot={thumbSlot}
              tone={tone}
              dense={dense}
              tight={tight}
            />
          ))}
          {hidden > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Rule color={p.rule} />
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: p.inkSoft,
                  paddingTop: 16,
                  fontFamily: "DM Sans",
                }}
              >
                {`+ ${hidden} meer in de caption`}
              </div>
            </div>
          ) : null}
        </div>

        <Colophon tone={tone} action={action} />
      </div>
    </div>
  );
}

/** Format A cover: bordeaux listings page. */
export function BinnenkortCoverSlide({
  logoSrc,
  periodLabel,
  events,
  thumbSrcs = [],
}: {
  logoSrc: string;
  periodLabel: string;
  events: Event[];
  /** Per-event website image, same order as `events`; "" = no photo. */
  thumbSrcs?: string[];
}) {
  return (
    <ListingSlide
      markSrc={logoSrc}
      tone="bordeaux"
      sectionLabel="Agenda"
      headline={["Binnenkort", "te beleven."]}
      intro={
        periodLabel
          ? `Singlesactiviteiten van ${periodLabel}`
          : "Singlesactiviteiten in de komende weken"
      }
      events={events}
      thumbSrcs={thumbSrcs}
      max={IG_CAROUSEL_MAX}
      action="Swipe voor de details"
    />
  );
}

/** Format B: cream week overview. */
export function DezeWeekOverviewSlide({
  logoSrc,
  periodLabel,
  events,
  thumbSrcs = [],
}: {
  logoSrc: string;
  periodLabel: string;
  events: Event[];
  /** Per-event website image, same order as `events`; "" = no photo. */
  thumbSrcs?: string[];
}) {
  return (
    <ListingSlide
      markSrc={logoSrc}
      tone="cream"
      sectionLabel="Deze week"
      headline={["Nog niets", "gepland?"]}
      intro={
        periodLabel
          ? `Waar je singles ontmoet, ${periodLabel}`
          : "Waar je deze week singles ontmoet"
      }
      events={events}
      thumbSrcs={thumbSrcs}
      max={IG_THIS_WEEK_MAX_EVENTS}
      action="Alles staat via de link in bio"
    />
  );
}

/** Small corner tag on a photo ("1 / 6", "Sfeerbeeld"). */
function PhotoTag({ children }: { children: string }) {
  const p = tonePalette("cream");
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 16px",
        background: p.bg,
      }}
    >
      <Label color={p.ink} size={18}>
        {children}
      </Label>
    </div>
  );
}

/** Format C cover with the first new event's photo on top. */
function NieuwPhotoCoverSlide({
  logoSrc,
  heroSrc,
  showAtmosphereLabel,
  periodLabel,
}: {
  logoSrc: string;
  heroSrc: string;
  showAtmosphereLabel: boolean;
  periodLabel: string;
}) {
  const p = tonePalette("bordeaux");
  const photoH = 600;
  return (
    <div style={slideStyle("bordeaux")}>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1080,
          height: photoH,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          width={1080}
          height={photoH}
          style={{ width: 1080, height: photoH, objectFit: "cover" }}
          alt=""
        />
        {showAtmosphereLabel ? (
          <div style={{ display: "flex", position: "absolute", left: 40, bottom: 40 }}>
            <PhotoTag>Sfeerbeeld</PhotoTag>
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: `52px ${IG_MARGIN}px 60px`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Label color={p.accent} size={24}>
            Net toegevoegd
          </Label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={52} height={40} style={{ objectFit: "contain" }} alt="" />
        </div>
        {["Nieuw op", "de agenda."].map((line, i) => (
          <div
            key={line}
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: 128,
              lineHeight: 0.94,
              letterSpacing: -4.5,
              color: p.ink,
              marginTop: i === 0 ? 24 : 0,
            }}
          >
            {line}
          </div>
        ))}
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: p.inkSoft,
            marginTop: 28,
            fontFamily: "DM Sans",
          }}
        >
          {periodLabel || "Verse singlesactiviteiten"}
        </div>
        <Colophon tone="bordeaux" action="Swipe voor de details" />
      </div>
    </div>
  );
}

/**
 * Format C cover. With a photo (first new event's website image) the photo
 * leads; without one it is one big typographic statement.
 */
export function NieuwCoverSlide({
  logoSrc,
  heroSrc,
  showAtmosphereLabel = false,
  periodLabel,
}: {
  logoSrc: string;
  heroSrc?: string;
  showAtmosphereLabel?: boolean;
  periodLabel: string;
}) {
  if (heroSrc) {
    return (
      <NieuwPhotoCoverSlide
        logoSrc={logoSrc}
        heroSrc={heroSrc}
        showAtmosphereLabel={showAtmosphereLabel}
        periodLabel={periodLabel}
      />
    );
  }
  const p = tonePalette("bordeaux");
  return (
    <div style={slideStyle("bordeaux")}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: `${IG_MARGIN}px ${IG_MARGIN}px 60px`,
        }}
      >
        <Masthead markSrc={logoSrc} tone="bordeaux" right="Nieuw" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            marginBottom: 72,
          }}
        >
          <Label color={p.accent} size={24}>
            Net toegevoegd
          </Label>
          {["Nieuw", "op de", "agenda."].map((line) => (
            <div
              key={line}
              style={{
                display: "flex",
                fontFamily: "Bricolage Grotesque",
                fontWeight: 700,
                fontSize: 176,
                lineHeight: 0.94,
                letterSpacing: -6,
                color: p.ink,
                marginTop: line === "Nieuw" ? 28 : 0,
              }}
            >
              {line}
            </div>
          ))}
          <div
            style={{
              display: "flex",
              fontSize: 32,
              color: p.inkSoft,
              marginTop: 40,
              fontFamily: "DM Sans",
            }}
          >
            {periodLabel || "Verse singlesactiviteiten"}
          </div>
        </div>
        <Colophon tone="bordeaux" action="Swipe voor de details" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Individual event                                                   */
/* ------------------------------------------------------------------ */

function FactRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: SlideTone;
}) {
  const p = tonePalette(tone);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <Rule color={p.rule} />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width: "100%",
          paddingTop: 17,
          paddingBottom: 17,
        }}
      >
        <div style={{ display: "flex", width: 236, flexShrink: 0 }}>
          <Label color={p.inkFaint} size={20}>
            {label}
          </Label>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            fontSize: 29,
            color: p.ink,
            fontFamily: "DM Sans",
            maxHeight: 38,
            overflow: "hidden",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function eventFacts(event: Event): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const place = placeText(event);
  if (place) facts.push({ label: "Waar", value: shortenTitle(place, 42) });
  const age = ageText(event);
  if (age) facts.push({ label: "Leeftijd", value: age });
  const price = priceText(event);
  if (price) facts.push({ label: "Prijs", value: price });
  const org = (event.organizerName ?? "").trim();
  if (org) facts.push({ label: "Organisator", value: shortenTitle(org, 40) });
  return facts.slice(0, 4);
}

/** Typographic event page: monumental date, title, facts table. */
function EventTypeSlide({
  logoSrc,
  event,
  index,
  total,
  eyebrow,
}: {
  logoSrc: string;
  event: Event;
  index: number;
  total: number;
  eyebrow: string;
}) {
  const tone: SlideTone = "cream";
  const p = tonePalette(tone);
  // Char budgets keep text within two lines, so it ends on "…" instead of
  // being clipped mid-line by overflow:hidden.
  const title = shortenTitle(event.title, 48);
  const titleSize = title.length > 36 ? 62 : title.length > 24 ? 70 : 80;
  // Only the organiser's own description; no generated filler sentence.
  const rawBlurb = sanitizeInstagramBlurb(event.shortDescription || "");
  const blurb = rawBlurb ? shortenTitle(rawBlurb, 104) : null;
  const facts = eventFacts(event);
  const m = monthIndex(event.startDate);

  return (
    <div style={slideStyle(tone)}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: `${IG_MARGIN}px ${IG_MARGIN}px 60px`,
        }}
      >
        <Masthead markSrc={logoSrc} tone={tone} right={`${index} / ${total}`} />

        <div style={{ display: "flex", marginTop: 44 }}>
          <Label color={p.accent} size={22}>
            {(activityText(event) ?? eyebrow).toUpperCase()}
          </Label>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            marginTop: 14,
            gap: 32,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: 288,
              lineHeight: 0.8,
              letterSpacing: -12,
              color: p.accent,
            }}
          >
            {dayNumber(event.startDate)}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              paddingBottom: 6,
              gap: 2,
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Bricolage Grotesque",
                fontWeight: 700,
                fontSize: 48,
                lineHeight: 1.05,
                color: p.ink,
              }}
            >
              {WEEKDAY_LONG[weekdayIndex(event.startDate)]}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 48,
                lineHeight: 1.05,
                color: p.inkSoft,
                fontFamily: "DM Sans",
              }}
            >
              {MONTHS_LONG[m]}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 48,
                lineHeight: 1.05,
                color: p.ink,
                fontFamily: "DM Sans",
                fontWeight: 600,
              }}
            >
              {event.startTime ?? "uur volgt"}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: titleSize,
            lineHeight: 1.04,
            letterSpacing: -1.5,
            color: p.ink,
            marginTop: 44,
            maxHeight: titleSize * 1.04 * 2 + 4,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {title}
        </div>

        {blurb ? (
        <div
          style={{
            display: "flex",
            fontSize: 30,
            lineHeight: 1.4,
            color: p.inkSoft,
            marginTop: 22,
            fontFamily: "DM Sans",
            maxHeight: 30 * 1.4 * 2 + 2,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {blurb}
        </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            marginBottom: 34,
            flexShrink: 0,
          }}
        >
          {facts.map((f) => (
            <FactRow key={f.label} label={f.label} value={f.value} tone={tone} />
          ))}
        </div>

        <Colophon tone={tone} action="Inschrijven via de link in bio" />
      </div>
    </div>
  );
}

/** Real event photo on top (no wash), facts below. */
function EventPhotoSlide({
  logoSrc,
  heroSrc,
  showAtmosphereLabel,
  event,
  index,
  total,
  eyebrow,
}: {
  logoSrc: string;
  heroSrc: string;
  showAtmosphereLabel: boolean;
  event: Event;
  index: number;
  total: number;
  eyebrow: string;
}) {
  const tone: SlideTone = "cream";
  const p = tonePalette(tone);
  const title = shortenTitle(event.title, 50);
  const rawBlurb = sanitizeInstagramBlurb(event.shortDescription || "");
  // One line under the photo layout; the full text stays in the caption.
  const blurb = rawBlurb ? shortenTitle(rawBlurb, 58) : null;
  const facts = eventFacts(event).slice(0, 3);
  const when = `${WEEKDAY_LONG[weekdayIndex(event.startDate)]} ${dayNumber(event.startDate)} ${MONTHS_LONG[monthIndex(event.startDate)]}${event.startTime ? `, ${event.startTime}` : ""}`;
  const photoH = 620;

  return (
    <div style={slideStyle(tone)}>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1080,
          height: photoH,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          width={1080}
          height={photoH}
          style={{ width: 1080, height: photoH, objectFit: "cover" }}
          alt=""
        />
        <div style={{ display: "flex", position: "absolute", top: 40, right: 40 }}>
          <PhotoTag>{`${index} / ${total}`}</PhotoTag>
        </div>
        {showAtmosphereLabel ? (
          <div style={{ display: "flex", position: "absolute", left: 40, bottom: 40 }}>
            <PhotoTag>Sfeerbeeld</PhotoTag>
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: `44px ${IG_MARGIN}px 60px`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Label color={p.accent} size={22}>
            {(activityText(event) ?? eyebrow).toUpperCase()}
          </Label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={52} height={40} style={{ objectFit: "contain" }} alt="" />
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: 40,
            color: p.accent,
            marginTop: 18,
          }}
        >
          {when}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 1.05,
            letterSpacing: -1.2,
            color: p.ink,
            marginTop: 12,
            maxHeight: 56 * 1.05 * 2 + 4,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {title}
        </div>
        {blurb ? (
          <div
            style={{
              display: "flex",
              fontSize: 28,
              lineHeight: 1.4,
              color: p.inkSoft,
              marginTop: 14,
              fontFamily: "DM Sans",
              maxHeight: 40,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {blurb}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            marginBottom: 28,
            flexShrink: 0,
          }}
        >
          {facts.map((f) => (
            <FactRow key={f.label} label={f.label} value={f.value} tone={tone} />
          ))}
        </div>
        <Colophon tone={tone} action="Inschrijven via de link in bio" />
      </div>
    </div>
  );
}

/**
 * Individual event slide. `heroSrc` is the website-visible image of this
 * event ("" when none loaded → typographic slide). `showAtmosphereLabel`
 * tags mood / generated images as "Sfeerbeeld".
 */
export function EventSlide({
  logoSrc,
  heroSrc,
  event,
  index,
  total,
  eyebrow = "Binnenkort",
  showAtmosphereLabel = false,
}: {
  logoSrc: string;
  heroSrc: string;
  event: Event;
  index: number;
  total: number;
  eyebrow?: string;
  showAtmosphereLabel?: boolean;
}) {
  if (heroSrc) {
    return (
      <EventPhotoSlide
        logoSrc={logoSrc}
        heroSrc={heroSrc}
        showAtmosphereLabel={showAtmosphereLabel}
        event={event}
        index={index}
        total={total}
        eyebrow={eyebrow}
      />
    );
  }
  return (
    <EventTypeSlide
      logoSrc={logoSrc}
      event={event}
      index={index}
      total={total}
      eyebrow={eyebrow}
    />
  );
}
