/**
 * Turn a feed-post draft (same events, same format) into reel props.
 * Facts come only from the Event, exactly as on the slides; nothing is
 * invented. Texts never use em-dashes.
 */

import { ACTIVITY_LABEL, formatAgeRange, formatPrice, formatPriceFrom } from "@/lib/format";
import { addDays, brusselsToday, diffDays, weekdayIndex, weekendRange } from "@/lib/dates";
import { sanitizeInstagramBlurb } from "@/lib/instagram/blurb";
import { noEmDash } from "@/lib/instagram/captions";
import {
  INSTAGRAM_SLOGAN,
  INSTAGRAM_WEBSITE,
  type InstagramFormatId,
} from "@/lib/instagram/constants";
import type { InstagramReelConfig } from "@/lib/instagram/reel/config";
import {
  REEL_FPS,
  reelDurationInFrames,
  type ReelEvent,
  type ReelLayout,
  type ReelMusic,
  type ReelProps,
  type ReelTiming,
} from "@/lib/instagram/reel/types";
import { shortenTitle } from "@/lib/instagram/title";
import type { ActivityId, Event } from "@/types/event";

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
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
] as const;
const MONTHS_LONG = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
] as const;

const HOOK_FRAMES = 75;
const CTA_FRAMES = 75;
const OVERLAP_FRAMES = 10;
const SINGLE_FRAMES = 150;
/** Each event card stays 2.5–3.5 s on screen, long enough to read it. */
const CARD_MIN_FRAMES = 75;
const CARD_MAX_FRAMES = 105;

/** Replace em-dashes (house rule) with a comma. */
export { noEmDash };

function activityText(event: Event): string | null {
  const id = event.activities[0] as ActivityId | undefined;
  return id && ACTIVITY_LABEL[id] ? ACTIVITY_LABEL[id] : null;
}

function ageText(event: Event): string | null {
  if (event.eligibilityAgeRule === "unknown") return null;
  const range = formatAgeRange(event.eligibilityAgeMin, event.eligibilityAgeMax);
  if (!range) return null;
  return event.eligibilityAgeRule === "guideline" ? `richtleeftijd ${range}` : range;
}

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

function toReelEvent(event: Event, withBlurb: boolean): ReelEvent {
  const m = Number(event.startDate.slice(5, 7)) - 1;
  const wd = weekdayIndex(event.startDate);
  const facts: { label: string; value: string }[] = [];
  const place = placeText(event);
  if (place) facts.push({ label: "Waar", value: shortenTitle(place, 34) });
  const age = ageText(event);
  if (age) facts.push({ label: "Leeftijd", value: age });
  const price = priceText(event);
  if (price) facts.push({ label: "Prijs", value: price });
  const org = (event.organizerName ?? "").trim();
  if (org) facts.push({ label: "Organisator", value: shortenTitle(org, 30) });
  const rawBlurb = withBlurb ? sanitizeInstagramBlurb(event.shortDescription || "") : null;
  return {
    id: event.id,
    activity: activityText(event),
    title: noEmDash(shortenTitle(event.title, 48)),
    day: String(Number(event.startDate.slice(8, 10))),
    weekday: WEEKDAY_LONG[wd],
    weekdayShort: WEEKDAY_SHORT[wd],
    month: MONTHS_LONG[m],
    monthShort: MONTHS_SHORT[m],
    time: event.startTime ?? "uur volgt",
    city: (event.city ?? "").trim(),
    meta: [(event.city ?? "").trim(), event.startTime ?? null, ageText(event)]
      .filter(Boolean)
      .join("  ·  "),
    blurb: rawBlurb ? noEmDash(shortenTitle(rawBlurb, 110)) : null,
    facts: facts.slice(0, 4).map((f) => ({ ...f, value: noEmDash(f.value) })),
  };
}

const REGION_PHRASE: Record<string, string> = {
  antwerpen: "in de provincie Antwerpen",
  limburg: "in Limburg",
  "oost-vlaanderen": "in Oost-Vlaanderen",
  "west-vlaanderen": "in West-Vlaanderen",
  "vlaams-brabant": "in Vlaams-Brabant",
  brussel: "in Brussel",
  ardennen: "in de Ardennen",
};

/** "in Gent" when all events share a city, else the province, else nothing. */
export function hookWhere(events: Event[]): string | null {
  const cities = new Set(events.map((e) => (e.city ?? "").trim()).filter(Boolean));
  if (cities.size === 1 && events.every((e) => (e.city ?? "").trim())) {
    return `in ${[...cities][0]}`;
  }
  const regions = new Set(events.map((e) => (e.region ?? "").trim().toLowerCase()));
  if (regions.size === 1) return REGION_PHRASE[[...regions][0]!] ?? null;
  return null;
}

/** "dit weekend", "morgen", "op za 31 okt", "deze week", ... */
export function hookWhen(
  events: Event[],
  format: InstagramFormatId,
  today: string,
): string {
  const dates = events.map((e) => e.startDate).sort();
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  if (first === last) {
    if (first === today) return "vandaag";
    if (first === addDays(today, 1)) return "morgen";
  }
  const weekend = weekendRange(today);
  const friday = addDays(weekend.start, -1);
  if (first >= friday && last <= weekend.end && diffDays(today, last) <= 7) {
    return "dit weekend";
  }
  if (first === last) {
    const wd = weekdayIndex(first);
    const m = Number(first.slice(5, 7)) - 1;
    return `op ${WEEKDAY_SHORT[wd]} ${Number(first.slice(8, 10))} ${MONTHS_SHORT[m]}`;
  }
  if (format === "deze_week" || diffDays(today, last) <= 6) return "deze week";
  return "de komende weken";
}

export function buildReelHook(
  format: InstagramFormatId,
  events: Event[],
  today: string,
): { kicker: string; count: string | null; lines: string[]; text: string } {
  const n = events.length;
  const where = hookWhere(events);
  const when = hookWhen(events, format, today);
  const tail = [where, when].filter((l): l is string => Boolean(l));
  if (n === 1) {
    const lines = ["Singles-event", ...tail];
    return {
      kicker: activityText(events[0]!) ?? "Uitgelicht",
      count: null,
      lines,
      text: lines.join(" "),
    };
  }
  const noun = format === "nieuw" ? "nieuwe singles-events" : "singles-events";
  const kicker =
    format === "nieuw" ? "Nieuw op de agenda" : format === "deze_week" ? "Deze week" : "Op de agenda";
  return {
    kicker,
    count: String(n),
    lines: [noun, ...tail],
    text: [String(n), noun, ...tail].join(" "),
  };
}

function layoutFor(format: InstagramFormatId, eventCount: number): ReelLayout {
  if (eventCount === 1) return "single";
  if (format === "deze_week") return "listing";
  return "cards";
}

export function buildReelTiming(
  layout: ReelLayout,
  eventCount: number,
  config: Pick<InstagramReelConfig, "minSeconds" | "maxSeconds">,
): { layout: ReelLayout; timing: ReelTiming } {
  const minFrames = Math.round(config.minSeconds * REEL_FPS);
  const maxFrames = Math.round(config.maxSeconds * REEL_FPS);
  const fixed = HOOK_FRAMES + CTA_FRAMES;
  const base = { hookFrames: HOOK_FRAMES, ctaFrames: CTA_FRAMES, overlapFrames: OVERLAP_FRAMES };

  let bodyFrames: number;
  if (layout === "cards") {
    const budget = maxFrames - fixed + OVERLAP_FRAMES * (eventCount + 1);
    const per = Math.floor(budget / eventCount);
    // Too many events to read one by one: show them as one agenda page.
    if (per < CARD_MIN_FRAMES) return buildReelTiming("listing", eventCount, config);
    bodyFrames = Math.min(CARD_MAX_FRAMES, per);
  } else if (layout === "listing") {
    bodyFrames = 70 + 12 * eventCount + 60;
  } else {
    bodyFrames = SINGLE_FRAMES;
  }

  const scenes = layout === "cards" ? eventCount : 1;
  let timing: ReelTiming = { ...base, bodyFrames };
  const total = reelDurationInFrames(timing, layout, eventCount);
  if (total < minFrames) {
    timing = { ...timing, bodyFrames: bodyFrames + Math.ceil((minFrames - total) / scenes) };
  } else if (total > maxFrames) {
    timing = { ...timing, bodyFrames: bodyFrames - Math.ceil((total - maxFrames) / scenes) };
  }
  return { layout, timing };
}

export function buildReelProps(args: {
  format: InstagramFormatId;
  events: Event[];
  /** Publication moment: "dit weekend" etc. are relative to this. */
  publishAt: Date;
  config: Pick<InstagramReelConfig, "minSeconds" | "maxSeconds">;
  music: ReelMusic;
}): ReelProps {
  const { format, events } = args;
  if (events.length === 0) throw new Error("Een reel heeft minstens één event nodig.");
  const today = brusselsToday(args.publishAt);
  const hook = buildReelHook(format, events, today);
  const { layout, timing } = buildReelTiming(
    layoutFor(format, events.length),
    events.length,
    args.config,
  );
  return {
    layout,
    hook: { count: hook.count, lines: hook.lines.map(noEmDash) },
    hookText: noEmDash(hook.text),
    hookKicker: noEmDash(hook.kicker),
    sectionLabel:
      layout === "single" ? "Uitgelicht" : format === "deze_week" ? "Deze week" : format === "nieuw" ? "Nieuw" : "Agenda",
    events: events.map((e) => toReelEvent(e, layout === "single")),
    timing,
    music: args.music,
    website: INSTAGRAM_WEBSITE,
    slogan: noEmDash(INSTAGRAM_SLOGAN),
  };
}
