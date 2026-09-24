import type { CapacityStatus, Event } from "@/types/event";
import { formatLongDate, formatWeekday } from "@/lib/dates";

export function formatAgeRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}-${max} jaar`;
  if (min != null) return `${min}+ jaar`;
  return `tot ${max} jaar`;
}

export function formatPrice(price: number | null, currency = "EUR"): string {
  if (price == null) return "Prijs onbekend";
  if (price === 0) return "Gratis";
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatEventWhen(event: Pick<
  Event,
  "startDate" | "endDate" | "startTime"
>): string {
  if (event.endDate && event.endDate !== event.startDate) {
    return `${formatLongDate(event.startDate)} - ${formatLongDate(event.endDate)}`;
  }
  const day = formatWeekday(event.startDate);
  return event.startTime ? `${day} ${event.startTime}` : day;
}

export function formatSchedule(event: Pick<
  Event,
  "startDate" | "endDate" | "startTime" | "endTime"
>): string {
  const when = formatLongDate(event.startDate);
  const time =
    event.startTime && event.endTime
      ? `${event.startTime}-${event.endTime}`
      : event.startTime;
  if (event.endDate && event.endDate !== event.startDate) {
    const range = `${formatLongDate(event.startDate)} - ${formatLongDate(event.endDate)}`;
    return time ? `${range}, vertrek ${time}` : range;
  }
  return time ? `${when}, ${time}` : when;
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
  meet_new_people: "Meet new people",
  social: "Social",
} as const;

export const ACTIVITY_LABEL = {
  eten: "Eten",
  drinken: "Drinken",
  wandelen: "Wandelen",
  lopen: "Lopen",
  sport: "Sport",
  padel: "Padel",
  party: "Party",
  dans: "Dans",
  workshop: "Workshop",
  reizen: "Reizen",
  weekend: "Weekend",
  outdoor: "Outdoor",
} as const;

export const ACTIVITY_FIT = {
  eten: "Je zoekt iets rond eten",
  drinken: "Je zoekt iets rond drinken",
  wandelen: "Je zoekt een wandeling",
  lopen: "Je zoekt een loopactiviteit",
  sport: "Je zoekt sportieve activiteiten",
  padel: "Je zoekt padel",
  party: "Je zoekt een feestje",
  dans: "Je zoekt een dansavond",
  workshop: "Je zoekt een workshop",
  reizen: "Je zoekt een reis of uitstap",
  weekend: "Je zoekt een weekendactiviteit",
  outdoor: "Je zoekt iets buiten",
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

export const DISTANCES = [10, 25, 50, 100] as const;
