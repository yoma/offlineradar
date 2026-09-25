import type { CapacityStatus, Event } from "@/types/event";
import {
  brusselsToday,
  diffDays,
  formatDayMonth,
  formatLongDate,
  formatWeekday,
  weekdayIndex,
} from "@/lib/dates";

export function formatAgeRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} jaar`;
  if (min != null) return `${min}+ jaar`;
  return `tot ${max} jaar`;
}

export function formatPrice(price: number | null, currency = "EUR"): string {
  if (price == null) return "Prijs onbekend";
  if (price === 0) return "Gratis";
  const hasCents = Math.round(price * 100) % 100 !== 0;
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(price);
}

/** When the source shows a lowest known ticket price among several types. */
export function formatPriceFrom(price: number | null, currency = "EUR"): string {
  if (price == null) return "Prijs onbekend";
  return `v.a. ${formatPrice(price, currency)}`;
}

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;

/**
 * Card date line: "wo 7 okt · 19:00"
 * Does not invent end times. When startTime is missing, say so explicitly.
 */
export function formatCardWhen(
  event: Pick<Event, "startDate" | "startTime"> & {
    startTimeDisplayNote?: string | null;
  },
): string {
  const day = WEEKDAY_SHORT[weekdayIndex(event.startDate)];
  const datePart = `${day} ${formatDayMonth(event.startDate)}`;
  if (event.startTimeDisplayNote) {
    return `${datePart} · ${event.startTimeDisplayNote}`;
  }
  if (!event.startTime) {
    return `${datePart} · startuur nog te bevestigen`;
  }
  return `${datePart} · ${event.startTime}`;
}

export function formatEventWhen(
  event: Pick<Event, "startDate" | "endDate" | "startTime"> & {
    startTimeDisplayNote?: string | null;
  },
): string {
  if (event.endDate && event.endDate !== event.startDate) {
    return `${formatLongDate(event.startDate)} - ${formatLongDate(event.endDate)}`;
  }
  return formatCardWhen(event);
}

export function formatSchedule(
  event: Pick<Event, "startDate" | "endDate" | "startTime" | "endTime"> & {
    startTimeDisplayNote?: string | null;
  },
): string {
  const when = formatLongDate(event.startDate);
  if (event.endDate && event.endDate !== event.startDate) {
    const range = `${formatLongDate(event.startDate)} - ${formatLongDate(event.endDate)}`;
    if (event.startTimeDisplayNote) return `${range}, ${event.startTimeDisplayNote}`;
    return event.startTime ? `${range}, vertrek ${event.startTime}` : range;
  }
  if (event.startTimeDisplayNote) {
    return `${when}, ${event.startTimeDisplayNote}`;
  }
  if (event.startTime && event.endTime) {
    return `${when}, ${event.startTime}-${event.endTime}`;
  }
  if (event.startTime) return `${when}, ${event.startTime}`;
  return when;
}

/** Card/detail deadline line. Only when a real deadline exists. */
export function formatDeadlineLabel(
  deadline: string | null,
  now = new Date(),
): string | null {
  if (!deadline) return null;
  const today = brusselsToday(now);
  const days = diffDays(today, deadline);
  if (days < 0) return `Inschrijving gesloten`;
  if (days === 0) return "Inschrijving sluit vandaag";
  if (days === 1) return "Inschrijving sluit morgen";
  if (days <= 3) return `Inschrijving sluit over ${days} dagen`;
  return `Inschrijven t.e.m. ${formatDayMonth(deadline)}`;
}

export function formatDeadlineDetail(deadline: string | null): string {
  if (!deadline) return "niet vermeld";
  return formatLongDate(deadline);
}

const CAPACITY_LABEL: Record<CapacityStatus, string> = {
  available: "Plaats genoeg",
  limited: "Beperkt",
  almost_full: "Bijna vol",
  sold_out: "Volzet",
  waitlist: "Wachtlijst",
  unknown: "Beschikbaarheid onbekend",
};

export function capacityLabel(status: CapacityStatus): string {
  return CAPACITY_LABEL[status];
}

export const CATEGORY_LABEL = {
  dating: "Dating",
  meet_new_people: "Nieuwe mensen",
  social: "Sociaal",
} as const;

export const ACTIVITY_LABEL = {
  eten: "Eten",
  drinken: "Drinken",
  wandelen: "Wandelen",
  lopen: "Lopen",
  sport: "Sport",
  padel: "Padel",
  party: "Uitgaan",
  dans: "Dans",
  workshop: "Workshop",
  reizen: "Reizen",
  weekend: "Weekend",
  outdoor: "Buiten",
} as const;

export const ACTIVITY_FIT = {
  eten: "Dit is een activiteit rond eten",
  drinken: "Dit is een activiteit rond drinken",
  wandelen: "Dit is een wandeling",
  lopen: "Dit is een loopactiviteit",
  sport: "Dit is een sportieve activiteit",
  padel: "Dit is padel",
  party: "Dit is een uitgaansactiviteit",
  dans: "Dit is een dansavond",
  workshop: "Dit is een workshop",
  reizen: "Dit is een reis of uitstap",
  weekend: "Dit is een weekendactiviteit",
  outdoor: "Dit is een buitenactiviteit",
} as const;

export const WHEN_LABEL = {
  any: "Binnenkort",
  today: "Vandaag",
  tomorrow: "Morgen",
  weekend: "Dit weekend",
  next_week: "Volgende week",
  month: "Deze maand",
  date: "Gekozen datum",
} as const;

export const PRICE_LABEL = {
  any: "Alle prijzen",
  free: "Gratis",
  lt25: "< €25",
  mid: "€25-50",
  gt50: "€50+",
} as const;

export const AVAILABILITY_LABEL = {
  any: "Alle beschikbaarheid",
  open: "Beschikbare events",
  almost_full: "Bijna vol",
  waitlist: "Wachtlijst",
} as const;

export const SORT_LABEL = {
  match: "Beste match",
  soon: "Binnenkort",
  distance: "Dichtstbij",
  newest: "Nieuw toegevoegd",
} as const;

export const GENDER_LABEL = {
  man: "Man",
  woman: "Vrouw",
  other: "Anders / geen van beide",
  prefer_not: "Zeg ik liever niet",
} as const;

export const MEET_GENDER_LABEL = {
  women: "Vrouwen",
  men: "Mannen",
  anyone: "Iedereen / geen voorkeur",
} as const;

/** Short chip / sentence fragment for meet-gender preference. */
export const MEET_GENDER_SHORT = {
  women: "vrouwen",
  men: "mannen",
  anyone: null,
} as const;

/**
 * Active meet preference as natural Dutch, e.g.
 * "vrouwen van 18–20 jaar", "mensen van 25–55 jaar", "vrouwen".
 * Null when nothing is set.
 */
export function formatMeetPreference(
  preferredMeetGender: "women" | "men" | "anyone",
  preferredAgeMin: number | null,
  preferredAgeMax: number | null,
): string | null {
  const age = formatAgeRange(preferredAgeMin, preferredAgeMax);
  const who = MEET_GENDER_SHORT[preferredMeetGender];
  if (who && age) return `${who} van ${age}`;
  if (who) return who;
  if (age) return `mensen van ${age}`;
  return null;
}

/** Sentence for detail / results: "Je ontmoet liefst …" */
export function formatMeetPreferenceSentence(
  preferredMeetGender: "women" | "men" | "anyone",
  preferredAgeMin: number | null,
  preferredAgeMax: number | null,
): string | null {
  const preference = formatMeetPreference(
    preferredMeetGender,
    preferredAgeMin,
    preferredAgeMax,
  );
  if (!preference) return null;
  return `Je ontmoet liefst ${preference}.`;
}

export const DISTANCES = [10, 25, 50, 100] as const;
