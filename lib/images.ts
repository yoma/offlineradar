import type { ActivityId, Event, EventCategory } from "@/types/event";
import {
  eventImageDiversityKey,
  inferRequiredImageCategory,
  resolvePublicEventImage,
  type EventImageContext,
  type ResolvedEventImage,
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

/**
 * Exact same resolution path as the public EventVisual card.
 * Instagram and website must share this so visible photos stay in sync.
 */
export function resolveWebsiteVisibleEventImage(
  event: Pick<
    Event,
    | "id"
    | "category"
    | "activities"
    | "tags"
    | "title"
    | "subCategory"
    | "imageUrl"
    | "imageIsAtmosphere"
    | "organizerId"
    | "organizerSlug"
    | "eligibilityAgeMin"
    | "eligibilityAgeMax"
    | "description"
    | "shortDescription"
    | "organizerName"
  >,
): ResolvedEventImage {
  const ctx: EventImageContext = {
    category: event.category,
    activities: event.activities,
    tags: event.tags,
    title: event.title,
    subCategory: event.subCategory,
    description: event.description,
    shortDescription: event.shortDescription,
    organizerName: event.organizerName,
    minAge: event.eligibilityAgeMin,
    maxAge: event.eligibilityAgeMax,
  };
  const required = inferRequiredImageCategory(ctx);
  const diversityKey = eventImageDiversityKey({
    organizerId: event.organizerId ?? event.organizerSlug ?? null,
    eventId: event.id,
    imageCategory: required,
  });
  return resolvePublicEventImage(
    ctx,
    event.imageUrl,
    event.imageIsAtmosphere === true,
    diversityKey,
  );
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
