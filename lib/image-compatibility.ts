/**
 * Deterministic image ↔ event semantic compatibility.
 * Prefer no/neutral image over a wrong activity photo.
 */
import type { ActivityId, EventCategory } from "@/types/event";

export const IMAGE_CATEGORIES = [
  "outdoor",
  "bowling",
  "sport",
  "padel",
  "dating_social",
  "drinks",
  "food",
  "party",
  "workshop",
  "travel",
  "generic_social",
  "neutral",
] as const;

export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export type EventImageContext = {
  category: EventCategory;
  activities: ActivityId[];
  tags?: string[];
  title?: string | null;
  subCategory?: string | null;
};

/** Licensed Unsplash / local mood pools — deterministic variant pick per event. */
export const CATEGORY_MOOD_POOLS: Record<
  Exclude<ImageCategory, "neutral">,
  readonly string[]
> = {
  outdoor: [
    "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1200&q=80",
  ],
  bowling: [
    "/preview-mood/mood-singles-bowling.png",
    "https://images.unsplash.com/photo-1546443046-ed1ce6ffd1ab?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1569523463827-c8dbd4c346b5?auto=format&fit=crop&w=1200&q=80",
  ],
  sport: [
    "https://images.unsplash.com/photo-1517649763962-0c623066027c?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1461896836934-ffe607ba6851?auto=format&fit=crop&w=1200&q=80",
  ],
  padel: [
    "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80",
  ],
  dating_social: [
    "/preview-mood/mood-speeddate-25-35.png",
    "/preview-mood/mood-speeddate-53-65.png",
    "/preview-mood/mood-singles-night-out.png",
    "/preview-mood/mood-love-rooftop.png",
  ],
  drinks: [
    "/preview-mood/mood-apero-solo.png",
    "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=80",
  ],
  food: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
  ],
  party: [
    "/preview-mood/mood-mingle-night.png",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
  ],
  workshop: [
    "/preview-mood/mood-embodied-dating.png",
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
  ],
  travel: [
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80",
  ],
  generic_social: [
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
  ],
};

/** First pool image — backward-compatible single-url map. */
export const CATEGORY_MOOD_URLS: Record<Exclude<ImageCategory, "neutral">, string> =
  Object.fromEntries(
    Object.entries(CATEGORY_MOOD_POOLS).map(([key, urls]) => [key, urls[0]!]),
  ) as Record<Exclude<ImageCategory, "neutral">, string>;

/** Stable non-crypto hash for deterministic mood variant selection. */
export function hashDiversityKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick a category mood variant. Same key → same image; different keys spread.
 * Without a key, returns pool[0] (legacy / tests).
 */
export function pickCategoryMoodUrl(
  category: Exclude<ImageCategory, "neutral">,
  diversityKey?: string | null,
): string {
  const pool = CATEGORY_MOOD_POOLS[category];
  if (!pool.length) return CATEGORY_MOOD_URLS.generic_social;
  if (!diversityKey || pool.length === 1) return pool[0]!;
  return pool[hashDiversityKey(diversityKey) % pool.length]!;
}

/**
 * Diversity key: prefer organizer (series consistency), else event id.
 */
export function eventImageDiversityKey(input: {
  organizerId?: string | null;
  eventId?: string | null;
}): string | null {
  const organizer = input.organizerId?.trim();
  if (organizer) return `org:${organizer}`;
  const eventId = input.eventId?.trim();
  if (eventId) return `event:${eventId}`;
  return null;
}

/** SVG data-URI: calm branded surface, no false activity. */
export const NEUTRAL_FALLBACK_DATA_URI =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2937"/>
          <stop offset="100%" stop-color="#374151"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <circle cx="920" cy="180" r="120" fill="#e61e4d" fill-opacity="0.35"/>
      <text x="72" y="780" fill="#f8fafc" font-family="system-ui,sans-serif" font-size="42" font-weight="600">OfflineRadar</text>
      <text x="72" y="830" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="28">Sfeerbeeld volgt beschikbaar</text>
    </svg>`,
  );

const MOOD_FILE_CATEGORY: Record<string, ImageCategory> = {
  "mood-singles-bowling.png": "bowling",
  "mood-speeddate-25-35.png": "dating_social",
  "mood-speeddate-53-65.png": "dating_social",
  "mood-apero-solo.png": "drinks",
  "mood-mingle-night.png": "party",
  "mood-singles-night-out.png": "dating_social",
  "mood-love-rooftop.png": "dating_social",
  "mood-embodied-dating.png": "workshop",
};

const ACTIVITY_TO_IMAGE: Partial<Record<ActivityId, ImageCategory>> = {
  speeddate: "dating_social",
  wandelen: "outdoor",
  outdoor: "outdoor",
  lopen: "outdoor",
  sport: "sport",
  padel: "padel",
  eten: "food",
  drinken: "drinks",
  party: "party",
  dans: "party",
  workshop: "workshop",
  reizen: "travel",
  weekend: "travel",
};

function haystack(ctx: EventImageContext): string {
  return [
    ctx.title ?? "",
    ctx.subCategory ?? "",
    ...(ctx.tags ?? []),
    ...ctx.activities,
    ctx.category,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Most specific image need for an event. Specificity wins over generic_social.
 */
export function inferRequiredImageCategory(
  ctx: EventImageContext,
): ImageCategory {
  const text = haystack(ctx);

  if (/\bbowling\b/.test(text)) return "bowling";
  if (/\bpadel\b/.test(text)) return "padel";
  // Multi-day travel/weekend (avoid bare "voyage" — false-positives party names).
  if (/\b(weekend|reizen|reis|ardenne|manoir|villa)\b/.test(text)) {
    return "travel";
  }
  // Named drinks/social formats before outdoor so "Apero + wandeling" keeps drinks mood.
  if (/\b(apero|apéros|borrel|cocktail|praatcafé|praatcafe)\b/.test(text)) {
    return "drinks";
  }
  if (
    /\b(wandeling|wandelen|hike|hiking|outdoor|natuur|bos|park|stadswandeling|city walk)\b/.test(
      text,
    )
  ) {
    return "outdoor";
  }
  if (/\b(party|feest|soirée|soiree|dans|nightlife|mingle|halloween)\b/.test(text)) {
    return "party";
  }
  if (/\b(workshop|embodied)\b/.test(text)) return "workshop";
  if (/\b(dinner|diner|eten|restaurant|food)\b/.test(text)) return "food";
  if (/\b(drinken|café|cafe)\b/.test(text)) {
    return "drinks";
  }
  if (
    /\b(speeddate|speed.?dat|dating)\b/.test(text) ||
    ctx.category === "dating"
  ) {
    return "dating_social";
  }

  for (const activity of ctx.activities) {
    const mapped = ACTIVITY_TO_IMAGE[activity];
    if (mapped) return mapped;
  }

  if (ctx.category === "social") return "generic_social";
  if (ctx.category === "meet_new_people") return "generic_social";
  return "dating_social";
}

export function inferImageCategoryFromUrl(
  url: string | null | undefined,
): ImageCategory | "unknown" {
  if (!url) return "unknown";
  const lower = url.toLowerCase();

  for (const [file, category] of Object.entries(MOOD_FILE_CATEGORY)) {
    if (lower.includes(file)) return category;
  }

  // Unsplash / path heuristics for known fallbacks
  if (
    lower.includes("1551632811-561732d1e306") ||
    lower.includes("1441974231531-c6227db76b6e") ||
    lower.includes("1476480862126-209bfaa8edc8") ||
    lower.includes("1501555088652-021faa106b9b")
  ) {
    return "outdoor";
  }
  if (
    lower.includes("1414235077428-338989a2e8c0") ||
    lower.includes("1555939594-58d7cb561ad1") ||
    lower.includes("1504674900247-0877df9cc836")
  ) {
    return "food";
  }
  if (
    lower.includes("1510812431401-41d2bd2722f3") ||
    lower.includes("1470337458703-46ad1756a187")
  ) {
    return "drinks";
  }
  if (
    lower.includes("1492684223066-81342ee5ff30") ||
    lower.includes("1508700115892") ||
    lower.includes("1514525253161-7a46d19cd819")
  ) {
    return "party";
  }
  if (
    lower.includes("1556910103-1c02745aae4d") ||
    lower.includes("1522202176988-66273c2fd55f")
  ) {
    return "workshop";
  }
  if (
    lower.includes("1488646953014-85cb44e25828") ||
    lower.includes("1501785888041-af3ef285b470") ||
    lower.includes("1469854523086-cc02fe5d8800")
  ) {
    return "travel";
  }
  if (lower.includes("1554068865-24cecd4e34b8")) return "padel";
  if (
    lower.includes("1517649763962-0c623066027c") ||
    lower.includes("1571019613454-1cb2f99b2d8b") ||
    lower.includes("1461896836934-ffe607ba6851")
  ) {
    return "sport";
  }
  if (
    lower.includes("1546443046-ed1ce6ffd1ab") ||
    lower.includes("1569523463827-c8dbd4c346b5") ||
    lower.includes("mood-singles-bowling")
  ) {
    return "bowling";
  }
  if (
    lower.includes("1517248135467-4c7edcad34c4") ||
    lower.includes("1529156069898-49953e39b3ac") ||
    lower.includes("1543269865-cbf427effbad")
  ) {
    return "generic_social";
  }
  if (lower.startsWith("data:image/svg")) return "neutral";

  return "unknown";
}

/** Which stored image categories may render for a required event need. */
const COMPATIBLE: Record<ImageCategory, readonly ImageCategory[]> = {
  outdoor: ["outdoor"],
  bowling: ["bowling", "sport"],
  sport: ["sport", "padel", "outdoor"],
  padel: ["padel", "sport"],
  dating_social: ["dating_social", "drinks", "generic_social"],
  drinks: ["drinks", "dating_social", "generic_social", "food"],
  food: ["food", "drinks", "generic_social"],
  party: ["party", "dating_social"],
  workshop: ["workshop", "dating_social", "generic_social"],
  travel: ["travel", "outdoor"],
  generic_social: ["generic_social", "dating_social", "drinks"],
  neutral: ["neutral"],
};

export function isImageCompatibleWithEvent(
  event: EventImageContext,
  imageUrl: string | null | undefined,
): boolean {
  if (!imageUrl) return false;
  const required = inferRequiredImageCategory(event);
  const imageCat = inferImageCategoryFromUrl(imageUrl);
  if (imageCat === "unknown") return false;
  if (imageCat === "neutral") return true;
  return COMPATIBLE[required].includes(imageCat);
}

export type ResolvedEventImage = {
  url: string;
  imageCategory: ImageCategory;
  usedFallback: boolean;
  keptAtmosphere: boolean;
};

/**
 * Public render selection:
 * 1) compatible provided image
 * 2) category-specific mood (deterministic variant via diversityKey)
 * 3) neutral (never wrong activity)
 */
export function resolvePublicEventImage(
  event: EventImageContext,
  imageUrl?: string | null,
  imageIsAtmosphere = false,
  diversityKey?: string | null,
): ResolvedEventImage {
  const required = inferRequiredImageCategory(event);

  if (imageUrl && isImageCompatibleWithEvent(event, imageUrl)) {
    return {
      url: imageUrl,
      imageCategory: inferImageCategoryFromUrl(imageUrl) as ImageCategory,
      usedFallback: false,
      keptAtmosphere: imageIsAtmosphere,
    };
  }

  if (required !== "neutral") {
    const mood = pickCategoryMoodUrl(required, diversityKey);
    if (mood) {
      return {
        url: mood,
        imageCategory: required,
        usedFallback: true,
        keptAtmosphere: true,
      };
    }
  }

  return {
    url: NEUTRAL_FALLBACK_DATA_URI,
    imageCategory: "neutral",
    usedFallback: true,
    keptAtmosphere: true,
  };
}
