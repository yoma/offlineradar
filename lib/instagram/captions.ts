/**
 * Nederlandstalige Instagram-captions.
 * Feiten komen uitsluitend uit Event; geen verzinnen.
 * Feed-links zijn niet betrouwbaar klikbaar → verwijs naar bio / website.
 */

import { formatAgeRange, formatPrice, formatPriceFrom } from "@/lib/format";
import { formatDayMonth, weekdayIndex } from "@/lib/dates";
import type { Event } from "@/types/event";
import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_LINK_PAGE_LABEL,
  INSTAGRAM_SLOGAN,
  INSTAGRAM_WEBSITE,
  type InstagramFormatId,
} from "@/lib/instagram/constants";

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;

function igWhen(event: Event): string {
  const day = WEEKDAY_SHORT[weekdayIndex(event.startDate)];
  const datePart = `${day} ${formatDayMonth(event.startDate)}`;
  if (event.startTime) return `${datePart} · ${event.startTime}`;
  return `${datePart} · uur volgt`;
}

function ageLine(event: Event): string | null {
  if (
    event.eligibilityAgeMin == null &&
    event.eligibilityAgeMax == null
  ) {
    return null;
  }
  const range = formatAgeRange(
    event.eligibilityAgeMin,
    event.eligibilityAgeMax,
  );
  if (!range) return null;
  if (event.eligibilityAgeRule === "guideline") {
    return `richtleeftijd ${range}`;
  }
  if (event.eligibilityAgeRule === "strict") {
    return range;
  }
  return null;
}

function priceLine(event: Event): string | null {
  if (event.price == null) return null;
  return event.priceIsFrom
    ? formatPriceFrom(event.price, event.currency)
    : formatPrice(event.price, event.currency);
}

/** Agenda line: "ma 26 okt, 19:30 · Speeddate Gent (Gent)" */
function eventBullet(event: Event): string {
  const day = WEEKDAY_SHORT[weekdayIndex(event.startDate)];
  const when = event.startTime
    ? `${day} ${formatDayMonth(event.startDate)}, ${event.startTime}`
    : `${day} ${formatDayMonth(event.startDate)}`;
  const city = (event.city ?? "").trim();
  const titleHasCity =
    city && event.title.toLowerCase().includes(city.toLowerCase());
  return `${when} · ${event.title}${city && !titleHasCity ? ` (${city})` : ""}`;
}

const HASHTAGS_BASE = [
  "#DateOfflineHub",
  "#singlesBelgie",
  "#offline",
  "#echteconnecties",
];

function hashtagsFor(events: Event[]): string {
  const extra: string[] = [];
  const activities = new Set(events.flatMap((e) => e.activities));
  if (activities.has("speeddate")) extra.push("#speeddate");
  if (activities.has("wandelen") || activities.has("outdoor")) {
    extra.push("#singleswandeling");
  }
  if (activities.has("party") || activities.has("dans")) {
    extra.push("#singlesfeest");
  }
  if (activities.has("reizen") || activities.has("weekend")) {
    extra.push("#singlesweekend");
  }
  if (activities.has("eten") || activities.has("drinken")) {
    extra.push("#singlesdiner");
  }
  if (activities.has("sport") || activities.has("padel")) {
    extra.push("#singlessport");
  }
  return [...HASHTAGS_BASE, ...extra.slice(0, 3)].join(" ");
}

export type InstagramCaption = {
  format: InstagramFormatId;
  text: string;
  /** Short alt text for accessibility / Meta later. */
  altHint: string;
};

export function buildInstagramCaption(
  format: InstagramFormatId,
  events: Event[],
  periodLabel: string,
): InstagramCaption {
  if (events.length === 0) {
    return {
      format,
      text: `${INSTAGRAM_HANDLE}\n\nMomenteel geen geschikte evenementen voor deze post.\n\n${INSTAGRAM_WEBSITE}`,
      altHint: "DateOfflineHub: geen activiteiten",
    };
  }

  const bullets = events.map(eventBullet).join("\n");
  const tags = hashtagsFor(events);

  if (format === "deze_week") {
    const text = [
      "Nog niets gepland deze week?",
      "",
      periodLabel
        ? `Hier ontmoet je singles in het echt, van ${periodLabel}:`
        : "Hier ontmoet je deze week singles in het echt:",
      "",
      bullets,
      "",
      `Inschrijven doe je rechtstreeks bij de organisator. Alle links: ${INSTAGRAM_LINK_PAGE_LABEL} (of tik op de link in bio).`,
      "",
      tags,
    ].join("\n");
    return {
      format,
      text,
      altHint: `Deze week op DateOfflineHub: ${events.length} activiteiten`,
    };
  }

  if (format === "nieuw") {
    const detailLines = events.map((event) => {
      const bits = [
        igWhen(event),
        event.city,
        ageLine(event),
        priceLine(event),
      ].filter(Boolean);
      return `${event.title}\n${bits.join(" · ")}`;
    });
    const text = [
      "Nieuw op de agenda",
      "",
      detailLines.join("\n\n"),
      "",
      `Meer info en inschrijven: ${INSTAGRAM_LINK_PAGE_LABEL} (of tik op de link in bio).`,
      "",
      tags,
    ].join("\n");
    return {
      format,
      text,
      altHint: `Nieuw op DateOfflineHub: ${events[0].title}`,
    };
  }

  // Format A: binnenkort te beleven (al op de site, binnenkort te doen)
  const text = [
    periodLabel ? `Binnenkort te beleven, ${periodLabel}` : "Binnenkort te beleven",
    "",
    "Singlesactiviteiten in Vlaanderen en Brussel. Swipe voor de details per activiteit.",
    "",
    bullets,
    "",
    `Inschrijven doe je rechtstreeks bij de organisator. Alle links: ${INSTAGRAM_LINK_PAGE_LABEL} (of tik op de link in bio).`,
    "",
    INSTAGRAM_SLOGAN,
    "",
    tags,
  ].join("\n");

  return {
    format,
    text,
    altHint: `Binnenkort te beleven: ${events.length} activiteiten`,
  };
}

/** Caption for a post about one event (facts from Event only). */
export function buildSingleEventCaption(event: Event): InstagramCaption {
  const city = (event.city ?? "").trim();
  const facts = [ageLine(event), priceLine(event)].filter(Boolean).join(" · ");
  const blurb = (event.shortDescription ?? "").trim();
  const organizer = (event.organizerName ?? "").trim();
  const text = [
    event.title,
    "",
    [igWhen(event), city].filter(Boolean).join(" · "),
    ...(facts ? [facts] : []),
    ...(blurb
      ? ["", blurb.length > 400 ? `${blurb.slice(0, 397).trimEnd()}…` : blurb]
      : []),
    "",
    `Inschrijven doe je rechtstreeks bij ${organizer || "de organisator"}.`,
    `Meer info: ${INSTAGRAM_WEBSITE}/event/${event.slug} (of tik op de link in bio).`,
    "",
    INSTAGRAM_SLOGAN,
    "",
    hashtagsFor([event]),
  ].join("\n");
  return {
    format: "binnenkort",
    text,
    altHint: `${event.title}${city ? ` in ${city}` : ""}`,
  };
}
