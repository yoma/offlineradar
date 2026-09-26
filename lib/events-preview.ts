import { buildRealPreviewEvents } from "@/data/pilot/real-preview-events";
import { isRouteABListable } from "@/lib/events";
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
 * Shares Route A/B helper with the canonical public feed.
 */
export function isInternalPreviewListable(event: Event): boolean {
  return isRouteABListable(event);
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
