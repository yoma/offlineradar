import { findPlace } from "@/data/places";
import type { Event } from "@/types/event";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

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

export function withUserDistance(event: Event, placeId: string): Event {
  const place = findPlace(placeId);
  return {
    ...event,
    distanceKm: distanceKmBetween(place, {
      lat: event.latitude,
      lng: event.longitude,
    }),
  };
}
