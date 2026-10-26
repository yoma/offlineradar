/**
 * Nederlandstalige Instagram-captions.
 * Feiten komen uitsluitend uit Event; geen verzinnen.
 * Feed-links zijn niet betrouwbaar klikbaar → verwijs naar bio / website.
 * Nooit em-dashes; 3 tot 5 hashtags, waarvan minstens één lokaal.
 */

import { formatAgeRange, formatPrice, formatPriceFrom } from "@/lib/format";
import { formatDayMonth, weekdayIndex } from "@/lib/dates";
import type { Event } from "@/types/event";
import {
  INSTAGRAM_HANDLE,
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

/** Em-dashes read as machine text; a comma does the same job. */
export function noEmDash(text: string): string {
  return text.replace(/\s*—\s*/g, ", ");
}

const HASHTAGS_BASE = ["#DateOfflineHub", "#singlesBelgie"];
export const HASHTAGS_MAX = 5;

/** "Sint-Niklaas" → "sintniklaas", "Oost-Vlaanderen" → "oostvlaanderen". */
function tagSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Local tags: the shared city, else the shared province, else Vlaanderen. */
function localHashtags(events: Event[]): string[] {
  const cities = new Set(events.map((e) => tagSlug(e.city ?? "")));
  const regions = new Set(events.map((e) => tagSlug(e.region ?? "")));
  const city = cities.size === 1 ? [...cities][0]! : "";
  const region = regions.size === 1 ? [...regions][0]! : "";
  const out: string[] = [];
  if (city) out.push(`#singles${city}`);
  if (region && region !== city) out.push(city ? `#${region}` : `#singles${region}`);
  if (out.length === 0) out.push("#singlesvlaanderen");
  return out;
}

export function hashtagsFor(events: Event[]): string {
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
  return [...HASHTAGS_BASE, ...localHashtags(events), ...extra]
    .slice(0, HASHTAGS_MAX)
    .join(" ");
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
      `Inschrijven doe je rechtstreeks bij de organisator. Alle links staan via de link in bio en op ${INSTAGRAM_WEBSITE}.`,
      "",
      tags,
    ].join("\n");
    return {
      format,
      text: noEmDash(text),
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
      `Meer info en inschrijven via de link in bio of op ${INSTAGRAM_WEBSITE}.`,
      "",
      tags,
    ].join("\n");
    return {
      format,
      text: noEmDash(text),
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
    `Inschrijven doe je rechtstreeks bij de organisator. Alle links staan op ${INSTAGRAM_WEBSITE} (link in bio).`,
    "",
    INSTAGRAM_SLOGAN,
    "",
    tags,
  ].join("\n");

  return {
    format,
    text: noEmDash(text),
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
    `Meer info op ${INSTAGRAM_WEBSITE} (link in bio).`,
    "",
    INSTAGRAM_SLOGAN,
    "",
    hashtagsFor([event]),
  ].join("\n");
  return {
    format: "binnenkort",
    text: noEmDash(text),
    altHint: `${event.title}${city ? ` in ${city}` : ""}`,
  };
}
