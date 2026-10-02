"use server";

import { matchingEvents } from "@/lib/filters";
import { listEvents } from "@/lib/events";
import type { SearchState } from "@/types/search";

/**
 * Live “Toon X activiteiten” count for homepage Meer-filters.
 * Keeps the full catalog off the homepage HTML/RSC payload.
 */
export async function countHomeFilterMatches(
  state: SearchState,
): Promise<number> {
  const events = await listEvents();
  return matchingEvents(events, state).visible.length;
}
