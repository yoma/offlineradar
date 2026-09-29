/**
 * Deterministic image ↔ event semantic compatibility.
 * Prefer no/neutral image over a wrong activity photo.
 *
 * Diversity (Fase 26.7):
 * - Official / licensed images win when compatible.
 * - Legacy mood / atmosphere assets do NOT lock; they re-enter the mood pool
 *   so events spread across variants.
 * - Diversity key is event-specific (stable per edition) with category entropy.
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
  /** Event eligibility / advertised age band (for people mood selection). */
  minAge?: number | null;
  maxAge?: number | null;
};

/**
 * Demographic band for people-centric mood photos.
 * mature = roughly 45+/50+ (no young-adult stock).
 */
export type ImageAgeBand = "young" | "mid" | "mature" | "any";

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
    "https://images.unsplash.com/photo-1452421822248-d4c2b47f0c81?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80",
  ],
  bowling: [
    "/preview-mood/mood-singles-bowling.png",
    "https://images.unsplash.com/photo-1546443046-ed1ce6ffd1ab?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=1200&q=80",
  ],
  sport: [
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1576678927484-cc907957088c?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80",
  ],
  padel: [
    "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
  ],
  dating_social: [
    // young (~20–35)
    "/preview-mood/mood-speeddate-25-35.png",
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1200&q=80",
    // mid (~30–50)
    "/preview-mood/mood-singles-night-out.png",
    "/preview-mood/mood-love-rooftop.png",
    "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80",
    // mature (~45+/50+) — people or ambience without young-adult faces
    "/preview-mood/mood-speeddate-53-65.png",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80",
  ],
  drinks: [
    "/preview-mood/mood-apero-solo.png",
    "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1200&q=80",
  ],
  food: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
  ],
  party: [
    "/preview-mood/mood-mingle-night.png",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80",
  ],
  workshop: [
    "/preview-mood/mood-embodied-dating.png",
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80",
  ],
  travel: [
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=1200&q=80",
  ],
  generic_social: [
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80",
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

/** Parse "35–45", "50+", "45 plus" style hints from titles. */
export function parseAgeHintsFromTitle(
  title: string | null | undefined,
): { min: number | null; max: number | null } {
  if (!title) return { min: null, max: null };
  const range = title.match(/(\d{2})\s*[–\-]\s*(\d{2})/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const plus = title.match(/\b(\d{2})\s*(?:\+|plus\b|plussers?\b)/i);
  if (plus) {
    return { min: Number(plus[1]), max: null };
  }
  return { min: null, max: null };
}

/**
 * Which people-mood demographic fits this event.
 * Prefer structured min/max; fall back to title hints.
 */
export function inferImageAgeBand(ctx: {
  minAge?: number | null;
  maxAge?: number | null;
  title?: string | null;
}): ImageAgeBand {
  const fromTitle = parseAgeHintsFromTitle(ctx.title);
  const min = ctx.minAge ?? fromTitle.min;
  const max = ctx.maxAge ?? fromTitle.max;

  if (min != null && min >= 50) return "mature";
  if (min != null && min >= 45 && (max == null || max >= 50)) return "mature";
  if (max != null && max <= 35) return "young";
  if (max != null && max <= 40 && (min == null || min <= 30)) return "young";
  if (min != null && min >= 35) return "mid";
  if (min != null && min >= 30 && max != null && max <= 50) return "mid";
  if (fromTitle.min != null && fromTitle.min >= 45) return "mature";
  return "any";
}

/**
 * Age tags for dating_social mood URLs.
 * Young-adult stock must never be used for mature (45+/50+) events.
 */
function datingMoodAgeBands(url: string): ImageAgeBand[] {
  const lower = url.toLowerCase();
  if (lower.includes("mood-speeddate-25-35")) return ["young"];
  if (lower.includes("mood-speeddate-53-65")) return ["mature"];
  if (lower.includes("mood-singles-night-out")) return ["young", "mid"];
  if (lower.includes("mood-love-rooftop")) return ["mid"];
  const photoId = unsplashPhotoId(url);
  if (
    photoId === "1529156069898-49953e39b3ac" ||
    photoId === "1543269865-cbf427effbad"
  ) {
    return ["young"];
  }
  if (photoId === "1511632765486-a01980e381a6") {
    return ["young", "mid"];
  }
  if (photoId === "1529333166437-7750a6dd5a70") {
    return ["young", "mid"];
  }
  if (
    photoId === "1517248135467-4c7edcad34c4" ||
    photoId === "1414235077428-338989a2e8c0"
  ) {
    return ["mid", "mature"];
  }
  if (photoId === "1528605248644-14dd04022da1") {
    return ["mid"];
  }
  return ["any"];
}

function moodPoolForAge(
  category: Exclude<ImageCategory, "neutral">,
  ageBand: ImageAgeBand,
): readonly string[] {
  const pool = CATEGORY_MOOD_POOLS[category];
  if (category !== "dating_social" || ageBand === "any") return pool;

  const filtered = pool.filter((url) => {
    const bands = datingMoodAgeBands(url);
    return bands.includes(ageBand) || bands.includes("any");
  });
  if (filtered.length > 0) return filtered;

  // Hard fallback: never show young stock on mature events.
  if (ageBand === "mature") {
    return pool.filter((url) => datingMoodAgeBands(url).includes("mature"));
  }
  return pool;
}

/**
 * Pick a category mood variant. Same key → same image; different keys spread.
 * Without a key, returns pool[0] (legacy / tests).
 * For dating_social, ageBand filters out wrong-demographic people photos.
 */
export function pickCategoryMoodUrl(
  category: Exclude<ImageCategory, "neutral">,
  diversityKey?: string | null,
  ageBand: ImageAgeBand = "any",
): string {
  const pool = moodPoolForAge(category, ageBand);
  if (!pool.length) return CATEGORY_MOOD_URLS.generic_social;
  if (!diversityKey || pool.length === 1) return pool[0]!;
  // Prefer event-id entropy so nearby UUIDs / shared org suffixes do not collide.
  const eventId = diversityKey.match(/event:([^|]+)/)?.[1];
  const mix = eventId
    ? `${category}|${ageBand}|${eventId}`
    : `${category}|${ageBand}|${diversityKey}`;
  return pool[hashDiversityKey(mix) % pool.length]!;
}

/**
 * Diversity key for stable-but-spread mood selection.
 * Event id dominates so editions of the same organizer can differ;
 * category keeps bowling vs walk from converging when ids collide oddly.
 */
export function eventImageDiversityKey(input: {
  organizerId?: string | null;
  eventId?: string | null;
  imageCategory?: string | null;
}): string | null {
  const eventId = input.eventId?.trim();
  const organizer = input.organizerId?.trim();
  const cat = input.imageCategory?.trim() || "x";
  if (eventId) {
    return `event:${eventId}|cat:${cat}|org:${organizer || "x"}`;
  }
  if (organizer) return `org:${organizer}|cat:${cat}`;
  return null;
}

function unsplashPhotoId(url: string): string | null {
  const match = url.match(/photo-([0-9a-z-]+)/i);
  return match?.[1] ?? null;
}

/** True when URL is a known mood/local atmosphere asset (not a real official photo). */
export function isKnownMoodAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes("/preview-mood/")) return true;
  if (lower.startsWith("data:image/svg")) return true;
  const photoId = unsplashPhotoId(url);
  for (const pool of Object.values(CATEGORY_MOOD_POOLS)) {
    for (const candidate of pool) {
      if (url === candidate) return true;
      if (photoId && unsplashPhotoId(candidate) === photoId) return true;
    }
  }
  return false;
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
      <text x="72" y="830" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="28">Sfeerbeeld niet beschikbaar</text>
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

  // Match any known pool URL / Unsplash photo id to its category.
  for (const [category, pool] of Object.entries(CATEGORY_MOOD_POOLS) as [
    Exclude<ImageCategory, "neutral">,
    readonly string[],
  ][]) {
    for (const candidate of pool) {
      if (url === candidate) return category;
      const a = unsplashPhotoId(url);
      const b = unsplashPhotoId(candidate);
      if (a && b && a === b) return category;
    }
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
 * 1) compatible official image (not atmosphere / not known mood asset)
 * 2) category-specific mood (deterministic variant via diversityKey)
 * 3) neutral (never wrong activity)
 *
 * Legacy mood rows stay in DB but no longer freeze all cards on pool[0].
 */
export function resolvePublicEventImage(
  event: EventImageContext,
  imageUrl?: string | null,
  imageIsAtmosphere = false,
  diversityKey?: string | null,
): ResolvedEventImage {
  const required = inferRequiredImageCategory(event);
  const ageBand = inferImageAgeBand(event);
  const key = diversityKey ?? null;

  const treatAsLegacyMood =
    imageIsAtmosphere || isKnownMoodAssetUrl(imageUrl ?? null);

  // Stored young dating mood on a 45+/50+ event must never lock.
  const storedDatingAgeMismatch =
    required === "dating_social" &&
    ageBand === "mature" &&
    !!imageUrl &&
    datingMoodAgeBands(imageUrl).includes("young") &&
    !datingMoodAgeBands(imageUrl).includes("mature");

  if (
    imageUrl &&
    !treatAsLegacyMood &&
    !storedDatingAgeMismatch &&
    isImageCompatibleWithEvent(event, imageUrl)
  ) {
    return {
      url: imageUrl,
      imageCategory: inferImageCategoryFromUrl(imageUrl) as ImageCategory,
      usedFallback: false,
      keptAtmosphere: false,
    };
  }

  if (required !== "neutral") {
    const mood = pickCategoryMoodUrl(required, key, ageBand);
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
