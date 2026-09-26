import { buildMockEvents } from "@/data/events";
import {
  getPublishedEditionBySlug,
  listPublishedEditionBundles,
} from "@/lib/events/neon-store";
import { mapEditionToConsumerEvent } from "@/lib/events/map-to-consumer";
import { isActiveMeetActivation } from "@/types/domain";
import type { Event } from "@/types/event";

/**
 * Event data access for the public catalog.
 *
 * OFFLINERADAR_EVENTS_CANONICAL_FEED=1 → Neon published editions only.
 * Otherwise → local mock feed (rollback path). Never mix the two.
 */

export class EventsCatalogUnavailableError extends Error {
  constructor(message = "Eventcatalogus tijdelijk niet beschikbaar.") {
    super(message);
    this.name = "EventsCatalogUnavailableError";
  }
}

export function isCanonicalEventsFeedEnabled(): boolean {
  return process.env.OFFLINERADAR_EVENTS_CANONICAL_FEED === "1";
}

/**
 * Product listing gate (Route A / Route B).
 * Shared by canonical public feed and internal real-events preview.
 * PAYMENT / singlesFriendly never enter this function.
 */
export function isRouteABListable(event: Event): boolean {
  if (event.listingPath === "meet_activation") {
    return isActiveMeetActivation(event.meetActivation);
  }
  return event.singlesOriented === true;
}

/**
 * Legacy mock-feed gate (social suitability). Kept for rollback when the
 * canonical flag is off. Canonical mode uses isRouteABListable instead.
 */
export function isEventListable(event: Event): boolean {
  if (event.listingPath === "meet_activation") {
    return isActiveMeetActivation(event.meetActivation);
  }
  return (
    event.socialSuitability === "high" || event.socialSuitability === "medium"
  );
}

async function loadMockEvents(): Promise<Event[]> {
  return buildMockEvents(new Date()).filter(isEventListable);
}

async function loadCanonicalEvents(): Promise<Event[]> {
  const bundles = await listPublishedEditionBundles(100);
  if (bundles == null) {
    throw new EventsCatalogUnavailableError(
      "Canonical eventdatabase niet bereikbaar.",
    );
  }
  return bundles
    .filter((b) => b.edition.publicationStatus === "published")
    .map(mapEditionToConsumerEvent)
    .filter(isRouteABListable);
}

/**
 * Public listing. Canonical mode never falls back to mock on DB failure.
 */
export async function listEvents(): Promise<Event[]> {
  if (isCanonicalEventsFeedEnabled()) {
    return loadCanonicalEvents();
  }
  return loadMockEvents();
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  if (isCanonicalEventsFeedEnabled()) {
    const bundle = await getPublishedEditionBySlug(slug);
    if (!bundle) {
      // Distinguish missing vs DB down: try listing path only when SQL works.
      const sqlProbe = await listPublishedEditionBundles(1);
      if (sqlProbe == null) {
        throw new EventsCatalogUnavailableError(
          "Canonical eventdatabase niet bereikbaar.",
        );
      }
      return null;
    }
    const event = mapEditionToConsumerEvent(bundle);
    return isRouteABListable(event) ? event : null;
  }
  const events = await loadMockEvents();
  return events.find((event) => event.slug === slug) ?? null;
}
