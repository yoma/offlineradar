import { USER_PLACES, type Place } from "@/data/places";
import { belgianPlaceById, belgianPlaceLabel } from "@/lib/be-places";
import { coordsForCity, inferKnownCityLabel } from "@/lib/geo-cities";
import type { Event } from "@/types/event";

/** Same id as location-options ALL_LOCATIONS_ID. Kept here to avoid a cycle. */
const ALL_LOCATIONS_ID = "all";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Great-circle (haversine) distance in whole km, as the crow flies.
 * Filters compare this rounded value, so a result list never shows
 * “50 km” for an event that a 50 km radius left out.
 */
export function distanceKmBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/**
 * Distance origin for a search place.
 * “Alle locaties” and unknown ids have no origin, so they never snap to Antwerpen.
 */
export function distanceOrigin(placeId: string): Place | null {
  if (!placeId || placeId === ALL_LOCATIONS_ID) return null;
  const known = USER_PLACES.find((place) => place.id === placeId);
  if (known) return known;
  const belgian = belgianPlaceById(placeId);
  if (belgian) {
    return {
      id: belgian.id,
      label: belgianPlaceLabel(belgian),
      lat: belgian.lat,
      lng: belgian.lng,
    };
  }
  const coords = coordsForCity(placeId);
  const label = inferKnownCityLabel(placeId);
  if (!coords || !label) return null;
  return { id: placeId, label, lat: coords.lat, lng: coords.lng };
}

export function placeLabel(placeId: string): string {
  if (placeId === ALL_LOCATIONS_ID) return "Alle locaties";
  return distanceOrigin(placeId)?.label ?? placeId;
}

/**
 * Rough box around Belgium (with a few km of border towns). Coordinates
 * outside it are a destination abroad, so the event counts as a trip.
 */
const BELGIUM_AREA = { minLat: 49.45, maxLat: 51.55, minLng: 2.5, maxLng: 6.45 };

export function isInBelgiumArea(coords: { lat: number; lng: number }): boolean {
  return (
    coords.lat >= BELGIUM_AREA.minLat &&
    coords.lat <= BELGIUM_AREA.maxLat &&
    coords.lng >= BELGIUM_AREA.minLng &&
    coords.lng <= BELGIUM_AREA.maxLng
  );
}

export function withUserDistance(event: Event, placeId: string): Event {
  const place = distanceOrigin(placeId);
  if (
    !place ||
    !Number.isFinite(event.latitude) ||
    !Number.isFinite(event.longitude)
  ) {
    return { ...event, distanceKm: Number.POSITIVE_INFINITY };
  }
  return {
    ...event,
    distanceKm: distanceKmBetween(place, {
      lat: event.latitude,
      lng: event.longitude,
    }),
  };
}
