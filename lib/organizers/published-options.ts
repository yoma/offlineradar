/**
 * Published organizers for homepage combobox (canonical names only).
 */
import { getEventsSql } from "@/lib/events/db";
import type { ActivityId, EventCategory } from "@/types/event";

export type PublishedOrganizerOption = {
  id: string;
  slug: string;
  name: string;
  /** Short derived blurb from dominant published activity/category; null if unclear. */
  blurb: string | null;
  eventCount: number;
};

function blurbFromSignals(input: {
  categories: EventCategory[];
  activities: ActivityId[];
}): string | null {
  const activityCounts = new Map<string, number>();
  for (const id of input.activities) {
    activityCounts.set(id, (activityCounts.get(id) ?? 0) + 1);
  }
  const categoryCounts = new Map<string, number>();
  for (const id of input.categories) {
    categoryCounts.set(id, (categoryCounts.get(id) ?? 0) + 1);
  }

  const topActivity = [...activityCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topCategory = [...categoryCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (topActivity) {
    const [id] = topActivity;
    if (id === "speeddate") return "speeddates";
    if (id === "reizen" || id === "weekend") return "singles reizen";
    if (id === "eten") return "diners & food";
    if (id === "drinken") return "drinks & apero";
    if (id === "party" || id === "dans") return "parties";
    if (id === "workshop") return "workshops";
    if (
      id === "sport" ||
      id === "outdoor" ||
      id === "wandelen" ||
      id === "lopen" ||
      id === "padel"
    ) {
      return "sport & actief";
    }
  }

  if (topCategory) {
    const [id] = topCategory;
    if (id === "dating") return "dating events";
    if (id === "meet_new_people") return "nieuwe mensen ontmoeten";
    if (id === "social") return "sociale activiteiten";
  }

  return null;
}

function parseJsonArray<T extends string>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => typeof item === "string");
}

/** Batch: organizers with ≥1 published edition + derived blurb. */
export async function listPublishedOrganizerOptions(): Promise<
  PublishedOrganizerOption[]
> {
  const sql = getEventsSql();
  if (!sql) return [];

  const rows = (await sql`
    SELECT
      o.id,
      o.slug,
      o.name,
      count(e.id)::int AS event_count,
      jsonb_agg(e.category) AS categories,
      jsonb_agg(e.activities) AS activities_nested
    FROM organizers o
    JOIN event_editions e
      ON e.organizer_id = o.id
     AND e.publication_status = 'published'
    GROUP BY o.id, o.slug, o.name
    ORDER BY o.name ASC
  `) as {
    id: string;
    slug: string;
    name: string;
    event_count: number;
    categories: unknown;
    activities_nested: unknown;
  }[];

  return rows.map((row) => {
    const categories = parseJsonArray<EventCategory>(row.categories);
    const nested = Array.isArray(row.activities_nested)
      ? row.activities_nested
      : [];
    const activities: ActivityId[] = [];
    for (const item of nested) {
      if (Array.isArray(item)) {
        for (const activity of item) {
          if (typeof activity === "string") {
            activities.push(activity as ActivityId);
          }
        }
      }
    }
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      eventCount: Number(row.event_count) || 0,
      blurb: blurbFromSignals({ categories, activities }),
    };
  });
}
