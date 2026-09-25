import { buildRealPreviewEvents } from "@/data/pilot/real-preview-events";
import { isActiveMeetActivation } from "@/types/domain";
import type { Event } from "@/types/event";

/**
 * Internal pilot preview data access (local only).
 *
 * Never used by the public consumer feed (`lib/events.ts`).
 * Listing requires restored product rule Route A or Route B.
 */

/** Server-only gate: must be set explicitly in the local shell. */
export function isInternalPreviewEnabled(): boolean {
  return process.env.OFFLINERADAR_INTERNAL_PREVIEW === "1";
}

/**
 * Product listing for the internal real-events preview.
 * - Route B: active Meet activation
 * - Route A: singlesOriented === true (never “generally social” alone)
 */
export function isInternalPreviewListable(event: Event): boolean {
  if (event.listingPath === "meet_activation") {
    return isActiveMeetActivation(event.meetActivation);
  }
  return event.singlesOriented === true;
}

export async function listPreviewEvents(): Promise<Event[]> {
  const events = buildRealPreviewEvents();
  return events.filter(isInternalPreviewListable);
}

export async function getPreviewEventBySlug(
  slug: string,
): Promise<Event | null> {
  const events = await listPreviewEvents();
  return events.find((event) => event.slug === slug) ?? null;
}
