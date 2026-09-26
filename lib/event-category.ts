/**
 * Normalize event format taxonomy for filters and image selection.
 * Classic timed rotation dating → speeddate. Other dating formats stay distinct.
 */
import type { ActivityId } from "@/types/event";

const SPEEDDATE_SUBCATEGORIES = new Set([
  "speeddate",
  "speeddating",
  "speed-dating",
  "speed_dating",
]);

/**
 * True when this is a classic speeddate / speed dating edition.
 * Does NOT treat dinner dating, workshops, apero, conscious dating as speeddate.
 */
export function isClassicSpeeddate(input: {
  subCategory?: string | null;
  title?: string | null;
  tags?: string[] | null;
  activities?: ActivityId[] | null;
}): boolean {
  const sub = (input.subCategory ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (SPEEDDATE_SUBCATEGORIES.has(sub)) return true;
  if (sub === "speed-dating" || sub.replace(/-/g, "") === "speeddating") {
    return true;
  }

  if (input.activities?.includes("speeddate")) return true;

  const title = (input.title ?? "").toLowerCase();
  // Explicit exclusions: dinner / workshop / party formats that may mention dating.
  if (
    /dinner|diner|brunch|workshop|conscious|embodied|ap[eé]ro|afterwork|wandel|hike|bowling|quiz|party|soir[eé]e|mingle|weekend|reis/.test(
      title,
    )
  ) {
    return false;
  }
  if (/speed\s*dat/.test(title) || /speeddaten/.test(title)) return true;

  const tags = (input.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => t === "speeddate" || t === "speeddating")) return true;

  return false;
}

/** Canonical subcategory for classic speeddates. */
export function normalizeSpeeddateSubCategory(
  subCategory: string | null | undefined,
  title?: string | null,
): string {
  if (isClassicSpeeddate({ subCategory, title })) return "speeddate";
  return (subCategory ?? "").trim() || "dating event";
}

/**
 * Ensure classic speeddates expose activity `speeddate` for filters.
 * Removes misleading sole `drinken` tag that made them appear under drinks.
 */
export function normalizeEventActivities(input: {
  activities: ActivityId[];
  subCategory?: string | null;
  title?: string | null;
  tags?: string[] | null;
}): ActivityId[] {
  const base = [...input.activities];
  if (!isClassicSpeeddate(input)) {
    return Array.from(new Set(base));
  }

  const withoutMisleadingDrinks = base.filter((a) => a !== "drinken");
  return Array.from(new Set<ActivityId>(["speeddate", ...withoutMisleadingDrinks]));
}

/** Legacy query aliases → canonical ActivityId. */
export function canonicalizeActivityId(raw: string): ActivityId | null {
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "");
  const map: Record<string, ActivityId> = {
    eten: "eten",
    drinken: "drinken",
    drinks: "drinken",
    wandelen: "wandelen",
    walk: "wandelen",
    lopen: "lopen",
    sport: "sport",
    padel: "padel",
    party: "party",
    uitgaan: "party",
    dans: "dans",
    workshop: "workshop",
    reizen: "reizen",
    weekend: "weekend",
    outdoor: "outdoor",
    buiten: "outdoor",
    speeddate: "speeddate",
    speeddating: "speeddate",
    speed: "speeddate",
  };
  return map[key] ?? null;
}
