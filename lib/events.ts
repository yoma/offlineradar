import { revalidateTag, unstable_cache } from "next/cache";
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
 * Run a catalog read; `{ ok: false }` when the canonical DB is down, so pages
 * can render their "tijdelijk niet beschikbaar" state outside a try/catch.
 * Any other error is rethrown.
 */
export async function readCatalog<T>(
  load: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    if (
      isCanonicalEventsFeedEnabled() &&
      error instanceof EventsCatalogUnavailableError
    ) {
      return { ok: false };
    }
    throw error;
  }
}

/**
 * Product listing gate (Route A / Route B).
 * Shared by canonical public feed and internal real-events preview.
 * PAYMENT / singlesFriendly never enter this function.
 */
export function isRouteABListable(event: Event): boolean {
  if (event.listingPath === "meet_activation") {
    // Phase 1 schema does not store Meet activations yet (always null).
    // Until then, Route B published editions list via the Route A singles gate.
    if (event.meetActivation == null) {
      return event.singlesOriented === true;
    }
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

/**
 * Public catalog cache. Pages stay dynamic (per-visitor search state), but the
 * published catalog is read from Neon at most once per window per region.
 * Admin actions that change it call revalidateCatalog() for an instant refresh.
 */
export const CATALOG_CACHE_TAG = "public-catalog";
const CATALOG_CACHE_SECONDS = 60;

/** Cached values go through JSON: Infinity (unknown coords) comes back null. */
function restoreDistance(event: Event): Event {
  return typeof event.distanceKm === "number"
    ? event
    : { ...event, distanceKm: Number.POSITIVE_INFINITY };
}

/** Mark the public catalog stale (call after publishing or editing events). */
export function revalidateCatalog(): void {
  try {
    revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  } catch {
    // Outside a request (CLI scripts): the short cache window covers it.
  }
}

const cachedCanonicalEvents = unstable_cache(
  () => loadCanonicalEventsUncached(),
  ["public-catalog-list"],
  { revalidate: CATALOG_CACHE_SECONDS, tags: [CATALOG_CACHE_TAG] },
);

/** Next sets NEXT_RUNTIME in the server; CLI scripts have no request cache. */
function inNextServer(): boolean {
  return Boolean(process.env.NEXT_RUNTIME);
}

async function loadCanonicalEvents(): Promise<Event[]> {
  if (!inNextServer()) return loadCanonicalEventsUncached();
  return (await cachedCanonicalEvents()).map(restoreDistance);
}

async function loadCanonicalEventsUncached(): Promise<Event[]> {
  try {
    // Public catalog must include the full published set (was silently capped at 100).
    const bundles = await listPublishedEditionBundles(1000);
    if (bundles == null) {
      throw new EventsCatalogUnavailableError(
        "Canonical eventdatabase niet bereikbaar.",
      );
    }
    return bundles
      .filter((b) => b.edition.publicationStatus === "published")
      .map(mapEditionToConsumerEvent)
      .filter(isRouteABListable);
  } catch (error) {
    if (error instanceof EventsCatalogUnavailableError) throw error;
    throw new EventsCatalogUnavailableError(
      "Canonical eventdatabase niet bereikbaar.",
    );
  }
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

const cachedCanonicalEventBySlug = unstable_cache(
  (slug: string) => loadCanonicalEventBySlugUncached(slug),
  ["public-catalog-event"],
  { revalidate: CATALOG_CACHE_SECONDS, tags: [CATALOG_CACHE_TAG] },
);

export async function getEventBySlug(slug: string): Promise<Event | null> {
  if (isCanonicalEventsFeedEnabled()) {
    if (!inNextServer()) return loadCanonicalEventBySlugUncached(slug);
    const event = await cachedCanonicalEventBySlug(slug);
    return event ? restoreDistance(event) : null;
  }
  const events = await loadMockEvents();
  return events.find((event) => event.slug === slug) ?? null;
}

async function loadCanonicalEventBySlugUncached(
  slug: string,
): Promise<Event | null> {
  try {
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
  } catch (error) {
    if (error instanceof EventsCatalogUnavailableError) throw error;
    throw new EventsCatalogUnavailableError(
      "Canonical eventdatabase niet bereikbaar.",
    );
  }
}
