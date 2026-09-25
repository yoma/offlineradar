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
 * Catalog listing gate (MVP consumer helper).
 *
 * CONFLICT (documented 2026-09-25): this helper still admits organic events
 * with socialSuitability medium/high, which is broader than the restored
 * product rule (Route A singles-oriented OR Route B confirmed Meet).
 * The public mock feed still uses this helper so existing mock data keeps
 * working. The internal real-events preview uses
 * `isInternalPreviewListable` in `lib/events-preview.ts` instead and must
 * NOT fall back to “generally social is enough”.
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
