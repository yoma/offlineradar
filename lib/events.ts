import { buildMockEvents } from "@/data/events";
import type { Event } from "@/types/event";

/**
 * Event data access.
 * This prototype reads local mock data. Replace `loadSourceEvents`
 * later with a database or API call. UI code should import from here.
 */
async function loadSourceEvents(): Promise<Event[]> {
  return buildMockEvents(new Date());
}

function isListed(event: Event): boolean {
  return event.socialSuitability === "high" || event.socialSuitability === "medium";
}

export async function listEvents(): Promise<Event[]> {
  const events = await loadSourceEvents();
  return events.filter(isListed);
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const events = await listEvents();
  return events.find((event) => event.slug === slug) ?? null;
}
