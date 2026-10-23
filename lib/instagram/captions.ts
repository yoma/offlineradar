/**
 * Nederlandstalige Instagram-captions.
 * Feiten komen uitsluitend uit Event; geen verzinnen.
 * Feed-links zijn niet betrouwbaar klikbaar → verwijs naar bio / website.
 */

import { formatAgeRange, formatPrice, formatPriceFrom, ACTIVITY_LABEL } from "@/lib/format";
import { formatDayMonth, weekdayIndex } from "@/lib/dates";
import type { ActivityId, Event } from "@/types/event";
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
  return `${datePart} · startuur te bevestigen`;
}

function activityLabel(event: Event): string | null {
  const id = event.activities[0] as ActivityId | undefined;
  if (!id) return null;
  return ACTIVITY_LABEL[id] ?? null;
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

function eventBullet(event: Event): string {
  const parts = [
    igWhen(event),
    event.city,
    activityLabel(event),
  ].filter(Boolean);
  return `• ${event.title} — ${parts.join(" · ")}`;
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
      altHint: "DateOfflineHub — geen evenementen",
    };
  }

  const bullets = events.map(eventBullet).join("\n");
  const tags = hashtagsFor(events);

  if (format === "deze_week") {
    const text = [
      "Deze week nog iets gepland?",
      "",
      `Een paar singlesactiviteiten tussen ${periodLabel} — in het echt, niet op een app.`,
      "",
      bullets,
      "",
      `Meer info en details: link in bio of ${INSTAGRAM_WEBSITE}`,
      "",
      INSTAGRAM_SLOGAN,
      "",
      tags,
    ].join("\n");
    return {
      format,
      text,
      altHint: `Deze week op DateOfflineHub — ${events.length} activiteiten`,
    };
  }

  if (format === "nieuw") {
    const detailLines = events.map((event) => {
      const bits = [
        igWhen(event),
        event.city,
        activityLabel(event),
        ageLine(event),
        priceLine(event),
      ].filter(Boolean);
      return `${event.title}\n${bits.join(" · ")}`;
    });
    const text = [
      "Nieuw op DateOfflineHub",
      "",
      "Fris gepubliceerd — weekends, reizen of een nieuwe organisator.",
      "",
      detailLines.join("\n\n"),
      "",
      `Bekijk alles via de link in bio · ${INSTAGRAM_WEBSITE}`,
      "",
      tags,
    ].join("\n");
    return {
      format,
      text,
      altHint: `Nieuw op DateOfflineHub — ${events[0].title}`,
    };
  }

  // Format A — binnenkort te beleven (al op de site, binnenkort te doen)
  const text = [
    "Binnenkort te beleven",
    periodLabel ? `Periode: ${periodLabel}` : null,
    "",
    "Singlesactiviteiten in Vlaanderen en Brussel — offline, in het echt. Al te vinden via DateOfflineHub.",
    "",
    bullets,
    "",
    `Alle details op ${INSTAGRAM_WEBSITE} (of via de link in bio).`,
    "",
    INSTAGRAM_SLOGAN,
    "",
    tags,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    format,
    text,
    altHint: `Binnenkort te beleven — ${events.length} evenementen`,
  };
}
