import type { ActivityId, EventCategory } from "@/types/event";
import {
  resolvePublicEventImage,
  type EventImageContext,
} from "@/lib/image-compatibility";

const HERO =
  "https://images.unsplash.com/photo-1621112904887-419379ce6824?auto=format&fit=crop&w=2400&q=80";

export function heroImageUrl(): string {
  return HERO;
}

/**
 * Resolve a public event image that is semantically compatible with the event.
 * Never returns a wrong-activity mood (e.g. bowling for a hike).
 */
export function eventImageUrl(input: {
  imageUrl?: string | null;
  category: EventCategory;
  activities: ActivityId[];
  tags?: string[];
  title?: string | null;
  subCategory?: string | null;
  imageIsAtmosphere?: boolean;
  minAge?: number | null;
  maxAge?: number | null;
}): string {
  const ctx: EventImageContext = {
    category: input.category,
    activities: input.activities,
    tags: input.tags,
    title: input.title,
    subCategory: input.subCategory,
    minAge: input.minAge,
    maxAge: input.maxAge,
  };
  return resolvePublicEventImage(
    ctx,
    input.imageUrl,
    input.imageIsAtmosphere === true,
  ).url;
}

export {
  isImageCompatibleWithEvent,
  inferRequiredImageCategory,
  inferImageCategoryFromUrl,
  inferImageAgeBand,
  parseAgeHintsFromTitle,
  resolvePublicEventImage,
  rewriteDeadMoodUrl,
  NEUTRAL_FALLBACK_DATA_URI,
  CATEGORY_MOOD_URLS,
  CATEGORY_MOOD_POOLS,
  pickCategoryMoodUrl,
  eventImageDiversityKey,
  publicImageKindLabel,
  profileForEvent,
  getMoodAssetMeta,
} from "@/lib/image-compatibility";

export {
  buildVisualProfile,
  buildVisualGenerationPrompt,
} from "@/lib/event-visual-profile";
