/**
 * Deterministic image ↔ event semantic compatibility.
 * Prefer no/neutral image over a wrong activity photo.
 *
 * FASE 26.19: activity-first visual profile; dating/social is context only.
 */
import type { ActivityId, EventCategory } from "@/types/event";
import {
  buildVisualProfile,
  TITLE_THEME_RULES,
  visualAgeToLegacyBand,
  type VisualProfile,
  type VisualProfileInput,
} from "@/lib/event-visual-profile";

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
  description?: string | null;
  shortDescription?: string | null;
  organizerName?: string | null;
  /** Event eligibility / advertised age band (for people mood selection). */
  minAge?: number | null;
  maxAge?: number | null;
};

/**
 * Demographic band for people-centric mood photos.
 * mature = roughly 45+/50+ (no young-adult stock).
 */
export type ImageAgeBand = "young" | "mid" | "mature" | "any";

/** Per-asset semantic tags for hard mismatch rejection. */
export type MoodAssetMeta = {
  subjects: string[];
  setting?: string[];
  moment?: string[];
  ageBands?: ImageAgeBand[];
};

function unsplashPhotoId(url: string): string | null {
  const match = url.match(/photo-([0-9a-z-]+)/i);
  return match?.[1] ?? null;
}

function assetKey(url: string): string {
  const lower = url.toLowerCase();
  const moodFile = lower.match(/mood-[a-z0-9-]+\.png/);
  if (moodFile) return moodFile[0];
  const id = unsplashPhotoId(url);
  if (id) return `photo-${id}`;
  return lower;
}

/**
 * Dead remote mood assets (Unsplash 404s). Rewrite so stored DB rows,
 * pools, and cached URLs still resolve to a live replacement.
 * Add new 404 photo ids here rather than leaving broken cards in production.
 *
 * Invariant (enforced in verify-semantic-event-images):
 * if the dead source carries an exclusive seasonal subject, the replacement
 * must carry the same theme subject. Never rewrite Halloween → brunch, etc.
 */
const DEAD_MOOD_URL_REWRITES: Record<string, string> = {
  "photo-1547592160-406d259ca962":
    "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
  // Seasonal theme stock that Unsplash removed → verified Halloween pumpkins
  "photo-1509557965043-4e929c0c1b9d":
    "https://images.unsplash.com/photo-1667852916327-c0444978d171?auto=format&fit=crop&w=1200&q=80",
  "photo-1605792657660-596af9009ce3":
    "https://images.unsplash.com/photo-1663568399694-fa3ee4fbb972?auto=format&fit=crop&w=1200&q=80",
};

/**
 * Photo ids that must NEVER carry exclusive seasonal subjects in meta.
 * Protects against the brunch-as-Halloween class of bugs.
 */
export const THEME_SUBJECT_DENYLIST: Record<string, string> = {
  "photo-1478144592103-25e218a04891":
    "Bright brunch/fruit flat-lay — not seasonal",
};

/**
 * Human-verified captions for exclusive theme stock.
 * Every URL in THEME_MOOD_POOLS must appear here with a matching theme.
 */
export const VERIFIED_THEME_ASSET_LABELS: Record<
  string,
  { theme: string; label: string }
> = {
  "photo-1667852916327-c0444978d171": {
    theme: "halloween",
    label: "Jack-o-lanterns on a bar counter",
  },
  "photo-1663568399694-fa3ee4fbb972": {
    theme: "halloween",
    label: "Smoky jack-o-lantern in autumn leaves",
  },
  "photo-1698961676332-7ff9b6c5ceed": {
    theme: "halloween",
    label: "Adult costume with glowing pumpkin",
  },
  "photo-1512389142860-9c449e58a543": {
    theme: "christmas",
    label: "Evergreen and berry winter flat-lay",
  },
  "photo-1513885535751-8b9238bd345a": {
    theme: "christmas",
    label: "Festive wrapped gifts with holly",
  },
  "photo-1467810563316-b5476525c0f9": {
    theme: "new_year",
    label: "Hands holding sparklers at dusk",
  },
  "photo-1518199266791-5375a83190b7": {
    theme: "valentine",
    label: "Heart-shaped bokeh lights",
  },
  "photo-1516589178581-6cd7833ae3b2": {
    theme: "valentine",
    label: "Hands forming a heart in golden light",
  },
};

/** Exported for verify scripts — dead rewrite map must stay theme-safe. */
export function listDeadMoodUrlRewrites(): Record<string, string> {
  return { ...DEAD_MOOD_URL_REWRITES };
}

export function rewriteDeadMoodUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const key = assetKey(url);
  return DEAD_MOOD_URL_REWRITES[key] ?? url;
}

/** Dedupe + rewrite pool URLs so resolve never picks a known-dead asset. */
export function liveMoodUrls(urls: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = rewriteDeadMoodUrl(raw);
    if (!url || url.startsWith("data:")) continue;
    const key = assetKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

/**
 * Rotate only within the top subject-fit tier so diversity never demotes
 * a stronger match (e.g. soup stock must stay ahead of generic pasta).
 */
function orderPoolByDiversity(
  pool: readonly string[],
  mix: string | null,
  profile?: VisualProfile,
): string[] {
  const live = liveMoodUrls(pool);
  if (live.length === 0) return [];
  if (!mix) return live;
  if (!profile) {
    const start = hashDiversityKey(mix) % live.length;
    return [...live.slice(start), ...live.slice(0, start)];
  }
  const top = subjectFitScore(profile, live[0]!);
  const best = live.filter((url) => subjectFitScore(profile, url) === top);
  const rest = live.filter((url) => subjectFitScore(profile, url) !== top);
  const start = hashDiversityKey(mix) % best.length;
  return [...best.slice(start), ...best.slice(0, start), ...rest];
}

/** Subject tags for known mood / Unsplash assets. */
export const MOOD_ASSET_META: Record<string, MoodAssetMeta> = {
  // outdoor / walking
  "photo-1551632811-561732d1e306": {
    subjects: ["walking", "outdoors", "hiking", "nature_or_city", "group"],
    setting: ["outdoor", "nature"],
    ageBands: ["any"],
  },
  "photo-1441974231531-c6227db76b6e": {
    subjects: ["walking", "outdoors", "nature_or_city"],
    setting: ["outdoor", "nature"],
  },
  "photo-1476480862126-209bfaa8edc8": {
    subjects: ["walking", "outdoors", "running", "daytime"],
    setting: ["outdoor"],
  },
  "photo-1501555088652-021faa106b9b": {
    subjects: ["walking", "outdoors", "hiking"],
    setting: ["outdoor", "nature"],
  },
  "photo-1452421822248-d4c2b47f0c81": {
    subjects: ["walking", "outdoors", "group"],
    setting: ["outdoor"],
  },
  "photo-1464822759023-fed622ff2c3b": {
    subjects: ["outdoors", "nature_or_city", "travel"],
    setting: ["outdoor", "nature"],
  },
  "photo-1506905925346-21bda4d32df4": {
    subjects: ["outdoors", "nature_or_city", "travel"],
    setting: ["outdoor", "nature"],
  },
  // bowling
  "mood-singles-bowling.png": {
    subjects: ["bowling", "lanes", "indoor_sport"],
    setting: ["indoor", "sports_hall"],
  },
  "photo-1546443046-ed1ce6ffd1ab": {
    subjects: ["bowling", "lanes"],
    setting: ["indoor"],
  },
  "photo-1575361204480-aadea25e6e68": {
    subjects: ["bowling", "lanes"],
    setting: ["indoor"],
  },
  "photo-1578662996442-48f60103fc96": {
    subjects: ["bowling", "lanes"],
    setting: ["indoor"],
  },
  // sport / running
  "photo-1571019613454-1cb2f99b2d8b": {
    subjects: ["sport", "active", "running"],
    setting: ["sports_hall"],
  },
  "photo-1517836357463-d25dfeac3438": {
    subjects: ["sport", "active", "gym"],
    setting: ["sports_hall"],
  },
  "photo-1576678927484-cc907957088c": {
    subjects: ["sport", "active"],
    setting: ["sports_hall"],
  },
  "photo-1574629810360-7efbbe195018": {
    subjects: ["sport", "active", "outdoors"],
    setting: ["outdoor"],
  },
  "photo-1534438327276-14e5300c3a48": {
    subjects: ["sport", "active", "gym"],
    setting: ["sports_hall"],
  },
  // padel
  "photo-1554068865-24cecd4e34b8": {
    subjects: ["padel", "court", "racket", "sport"],
    setting: ["sports_hall"],
  },
  "photo-1626224583764-f87db24ac4ea": {
    subjects: ["padel", "court", "sport"],
    setting: ["sports_hall"],
  },
  "photo-1518611012118-696072aa579a": {
    subjects: ["sport", "active", "group"],
    setting: ["sports_hall"],
  },
  // dating / social — some are interior-only (cushions) → tagged for food reject
  "mood-speeddate-25-35.png": {
    subjects: ["conversation", "social", "seated", "group"],
    ageBands: ["young"],
  },
  "mood-speeddate-53-65.png": {
    subjects: ["conversation", "social", "seated", "group"],
    ageBands: ["mature"],
  },
  "mood-singles-night-out.png": {
    subjects: ["social", "nightlife", "group", "drinks"],
    ageBands: ["young", "mid"],
  },
  "mood-love-rooftop.png": {
    subjects: ["social", "group", "outdoors"],
    ageBands: ["mid"],
  },
  "photo-1529156069898-49953e39b3ac": {
    subjects: ["social", "group", "conversation"],
    ageBands: ["young"],
  },
  "photo-1543269865-cbf427effbad": {
    subjects: ["social", "group", "conversation"],
    ageBands: ["young"],
  },
  "photo-1529333166437-7750a6dd5a70": {
    subjects: ["social", "group", "conversation"],
    ageBands: ["young", "mid"],
  },
  // restaurant interior / lounge cushions — NOT food tasting
  "photo-1517248135467-4c7edcad34c4": {
    subjects: ["restaurant_interior", "interior_only", "cushions", "furniture_only"],
    setting: ["indoor", "restaurant"],
    ageBands: ["mid", "mature"],
  },
  "photo-1414235077428-338989a2e8c0": {
    subjects: ["food", "table", "dining", "restaurant", "bowls"],
    setting: ["indoor", "restaurant"],
    ageBands: ["mid", "mature"],
  },
  "photo-1528605248644-14dd04022da1": {
    subjects: ["social", "group", "conversation", "table"],
    ageBands: ["mid"],
  },
  // drinks
  "mood-apero-solo.png": {
    subjects: ["drinks", "bar", "social"],
    setting: ["indoor", "bar"],
  },
  "photo-1510812431401-41d2bd2722f3": {
    subjects: ["drinks", "wine", "tasting"],
    setting: ["indoor"],
  },
  "photo-1470337458703-46ad1756a187": {
    subjects: ["drinks", "bar", "social"],
    setting: ["indoor", "bar"],
  },
  "photo-1551024709-8f23befc6f87": {
    subjects: ["drinks", "cocktail", "bar"],
    setting: ["indoor", "bar"],
  },
  "photo-1572116469696-31de0f17cc34": {
    subjects: ["drinks", "bar", "social"],
    setting: ["indoor", "bar"],
  },
  // food — real food subjects
  "photo-1555939594-58d7cb561ad1": {
    subjects: ["food", "table", "dining", "shared_table"],
    setting: ["indoor", "restaurant"],
  },
  "photo-1504674900247-0877df9cc836": {
    subjects: ["food", "table", "bowls", "tasting", "brunch"],
    setting: ["indoor"],
  },
  "photo-1476224203421-9ac39bcb3327": {
    subjects: ["food", "table", "dining", "pasta"],
    setting: ["indoor", "restaurant"],
  },
  // Was wrongly tagged as Halloween; pixels are a brunch fruit flat-lay.
  "photo-1478144592103-25e218a04891": {
    subjects: ["food", "table", "brunch", "fruit", "daytime"],
    setting: ["indoor"],
    moment: ["daytime", "breakfast"],
  },
  "photo-1547592166-23ac45744acd": {
    subjects: ["soup", "food", "bowls", "table", "tasting"],
    setting: ["indoor", "restaurant"],
  },
  "photo-1476718406336-bb5a9690ee2a": {
    subjects: ["soup", "food", "bowls", "table"],
    setting: ["indoor"],
  },
  // party / karaoke-ish nightlife
  "mood-mingle-night.png": {
    subjects: ["nightlife", "party", "dancing", "social"],
    setting: ["indoor", "bar"],
    moment: ["evening", "nightlife"],
    ageBands: ["young", "mid"],
  },
  "photo-1492684223066-81342ee5ff30": {
    subjects: ["nightlife", "party", "stage"],
    setting: ["indoor"],
    moment: ["nightlife"],
    ageBands: ["young", "mid"],
  },
  "photo-1514525253161-7a46d19cd819": {
    subjects: ["nightlife", "party", "dancing", "microphone", "karaoke"],
    setting: ["indoor"],
    moment: ["nightlife"],
    ageBands: ["young", "mid"],
  },
  "photo-1516450360452-9312f5e86fc7": {
    subjects: ["nightlife", "party", "dancing"],
    setting: ["indoor"],
    ageBands: ["young", "mid"],
  },
  "photo-1470229722913-7c0e2dbbafd3": {
    subjects: ["nightlife", "party", "stage", "microphone"],
    setting: ["indoor"],
    ageBands: ["young", "mid"],
  },
  // Concert crowd — party only, NOT carnival (was mislabelled).
  "photo-1533174072545-7a4b6ad7a6c3": {
    subjects: ["nightlife", "party", "stage", "celebration"],
    setting: ["outdoor"],
    moment: ["evening", "nightlife"],
    ageBands: ["young", "mid"],
  },
  // Confetti on teal — generic celebration, not Christmas-exclusive.
  "photo-1513151233558-d860c5398176": {
    subjects: ["party", "celebration", "confetti"],
    setting: ["indoor"],
    moment: ["evening"],
  },
  // seasonal themes (human-verified pixels; see VERIFIED_THEME_ASSET_LABELS)
  "photo-1509557965043-4e929c0c1b9d": {
    subjects: ["halloween", "pumpkin", "outdoors", "seasonal"],
    setting: ["outdoor"],
    moment: ["evening"],
  },
  "photo-1605792657660-596af9009ce3": {
    subjects: ["halloween", "pumpkin", "seasonal"],
    setting: ["outdoor", "indoor"],
    moment: ["evening"],
  },
  "photo-1667852916327-c0444978d171": {
    subjects: ["halloween", "pumpkin", "seasonal", "bar"],
    setting: ["indoor", "bar"],
    moment: ["evening"],
  },
  "photo-1663568399694-fa3ee4fbb972": {
    subjects: ["halloween", "pumpkin", "outdoors", "seasonal"],
    setting: ["outdoor"],
    moment: ["evening"],
  },
  "photo-1698961676332-7ff9b6c5ceed": {
    subjects: ["halloween", "pumpkin", "costume", "seasonal", "party"],
    setting: ["indoor"],
    moment: ["evening"],
    ageBands: ["young", "mid"],
  },
  "photo-1512389142860-9c449e58a543": {
    subjects: ["christmas", "seasonal", "decor"],
    setting: ["indoor"],
    moment: ["evening"],
  },
  "photo-1513885535751-8b9238bd345a": {
    subjects: ["christmas", "seasonal", "decor", "gifts"],
    setting: ["indoor"],
  },
  "photo-1467810563316-b5476525c0f9": {
    subjects: ["new_year", "celebration", "party", "seasonal"],
    setting: ["outdoor", "indoor"],
    moment: ["evening", "nightlife"],
  },
  "photo-1518199266791-5375a83190b7": {
    subjects: ["valentine", "seasonal", "decor"],
    setting: ["indoor"],
  },
  "photo-1516589178581-6cd7833ae3b2": {
    subjects: ["valentine", "social", "seasonal"],
    setting: ["indoor"],
  },
  // workshop
  "mood-embodied-dating.png": {
    subjects: ["workshop", "group", "indoor"],
    setting: ["indoor"],
  },
  "photo-1556910103-1c02745aae4d": {
    subjects: ["cooking", "kitchen", "food", "workshop"],
    setting: ["indoor"],
  },
  "photo-1522202176988-66273c2fd55f": {
    subjects: ["workshop", "group", "indoor"],
    setting: ["indoor"],
  },
  "photo-1524178232363-1fb2b075b655": {
    subjects: ["workshop", "group", "indoor"],
    setting: ["indoor"],
  },
  "photo-1552664730-d307ca884978": {
    subjects: ["workshop", "group", "indoor"],
    setting: ["indoor"],
  },
  // travel
  "photo-1501785888041-af3ef285b470": {
    subjects: ["travel", "outdoors", "destination"],
    setting: ["outdoor", "nature"],
  },
  "photo-1488646953014-85cb44e25828": {
    subjects: ["travel", "destination"],
    setting: ["outdoor"],
  },
  "photo-1469854523086-cc02fe5d8800": {
    subjects: ["travel", "outdoors", "destination"],
    setting: ["outdoor"],
  },
  "photo-1476514525535-07fb3b4ae5f1": {
    subjects: ["travel", "outdoors"],
    setting: ["outdoor", "nature"],
  },
  "photo-1530789253388-582c481c54b0": {
    subjects: ["travel", "destination", "outdoors"],
    setting: ["outdoor"],
  },
};

export function getMoodAssetMeta(url: string | null | undefined): MoodAssetMeta | null {
  if (!url) return null;
  return MOOD_ASSET_META[assetKey(url)] ?? null;
}
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
    // photo-1547592160-406d259ca962 used to live here but Unsplash now 404s it.
    "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1478144592103-25e218a04891?auto=format&fit=crop&w=1200&q=80",
  ],
  party: [
    "/preview-mood/mood-mingle-night.png",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80",
    // Seasonal theme stock lives only in THEME_MOOD_POOLS (never generic party).
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

/**
 * Theme-first mood pools keyed by TITLE_THEME_RULES id.
 * Missing/empty pool ⇒ neutral fallback (never wrong generic category stock).
 * Every URL must be listed in VERIFIED_THEME_ASSET_LABELS with matching theme.
 */
export const THEME_MOOD_POOLS: Record<string, readonly string[]> = {
  halloween: [
    "https://images.unsplash.com/photo-1667852916327-c0444978d171?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1663568399694-fa3ee4fbb972?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1698961676332-7ff9b6c5ceed?auto=format&fit=crop&w=1200&q=80",
  ],
  christmas: [
    "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=1200&q=80",
  ],
  new_year: [
    "https://images.unsplash.com/photo-1467810563316-b5476525c0f9?auto=format&fit=crop&w=1200&q=80",
  ],
  valentine: [
    "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80",
  ],
  // No verified carnival stock yet → empty ⇒ neutral (never mislabelled concert).
  carnival: [],
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

/** People-centric categories where age in the title/eligibility must steer stock. */
const AGE_SENSITIVE_CATEGORIES: ReadonlySet<Exclude<ImageCategory, "neutral">> =
  new Set(["dating_social", "drinks", "party", "generic_social"]);

function moodAgeBandsForUrl(url: string): ImageAgeBand[] {
  const meta = getMoodAssetMeta(url);
  if (meta?.ageBands?.length) return meta.ageBands;
  return datingMoodAgeBands(url);
}

function moodPoolForAge(
  category: Exclude<ImageCategory, "neutral">,
  ageBand: ImageAgeBand,
): readonly string[] {
  const pool = CATEGORY_MOOD_POOLS[category];
  if (ageBand === "any" || !AGE_SENSITIVE_CATEGORIES.has(category)) {
    return pool;
  }

  const filtered = pool.filter((url) => {
    const bands = moodAgeBandsForUrl(url);
    return bands.includes(ageBand) || bands.includes("any");
  });
  if (filtered.length > 0) return filtered;

  // Hard fallback: never show young stock on mature events.
  if (ageBand === "mature") {
    const matureOnly = pool.filter((url) => {
      const bands = moodAgeBandsForUrl(url);
      return bands.includes("mature") && !bands.includes("young");
    });
    if (matureOnly.length > 0) return matureOnly;
    return pool.filter((url) => moodAgeBandsForUrl(url).includes("mature"));
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

/** SVG data-URI: calm branded surface, no false activity, no error copy. */
export const NEUTRAL_FALLBACK_DATA_URI =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#67283a"/>
          <stop offset="55%" stop-color="#2f3035"/>
          <stop offset="100%" stop-color="#1c1d21"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <circle cx="920" cy="180" r="120" fill="#c4a35a" fill-opacity="0.28"/>
      <circle cx="180" cy="720" r="160" fill="#c4a35a" fill-opacity="0.12"/>
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

export function profileForEvent(ctx: EventImageContext): VisualProfile {
  const input: VisualProfileInput = {
    category: ctx.category,
    activities: ctx.activities,
    tags: ctx.tags,
    title: ctx.title,
    subCategory: ctx.subCategory,
    description: ctx.description,
    shortDescription: ctx.shortDescription,
    organizerName: ctx.organizerName,
    minAge: ctx.minAge,
    maxAge: ctx.maxAge,
  };
  return buildVisualProfile(input);
}

/**
 * Most specific image need for an event.
 * Concrete activity wins; dating/social is never the only signal when activity is known.
 */
export function inferRequiredImageCategory(
  ctx: EventImageContext,
): ImageCategory {
  return profileForEvent(ctx).imageCategory as ImageCategory;
}

export function inferImageCategoryFromUrl(
  url: string | null | undefined,
): ImageCategory | "unknown" {
  if (!url) return "unknown";
  const lower = url.toLowerCase();

  for (const [file, category] of Object.entries(MOOD_FILE_CATEGORY)) {
    if (lower.includes(file)) return category;
  }

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
  drinks: ["drinks", "dating_social", "generic_social"],
  // Food must not fall back to generic lounge / cushions.
  food: ["food"],
  party: ["party"],
  workshop: ["workshop", "generic_social"],
  travel: ["travel", "outdoor"],
  generic_social: ["generic_social", "dating_social", "drinks"],
  neutral: ["neutral"],
};

/** Strong seasonal subjects that must only appear when the event has that theme. */
export const EXCLUSIVE_THEME_SUBJECTS = [
  "halloween",
  "christmas",
  "valentine",
  "carnival",
  "new_year",
] as const;

/** Asset key helper for verify scripts (photo-… / mood-….png). */
export function moodAssetKey(url: string): string {
  return assetKey(url);
}

function subjectsConflict(
  profile: VisualProfile,
  imageUrl: string,
): boolean {
  const meta = getMoodAssetMeta(imageUrl);
  if (!meta) return false;
  for (const avoid of profile.mustAvoid) {
    if (meta.subjects.includes(avoid)) return true;
  }
  // Hard: food/soup events reject interior-only / cushion assets.
  if (
    (profile.primaryActivity === "soup_tasting" ||
      profile.primaryActivity === "food_tasting" ||
      profile.primaryActivity === "brunch" ||
      profile.imageCategory === "food") &&
    meta.subjects.some((s) =>
      ["cushions", "furniture_only", "interior_only", "restaurant_interior"].includes(
        s,
      ),
    ) &&
    !meta.subjects.some((s) =>
      ["food", "soup", "bowls", "tasting", "dining", "brunch", "cooking"].includes(
        s,
      ),
    )
  ) {
    return true;
  }
  // Hard: seasonal stock never leaks onto unthemed / other-themed events.
  const imageThemes = EXCLUSIVE_THEME_SUBJECTS.filter((s) =>
    meta.subjects.includes(s),
  );
  if (imageThemes.length > 0) {
    if (!profile.theme) return true;
    const allowed = new Set(themeSubjectsFor(profile));
    // OK when at least one exclusive theme subject matches the event theme.
    if (!imageThemes.some((t) => allowed.has(t))) return true;
  }
  return false;
}

function themeSubjectsFor(profile: VisualProfile): string[] {
  if (!profile.theme) return [];
  const rule = TITLE_THEME_RULES.find((r) => r.id === profile.theme);
  return rule ? [...rule.subjects, rule.id] : [profile.theme];
}

function imageMatchesTitleTheme(
  profile: VisualProfile,
  meta: MoodAssetMeta,
): boolean {
  const needed = themeSubjectsFor(profile);
  if (needed.length === 0) return true;
  return needed.some((s) => meta.subjects.includes(s));
}

function subjectsMatchEnough(
  profile: VisualProfile,
  imageUrl: string,
): boolean {
  const meta = getMoodAssetMeta(imageUrl);
  if (!meta) {
    // Unknown assets cannot satisfy a strong title theme.
    return profile.theme == null;
  }
  if (profile.theme && !imageMatchesTitleTheme(profile, meta)) {
    return false;
  }
  // Theme stock may be ambience-only (pumpkins, decor); title theme is enough.
  if (profile.theme && imageMatchesTitleTheme(profile, meta)) {
    return true;
  }
  if (profile.mustInclude.length === 0) return true;
  // Title/activity subjects must overlap the image — no free pass for dating/social.
  const overlap = profile.mustInclude.filter((s) => meta.subjects.includes(s));
  return overlap.length > 0;
}

function ageCompatible(profile: VisualProfile, imageUrl: string): boolean {
  const legacy = visualAgeToLegacyBand(profile.ageBand);
  if (legacy === "any") return true;
  const bands = moodAgeBandsForUrl(imageUrl);
  if (!bands.length || bands.includes("any")) return true;
  // Mature events must never keep young-adult people stock.
  if (legacy === "mature" && bands.includes("young") && !bands.includes("mature")) {
    return false;
  }
  return bands.includes(legacy);
}

export function isImageCompatibleWithEvent(
  event: EventImageContext,
  imageUrl: string | null | undefined,
): boolean {
  if (!imageUrl) return false;
  const profile = profileForEvent(event);
  const required = profile.imageCategory as ImageCategory;
  const imageCat = inferImageCategoryFromUrl(imageUrl);
  if (imageCat === "unknown") return false;
  if (imageCat === "neutral") return true;
  if (!COMPATIBLE[required].includes(imageCat)) return false;
  if (subjectsConflict(profile, imageUrl)) return false;
  if (!subjectsMatchEnough(profile, imageUrl)) return false;
  if (!ageCompatible(profile, imageUrl)) return false;
  return true;
}

export type PublicImageKind =
  | "official"
  | "own"
  | "generated"
  | "mood"
  | "neutral_fallback";

export type ResolvedEventImage = {
  url: string;
  /**
   * Ordered failover list for the client: primary first, then alternates.
   * When a remote URL 404s, UI tries the next candidate before the calm neutral.
   */
  candidates: string[];
  imageCategory: ImageCategory;
  usedFallback: boolean;
  keptAtmosphere: boolean;
  profile?: VisualProfile;
  why?: string[];
  imageKind?: PublicImageKind;
};

function withCandidates(
  resolved: Omit<ResolvedEventImage, "candidates">,
  extras: readonly string[] = [],
): ResolvedEventImage {
  const candidates = liveMoodUrls([resolved.url, ...extras]).filter(
    (url) => url !== NEUTRAL_FALLBACK_DATA_URI,
  );
  if (resolved.url.startsWith("data:")) {
    return { ...resolved, candidates: [resolved.url] };
  }
  return {
    ...resolved,
    candidates: candidates.length > 0 ? candidates : [resolved.url],
  };
}

/** Higher = closer subject match (theme hit or more mustInclude overlap). */
function subjectFitScore(profile: VisualProfile, imageUrl: string): number {
  const meta = getMoodAssetMeta(imageUrl);
  if (!meta) return 0;
  if (profile.theme && imageMatchesTitleTheme(profile, meta)) return 100;
  if (profile.mustInclude.length === 0) return 1;
  return profile.mustInclude.filter((s) => meta.subjects.includes(s)).length;
}

function filterPoolByProfile(
  pool: readonly string[],
  profile: VisualProfile,
): string[] {
  return pool
    .filter((url) => {
      if (subjectsConflict(profile, url)) return false;
      if (!subjectsMatchEnough(profile, url)) return false;
      if (!ageCompatible(profile, url)) return false;
      return true;
    })
    .sort((a, b) => subjectFitScore(profile, b) - subjectFitScore(profile, a));
}

/**
 * Public render selection:
 * 1) compatible official image (not atmosphere / not known mood asset)
 * 2) category mood filtered by visual profile (deterministic)
 * 3) neutral (never wrong activity)
 */
export function resolvePublicEventImage(
  event: EventImageContext,
  imageUrl?: string | null,
  imageIsAtmosphere = false,
  diversityKey?: string | null,
  options?: { adminLocked?: boolean; imageType?: string | null },
): ResolvedEventImage {
  const profile = profileForEvent(event);
  const required = profile.imageCategory as ImageCategory;
  const ageBand = visualAgeToLegacyBand(profile.ageBand);
  const key = diversityKey ?? null;
  const why = profile.why;
  imageUrl = rewriteDeadMoodUrl(imageUrl);

  if (options?.adminLocked && imageUrl) {
    return withCandidates({
      url: imageUrl,
      imageCategory: (inferImageCategoryFromUrl(imageUrl) === "unknown"
        ? required
        : inferImageCategoryFromUrl(imageUrl)) as ImageCategory,
      usedFallback: false,
      keptAtmosphere: false,
      profile,
      why: [...why, "Admin override"],
      imageKind:
        options.imageType === "generated"
          ? "generated"
          : options.imageType === "mood"
            ? "mood"
            : "official",
    });
  }

  const treatAsLegacyMood =
    imageIsAtmosphere || isKnownMoodAssetUrl(imageUrl ?? null);

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
    const categoryKey =
      required === "neutral" ? ("party" as const) : required;
    const moodAlts = liveMoodUrls(
      filterPoolByProfile(
        moodPoolForAge(categoryKey, ageBand),
        profile,
      ),
    );
    return withCandidates(
      {
        url: imageUrl,
        imageCategory: inferImageCategoryFromUrl(imageUrl) as ImageCategory,
        usedFallback: false,
        keptAtmosphere: false,
        profile,
        why,
        imageKind: "official",
      },
      moodAlts,
    );
  }

  if (profile.theme || required !== "neutral") {
    const themePool = liveMoodUrls(
      filterPoolByProfile(THEME_MOOD_POOLS[profile.theme ?? ""] ?? [], profile),
    );
    // Strong title theme: never fall back to unrelated category stock.
    if (profile.theme && themePool.length === 0) {
      return withCandidates({
        url: NEUTRAL_FALLBACK_DATA_URI,
        imageCategory: "neutral",
        usedFallback: true,
        keptAtmosphere: true,
        profile,
        why: [
          ...why,
          "Neutrale fallback (thema zonder veilig passend sfeerbeeld)",
        ],
        imageKind: "neutral_fallback",
      });
    }
    const categoryKey =
      required === "neutral" ? ("party" as const) : required;
    const rawPool = moodPoolForAge(categoryKey, ageBand);
    const filtered = liveMoodUrls(filterPoolByProfile(rawPool, profile));
    const categoryPool =
      filtered.length > 0
        ? filtered
        : liveMoodUrls(
            filterPoolByProfile(CATEGORY_MOOD_POOLS[categoryKey] ?? [], profile),
          );
    const pool = themePool.length > 0 ? themePool : categoryPool;
    if (pool.length > 0) {
      const mix = key
        ? `${required}|${profile.theme ?? "none"}|${profile.primaryActivity}|${profile.ageBand}|${key}`
        : null;
      const ordered = orderPoolByDiversity(pool, mix, profile);
      const url = ordered[0]!;
      return withCandidates(
        {
          url,
          imageCategory: required === "neutral" ? "party" : required,
          usedFallback: true,
          keptAtmosphere: true,
          profile,
          why,
          imageKind: "mood",
        },
        ordered.slice(1),
      );
    }
  }

  return withCandidates({
    url: NEUTRAL_FALLBACK_DATA_URI,
    imageCategory: "neutral",
    usedFallback: true,
    keptAtmosphere: true,
    profile,
    why: [...why, "Neutrale fallback (geen veilig passend beeld)"],
    imageKind: "neutral_fallback",
  });
}

export function publicImageKindLabel(kind: PublicImageKind | undefined): string {
  switch (kind) {
    case "official":
      return "Officieel beeld";
    case "own":
      return "Eigen beeld";
    case "generated":
      return "Gegenereerd sfeerbeeld";
    case "mood":
      return "Sfeerbeeld";
    case "neutral_fallback":
      return "Neutraal fallbackbeeld";
    default:
      return "Sfeerbeeld";
  }
}
