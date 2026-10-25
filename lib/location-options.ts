/**
 * Location choices for public search.
 * Event cities come from published events that are still current.
 * Departure towns stay selectable even when no event takes place there.
 */
import { USER_PLACES } from "@/data/places";
import { isCurrentEvent, type EventVisibilityInput } from "@/lib/event-visibility";
import { inferKnownCityLabel } from "@/lib/geo-cities";
import { distanceOrigin, placeLabel } from "@/lib/distance";

export const ALL_LOCATIONS_ID = "all";

export type LocationOptionKind = "all" | "city" | "departure" | "selected";

export type LocationOption = {
  id: string;
  label: string;
  /** Current events whose canonical city is this label. Alle locaties counts every current event. */
  count: number;
  kind: LocationOptionKind;
};

export type LocationEvent = EventVisibilityInput & {
  city: string | null | undefined;
};

export function cityOptionId(label: string): string {
  const place = USER_PLACES.find((item) => item.label === label);
  if (place) return place.id;
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function canonicalEventCity(
  city: string | null | undefined,
): string | null {
  return inferKnownCityLabel(city);
}

export function fallbackLocationOptions(): LocationOption[] {
  return [
    {
      id: ALL_LOCATIONS_ID,
      label: "Alle locaties",
      count: 0,
      kind: "all",
    },
    ...USER_PLACES.map((place) => ({
      id: place.id,
      label: place.label,
      count: 0,
      kind: "departure" as const,
    })),
  ];
}

/**
 * Alle locaties first, then current event cities and departure towns,
 * sorted by Dutch label. A selected id that is not in the offer stays
 * in the list so the control does not jump.
 */
export function locationOptionsFromEvents(
  events: LocationEvent[],
  now = new Date(),
  selectedId?: string | null,
): LocationOption[] {
  const current = events.filter((event) => isCurrentEvent(event, now));
  const counts = new Map<string, number>();
  for (const event of current) {
    const label = canonicalEventCity(event.city);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const options: LocationOption[] = [
    {
      id: ALL_LOCATIONS_ID,
      label: "Alle locaties",
      count: current.length,
      kind: "all",
    },
  ];
  const seen = new Set<string>([ALL_LOCATIONS_ID]);

  for (const [label, count] of counts) {
    const id = cityOptionId(label);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label, count, kind: "city" });
  }

  for (const place of USER_PLACES) {
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    options.push({
      id: place.id,
      label: place.label,
      count: 0,
      kind: "departure",
    });
  }

  const [all, ...rest] = options;
  rest.sort((a, b) => a.label.localeCompare(b.label, "nl"));
  return ensureSelectedLocation([all!, ...rest], selectedId);
}

/**
 * Closed and open option text.
 * A number is always an activity count. A place with no current activity
 * stays selectable as a distance departure.
 */
export function formatLocationOptionLabel(option: LocationOption): string {
  if (option.kind === "all") {
    const noun = option.count === 1 ? "activiteit" : "activiteiten";
    return `${option.label} (${option.count} ${noun})`;
  }
  // City counts are events in that city; results use a radius around it
  // (plus trips), so say what the number means.
  if (option.count > 0) return `${option.label} (${option.count} in de stad)`;
  if (
    option.kind === "departure" ||
    (option.kind === "selected" && distanceOrigin(option.id))
  ) {
    return `${option.label} (vertrekpunt)`;
  }
  return option.label;
}

export function ensureSelectedLocation(
  options: LocationOption[],
  selectedId?: string | null,
): LocationOption[] {
  if (!selectedId) return options;
  if (options.some((option) => option.id === selectedId)) return options;
  return [
    ...options,
    {
      id: selectedId,
      label: placeLabel(selectedId),
      count: 0,
      kind: "selected",
    },
  ];
}
