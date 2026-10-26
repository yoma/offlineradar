/**
 * Departure place choices for public search.
 * Any Belgian municipality or deelgemeente can be the origin of the radius;
 * the familiar departure towns come first when nothing is typed yet.
 */
import { USER_PLACES } from "@/data/places";
import {
  belgianPlaceLabel,
  findBelgianPlace,
  normalizePlaceKey,
  searchBelgianPlaces,
} from "@/lib/be-places";

export const ALL_LOCATIONS_ID = "all";
export const ALL_LOCATIONS_LABEL = "Alle locaties";

export type LocationOption = {
  id: string;
  label: string;
};

const ALL_OPTION: LocationOption = {
  id: ALL_LOCATIONS_ID,
  label: ALL_LOCATIONS_LABEL,
};

/**
 * Suggestions for what has been typed so far. Empty input: Alle locaties and
 * the departure towns. Otherwise matching Belgian places (name or postcode).
 */
export function locationSuggestions(
  query: string,
  limit = 12,
): LocationOption[] {
  const key = normalizePlaceKey(query);
  if (!key) {
    return [
      ALL_OPTION,
      ...USER_PLACES.map((place) => ({ id: place.id, label: place.label })),
    ];
  }
  const options: LocationOption[] = [];
  if (normalizePlaceKey(ALL_LOCATIONS_LABEL).startsWith(key)) {
    options.push(ALL_OPTION);
  }
  for (const place of searchBelgianPlaces(query, limit)) {
    options.push({ id: place.id, label: belgianPlaceLabel(place) });
  }
  return options.slice(0, limit);
}

/**
 * Place id for typed text, or null when it is not (yet) one place.
 * Accepts a suggestion label (“Aalst (9300)”), a name (“Zottegem”, “Luik”)
 * or “postcode name”.
 */
export function resolveLocationInput(text: string): string | null {
  const key = normalizePlaceKey(text);
  if (!key) return null;
  if (key === normalizePlaceKey(ALL_LOCATIONS_LABEL)) return ALL_LOCATIONS_ID;
  const departure = USER_PLACES.find(
    (place) => normalizePlaceKey(place.label) === key,
  );
  if (departure) return departure.id;
  const place = findBelgianPlace(text);
  if (place) return place.id;
  return null;
}
