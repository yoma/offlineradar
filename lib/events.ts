import { buildMockEvents } from "@/data/events";
import { isActiveMeetActivation } from "@/types/domain";
import type { Event } from "@/types/event";

/**
 * Event data access.
 * This prototype reads local mock data. Replace `loadSourceEvents`
 * later with a database or API call. UI code should import from here.
 */
async function loadSourceEvents(): Promise<Event[]> {
  return buildMockEvents(new Date());
}

/**
 * Catalog listing gate (content only).
 *
 * An event is listable when:
 * - it is organically socially suitable (high/medium), OR
 * - it has an active OfflineRadar Meet activation (meet_activation path)
 *
 * PAYMENT DOES NOT CREATE ELIGIBILITY.
 * Promotions / boosts and singlesFriendly never enter this function.
 */
export function isEventListable(event: Event): boolean {
  if (event.listingPath === "meet_activation") {
    return isActiveMeetActivation(event.meetActivation);
  }
  return (
    event.socialSuitability === "high" || event.socialSuitability === "medium"
  );
}

export async function listEvents(): Promise<Event[]> {
  const events = await loadSourceEvents();
  return events.filter(isEventListable);
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const events = await listEvents();
  return events.find((event) => event.slug === slug) ?? null;
}
