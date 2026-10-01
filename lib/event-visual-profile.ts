/**
 * Deterministic visual profile for event image selection (FASE 26.19).
 * No runtime AI. Untrusted event text is data only, never instructions.
 */
import type { ActivityId, EventCategory } from "@/types/event";

/** Mirrors ImageCategory without importing image-compatibility (avoid cycles). */
export type ProfileImageCategory =
  | "outdoor"
  | "bowling"
  | "sport"
  | "padel"
  | "dating_social"
  | "drinks"
  | "food"
  | "party"
  | "workshop"
  | "travel"
  | "generic_social"
  | "neutral";

export type VisualAgeBand =
  | "20-30"
  | "30-40"
  | "40-50"
  | "50-60"
  | "mixed_adults"
  | "unknown";

export type VisualPrimaryActivity =
  | "soup_tasting"
  | "food_tasting"
  | "brunch"
  | "cooking"
  | "padel"
  | "bowling"
  | "walking"
  | "running"
  | "speeddate"
  | "karaoke"
  | "nightlife_dance"
  | "drinks"
  | "workshop"
  | "travel"
  | "comedy"
  | "boardgames"
  | "sport"
  | "dating_social"
  | "generic_social";

export type VisualProfile = {
  primaryActivity: VisualPrimaryActivity;
  secondaryActivity: VisualPrimaryActivity | null;
  subjects: string[];
  setting: string[];
  moment: string[];
  ageBand: VisualAgeBand;
  mood: string[];
  mustInclude: string[];
  mustAvoid: string[];
  imageCategory: ProfileImageCategory;
  /** Short Dutch reasons for admin UI. */
  why: string[];
};

export type VisualProfileInput = {
  category: EventCategory;
  activities: ActivityId[];
  tags?: string[];
  title?: string | null;
  subCategory?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  organizerName?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
};

function haystack(input: VisualProfileInput): string {
  return [
    input.title ?? "",
    input.subCategory ?? "",
    input.shortDescription ?? "",
    input.description ?? "",
    input.organizerName ?? "",
    ...(input.tags ?? []),
    ...input.activities,
    input.category,
  ]
    .join(" ")
    .toLowerCase();
}

/** Strip instruction-like lines from untrusted descriptions before keyword scan. */
function sanitizeUntrustedText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split("\n")
    .filter((line) => !/^\s*(ignore|system|prompt|instruction)\b/i.test(line))
    .join(" ")
    .slice(0, 4000);
}

export function inferVisualAgeBand(input: {
  minAge?: number | null;
  maxAge?: number | null;
  title?: string | null;
}): VisualAgeBand {
  const title = input.title ?? "";
  const range = title.match(/(\d{2})\s*[–\-]\s*(\d{2})/);
  const plus = title.match(/\b(\d{2})\s*(?:\+|plus\b|plussers?\b)/i);
  const min = input.minAge ?? (range ? Number(range[1]) : plus ? Number(plus[1]) : null);
  const max =
    input.maxAge ?? (range ? Number(range[2]) : null);

  if (min != null && min >= 50) return "50-60";
  if (min != null && min >= 45 && (max == null || max >= 50)) return "50-60";
  if (min != null && min >= 40 && (max == null || max >= 45)) return "40-50";
  if (max != null && max <= 30) return "20-30";
  if (max != null && max <= 35 && (min == null || min <= 25)) return "20-30";
  if (min != null && min >= 30 && max != null && max <= 40) return "30-40";
  if (min != null && min >= 35 && max != null && max <= 50) return "40-50";
  if (min != null && min >= 30) return "30-40";
  if (min != null || max != null) return "mixed_adults";
  return "unknown";
}

type ActivityRule = {
  activity: VisualPrimaryActivity;
  pattern: RegExp;
  subjects: string[];
  setting?: string[];
  moment?: string[];
  mood?: string[];
  mustInclude: string[];
  mustAvoid: string[];
  imageCategory: ProfileImageCategory;
  why: string;
};

const ACTIVITY_RULES: ActivityRule[] = [
  {
    activity: "soup_tasting",
    pattern: /\b(soep|soup|soepen|soepproef|soep.?proef)\b/,
    subjects: ["soup", "food", "bowls", "table", "tasting"],
    setting: ["indoor", "restaurant"],
    moment: ["afternoon", "evening"],
    mood: ["cozy", "social", "casual"],
    mustInclude: ["soup", "food", "table", "bowls", "tasting"],
    mustAvoid: [
      "cushions",
      "furniture_only",
      "interior_only",
      "bowling",
      "padel",
      "hiking",
      "nightclub",
      "sport_field",
    ],
    imageCategory: "food",
    why: "Past bij soep / food tasting",
  },
  {
    activity: "food_tasting",
    pattern:
      /\b(proeverij|tasting|proeven|wijnproef|wine.?tast|food.?tast|hapjes|tapas)\b/,
    subjects: ["food", "tasting", "table", "shared_table"],
    setting: ["indoor", "restaurant"],
    mood: ["social", "cozy"],
    mustInclude: ["food", "table", "tasting"],
    mustAvoid: [
      "cushions",
      "furniture_only",
      "interior_only",
      "bowling",
      "hiking",
      "nightclub",
      "sport_field",
    ],
    imageCategory: "food",
    why: "Past bij proeverij / tasting",
  },
  {
    activity: "brunch",
    pattern: /\b(brunch|ontbijt|breakfast)\b/,
    subjects: ["brunch", "food", "table", "daytime"],
    setting: ["indoor", "restaurant"],
    moment: ["breakfast", "afternoon"],
    mood: ["casual", "social"],
    mustInclude: ["food", "table", "brunch", "daytime"],
    mustAvoid: ["nightclub", "neon", "bowling", "hiking", "cushions"],
    imageCategory: "food",
    why: "Past bij brunch / ontbijt",
  },
  {
    activity: "cooking",
    pattern: /\b(kook|cooking|kokkerel|kookworkshop|culinaire)\b/,
    subjects: ["cooking", "kitchen", "food"],
    setting: ["indoor"],
    mood: ["playful", "social"],
    mustInclude: ["cooking", "food", "kitchen"],
    mustAvoid: ["bowling", "hiking", "nightclub", "cushions"],
    imageCategory: "food",
    why: "Past bij koken / cooking",
  },
  {
    activity: "karaoke",
    pattern: /\b(karaoke|karaoké|zingavond|microfoon)\b/,
    subjects: ["karaoke", "microphone", "nightlife", "stage"],
    setting: ["indoor", "bar"],
    moment: ["evening", "nightlife"],
    mood: ["energetic", "playful"],
    mustInclude: ["karaoke", "microphone", "nightlife"],
    mustAvoid: ["hiking", "food_closeup", "sport_field", "padel", "bowling"],
    imageCategory: "party",
    why: "Past bij karaoke",
  },
  {
    activity: "bowling",
    pattern: /\b(bowling|bowlen)\b/,
    subjects: ["bowling", "lanes", "indoor_sport"],
    setting: ["indoor", "sports_hall"],
    mood: ["playful", "social"],
    mustInclude: ["bowling"],
    mustAvoid: ["hiking", "restaurant_only", "nightclub", "padel", "soup"],
    imageCategory: "bowling",
    why: "Past bij bowling",
  },
  {
    activity: "padel",
    pattern: /\b(padel|padeldate)\b/,
    subjects: ["padel", "racket", "court", "sport"],
    setting: ["sports_hall", "outdoor"],
    mood: ["sporty", "energetic"],
    mustInclude: ["padel", "court", "sport"],
    mustAvoid: ["bowling", "restaurant_only", "hiking", "nightclub", "soup"],
    imageCategory: "padel",
    why: "Past bij padel",
  },
  {
    activity: "running",
    pattern: /\b(run|running|lopen|jogging|breakfast.?run)\b/,
    subjects: ["running", "sport", "outdoors", "daytime"],
    setting: ["outdoor", "city"],
    moment: ["breakfast", "afternoon"],
    mood: ["sporty", "energetic"],
    mustInclude: ["running", "outdoors", "daytime"],
    mustAvoid: ["nightclub", "neon", "bowling", "restaurant_only", "cushions"],
    imageCategory: "sport",
    why: "Past bij lopen / running",
  },
  {
    activity: "walking",
    pattern:
      /\b(wandeling|wandelen|hike|hiking|stadswandeling|city.?walk|natuurwandeling|boswandeling)\b/,
    subjects: ["walking", "outdoors", "group", "nature_or_city"],
    setting: ["outdoor", "nature", "city"],
    moment: ["afternoon"],
    mood: ["relaxed", "social"],
    mustInclude: ["walking", "outdoors"],
    mustAvoid: ["nightclub", "bowling", "restaurant_closeup", "padel", "karaoke"],
    imageCategory: "outdoor",
    why: "Past bij wandelen",
  },
  {
    activity: "speeddate",
    pattern: /\b(speeddate|speed.?dat|speed.?dating)\b/,
    subjects: ["conversation", "seated", "social", "table"],
    setting: ["indoor", "bar", "restaurant"],
    moment: ["evening"],
    mood: ["social", "casual"],
    mustInclude: ["conversation", "social", "seated"],
    mustAvoid: ["hiking", "bowling", "sport_field", "couple_romance_only"],
    imageCategory: "dating_social",
    why: "Past bij speeddate / gesprek",
  },
  {
    activity: "nightlife_dance",
    pattern: /\b(party|feest|soirée|soiree|dans|nightlife|dance.?party|mingle|halloween)\b/,
    subjects: ["nightlife", "dancing", "party"],
    setting: ["indoor", "bar"],
    moment: ["evening", "nightlife"],
    mood: ["energetic"],
    mustInclude: ["nightlife", "party", "dancing"],
    mustAvoid: ["hiking", "soup", "padel", "breakfast"],
    imageCategory: "party",
    why: "Past bij party / dans",
  },
  {
    activity: "drinks",
    pattern: /\b(apero|apéros|borrel|cocktail|praatcafé|praatcafe|drinks|café|cafe)\b/,
    subjects: ["drinks", "bar", "social"],
    setting: ["indoor", "bar"],
    moment: ["evening"],
    mood: ["social", "casual"],
    mustInclude: ["drinks", "social"],
    mustAvoid: ["hiking", "bowling", "sport_field", "soup"],
    imageCategory: "drinks",
    why: "Past bij drinks / aperitief",
  },
  {
    activity: "comedy",
    pattern: /\b(comedy|standup|stand.?up|cabaret|theater|theatre)\b/,
    subjects: ["comedy", "theatre", "stage"],
    setting: ["indoor"],
    moment: ["evening"],
    mood: ["playful"],
    mustInclude: ["theatre", "stage", "indoor"],
    mustAvoid: ["hiking", "bowling", "sport_field"],
    imageCategory: "workshop",
    why: "Past bij comedy / theatre",
  },
  {
    activity: "boardgames",
    pattern: /\b(boardgame|bordspel|spelavond|tabletop)\b/,
    subjects: ["boardgames", "table", "indoor"],
    setting: ["indoor"],
    mood: ["playful", "social"],
    mustInclude: ["boardgames", "table"],
    mustAvoid: ["hiking", "nightclub", "sport_field"],
    imageCategory: "workshop",
    why: "Past bij bordspellen",
  },
  {
    activity: "workshop",
    pattern: /\b(workshop|embodied|cursus)\b/,
    subjects: ["workshop", "group", "indoor"],
    setting: ["indoor"],
    mood: ["social"],
    mustInclude: ["workshop", "group"],
    mustAvoid: ["hiking", "bowling", "nightclub"],
    imageCategory: "workshop",
    why: "Past bij workshop",
  },
  {
    activity: "travel",
    pattern: /\b(weekend|reizen|reis|ardenne|manoir|villa|vakantie)\b/,
    subjects: ["travel", "destination", "outdoors"],
    setting: ["outdoor", "nature"],
    mood: ["relaxed"],
    mustInclude: ["travel", "outdoors"],
    mustAvoid: ["bowling", "nightclub", "karaoke"],
    imageCategory: "travel",
    why: "Past bij reis / weekend",
  },
  {
    activity: "sport",
    pattern: /\b(sport|fitness|tennis|volley|badminton)\b/,
    subjects: ["sport", "active"],
    setting: ["sports_hall", "outdoor"],
    mood: ["sporty"],
    mustInclude: ["sport"],
    mustAvoid: ["restaurant_only", "nightclub", "cushions"],
    imageCategory: "sport",
    why: "Past bij sport",
  },
  {
    activity: "food_tasting",
    pattern: /\b(dinner|diner|eten|restaurant|food|koken)\b/,
    subjects: ["food", "table", "dining"],
    setting: ["indoor", "restaurant"],
    mood: ["social", "cozy"],
    mustInclude: ["food", "table"],
    mustAvoid: [
      "cushions",
      "furniture_only",
      "interior_only",
      "bowling",
      "hiking",
      "nightclub",
    ],
    imageCategory: "food",
    why: "Past bij eten / diner",
  },
];

const ACTIVITY_FROM_ID: Partial<
  Record<ActivityId, VisualPrimaryActivity>
> = {
  eten: "food_tasting",
  drinken: "drinks",
  wandelen: "walking",
  lopen: "running",
  outdoor: "walking",
  padel: "padel",
  sport: "sport",
  party: "nightlife_dance",
  dans: "nightlife_dance",
  workshop: "workshop",
  reizen: "travel",
  weekend: "travel",
  speeddate: "speeddate",
};

function defaultsForActivity(
  activity: VisualPrimaryActivity,
): Pick<
  VisualProfile,
  | "subjects"
  | "setting"
  | "moment"
  | "mood"
  | "mustInclude"
  | "mustAvoid"
  | "imageCategory"
  | "why"
> {
  const rule = ACTIVITY_RULES.find((r) => r.activity === activity);
  if (rule) {
    return {
      subjects: rule.subjects,
      setting: rule.setting ?? ["indoor"],
      moment: rule.moment ?? [],
      mood: rule.mood ?? ["social"],
      mustInclude: rule.mustInclude,
      mustAvoid: rule.mustAvoid,
      imageCategory: rule.imageCategory,
      why: [rule.why],
    };
  }
  if (activity === "dating_social") {
    return {
      subjects: ["social", "conversation", "group"],
      setting: ["indoor"],
      moment: ["evening"],
      mood: ["social"],
      mustInclude: ["social", "group"],
      mustAvoid: ["hiking", "bowling", "sport_field", "couple_romance_only"],
      imageCategory: "dating_social",
      why: ["Past bij sociale dating-setting"],
    };
  }
  return {
    subjects: ["social", "group", "adults"],
    setting: ["indoor"],
    moment: [],
    mood: ["social", "casual"],
    mustInclude: ["social", "group"],
    mustAvoid: ["bowling", "sport_field", "couple_romance_only"],
    imageCategory: "generic_social",
    why: ["Veilige neutrale sociale sfeer"],
  };
}

/**
 * Build a visual profile. Activity keywords beat category=dating.
 */
export function buildVisualProfile(input: VisualProfileInput): VisualProfile {
  const text = [
    haystack({
      ...input,
      description: sanitizeUntrustedText(input.description),
      shortDescription: sanitizeUntrustedText(input.shortDescription),
    }),
  ]
    .join(" ")
    .toLowerCase();

  const matched: ActivityRule[] = [];
  for (const rule of ACTIVITY_RULES) {
    if (rule.pattern.test(text)) matched.push(rule);
  }

  // Named drinks formats beat outdoor when both present (Apero + wandeling).
  const drinksHit = matched.find((m) => m.activity === "drinks");
  const walkHit = matched.find((m) => m.activity === "walking");
  if (drinksHit && walkHit) {
    const withoutWalk = matched.filter((m) => m.activity !== "walking");
    matched.length = 0;
    matched.push(...withoutWalk);
    if (!matched.includes(walkHit)) matched.push(walkHit);
    const idx = matched.findIndex((m) => m.activity === "drinks");
    if (idx > 0) {
      const [d] = matched.splice(idx, 1);
      matched.unshift(d!);
    }
  }

  // Breakfast run: running beats brunch/food when run keywords present.
  const runHit = matched.find((m) => m.activity === "running");
  const brunchHit = matched.find((m) => m.activity === "brunch");
  if (runHit && brunchHit) {
    const rest = matched.filter((m) => m.activity !== "brunch");
    matched.length = 0;
    matched.push(...rest);
    const idx = matched.findIndex((m) => m.activity === "running");
    if (idx > 0) {
      const [r] = matched.splice(idx, 1);
      matched.unshift(r!);
    }
  }

  // Wandelweekend: travel beats pure walking when weekend/reis present.
  const travelHit = matched.find((m) => m.activity === "travel");
  const walkOnly = matched.find((m) => m.activity === "walking");
  if (travelHit && walkOnly) {
    const rest = matched.filter((m) => m.activity !== "walking");
    matched.length = 0;
    matched.push(...rest);
    const idx = matched.findIndex((m) => m.activity === "travel");
    if (idx > 0) {
      const [t] = matched.splice(idx, 1);
      matched.unshift(t!);
    }
  }

  let primary: VisualPrimaryActivity | null = matched[0]?.activity ?? null;
  let secondary: VisualPrimaryActivity | null = matched[1]?.activity ?? null;

  if (!primary) {
    for (const activity of input.activities) {
      const mapped = ACTIVITY_FROM_ID[activity];
      if (mapped) {
        primary = mapped;
        break;
      }
    }
  }

  if (!primary) {
    if (input.category === "dating" || /\b(dating|singles)\b/.test(text)) {
      primary = "dating_social";
    } else if (
      input.category === "social" ||
      input.category === "meet_new_people"
    ) {
      primary = "generic_social";
    } else {
      primary = "generic_social";
    }
  }

  // Singles/dating is context only when a concrete activity is known.
  if (
    primary === "dating_social" &&
    matched.some((m) => m.activity !== "dating_social" && m.activity !== "speeddate")
  ) {
    const concrete = matched.find(
      (m) => m.activity !== "dating_social" && m.activity !== "speeddate",
    );
    if (concrete) {
      secondary = primary;
      primary = concrete.activity;
    }
  }

  const base = defaultsForActivity(primary);
  const ageBand = inferVisualAgeBand(input);
  const why = [...base.why];
  if (ageBand !== "unknown") {
    why.push(`doelgroep ${ageBand}`);
  }
  if (base.setting[0]) why.push(base.setting[0]);

  // Breakfast run: running + breakfast moment
  if (primary === "running" && /\b(breakfast|ontbijt|brunch)\b/.test(text)) {
    base.moment = ["breakfast", "afternoon"];
    base.mustAvoid = [
      ...base.mustAvoid,
      "nightclub",
      "neon",
      "evening_club",
    ];
    why.push("overdag / breakfast");
  }

  return {
    primaryActivity: primary,
    secondaryActivity: secondary,
    subjects: base.subjects,
    setting: base.setting,
    moment: base.moment,
    ageBand,
    mood: base.mood,
    mustInclude: base.mustInclude,
    mustAvoid: base.mustAvoid,
    imageCategory: base.imageCategory,
    why,
  };
}

/** Map new age bands to legacy ImageAgeBand used by mood pools. */
export function visualAgeToLegacyBand(
  band: VisualAgeBand,
): "young" | "mid" | "mature" | "any" {
  if (band === "20-30") return "young";
  if (band === "30-40") return "mid";
  if (band === "40-50" || band === "50-60") return "mature";
  if (band === "mixed_adults") return "mid";
  return "any";
}

/** Concept prompt for optional image generation (no runtime AI by default). */
export function buildVisualGenerationPrompt(profile: VisualProfile): string {
  const age =
    profile.ageBand === "unknown" || profile.ageBand === "mixed_adults"
      ? "mixed adults"
      : `approximately ${profile.ageBand.replace("-", " to ")} years old`;
  const activity = profile.primaryActivity.replace(/_/g, " ");
  const subjects = profile.subjects.join(", ");
  const setting = profile.setting.join(", ") || "realistic European setting";
  const mood = profile.mood.join(", ") || "natural and social";
  return [
    `Authentic natural photo of a small group of adults (${age}) during ${activity}.`,
    `Visual focus: ${subjects}.`,
    `Setting: ${setting}. Mood: ${mood}.`,
    "Group of adults preferred over one romantic couple.",
    "No text, no logos, no hearts, no dating-app look, no staged handshake stock.",
    `Avoid: ${profile.mustAvoid.join(", ") || "generic dating clichés"}.`,
  ].join(" ");
}
