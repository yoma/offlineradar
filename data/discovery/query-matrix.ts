/**
 * Playbook search matrix: REGIO × TAAL × FORMAT × KANAAL.
 * Blind-recall safe: no brand names in queries (Tomeeto, The Sircle, …).
 * Source: docs/discovery-playbook.md
 */

export type DiscoveryLanguage = "nl" | "fr" | "en";

export type DiscoveryFormat =
  | "party"
  | "drinks"
  | "dinner"
  | "activity"
  | "workshop"
  | "outdoor"
  | "sport"
  | "travel"
  | "weekend"
  | "speeddate"
  | "retreat";

export type DiscoveryRegionId =
  | "antwerpen"
  | "brussel"
  | "gent"
  | "leuven"
  | "mechelen"
  | "limburg"
  | "west-vlaanderen"
  | "oost-vlaanderen"
  | "wallonie"
  | "nationaal";

export type DiscoveryQuery = {
  id: string;
  region: DiscoveryRegionId;
  language: DiscoveryLanguage;
  format: DiscoveryFormat;
  /** Search string without organizer brand names. */
  query: string;
  /** Higher = prefer earlier in bounded sweeps. */
  priority: number;
  /** Wallonie slice; off by default until product unfreezes. */
  wallonie?: boolean;
  /** Travel track (playbook mandatory separate track). */
  travel?: boolean;
};

/** Channel preference order from playbook (high → low). */
export const DISCOVERY_CHANNEL_ORDER = [
  "organizer",
  "ticket_platform",
  "link_in_bio",
  "social_signal",
  "newsletter",
  "aggregator",
] as const;

export type DiscoveryChannel = (typeof DISCOVERY_CHANNEL_ORDER)[number];

export const DISCOVERY_REGIONS: {
  id: DiscoveryRegionId;
  label: string;
  languages: DiscoveryLanguage[];
  formats: DiscoveryFormat[];
  wallonie?: boolean;
}[] = [
  {
    id: "antwerpen",
    label: "Antwerpen",
    languages: ["nl", "en"],
    formats: ["party", "drinks", "activity", "dinner", "sport"],
  },
  {
    id: "brussel",
    label: "Brussel",
    languages: ["fr", "nl", "en"],
    formats: ["dinner", "party", "workshop", "drinks", "speeddate"],
  },
  {
    id: "gent",
    label: "Gent",
    languages: ["nl", "en"],
    formats: ["party", "workshop", "drinks", "outdoor"],
  },
  {
    id: "leuven",
    label: "Leuven / Vlaams-Brabant",
    languages: ["nl"],
    formats: ["dinner", "drinks", "workshop", "outdoor"],
  },
  {
    id: "mechelen",
    label: "Mechelen",
    languages: ["nl"],
    formats: ["travel", "activity"],
  },
  {
    id: "limburg",
    label: "Limburg",
    languages: ["nl"],
    formats: ["outdoor", "weekend", "sport", "drinks"],
  },
  {
    id: "west-vlaanderen",
    label: "West-Vlaanderen",
    languages: ["nl"],
    formats: ["dinner", "outdoor", "party", "activity"],
  },
  {
    id: "oost-vlaanderen",
    label: "Oost-Vlaanderen (buiten Gent)",
    languages: ["nl"],
    formats: ["outdoor", "travel"],
  },
  {
    id: "wallonie",
    label: "Wallonië",
    languages: ["fr"],
    formats: ["dinner", "party", "speeddate"],
    wallonie: true,
  },
  {
    id: "nationaal",
    label: "Nationaal / multi-regio",
    languages: ["nl", "fr"],
    formats: ["travel", "weekend", "retreat"],
  },
];

/**
 * Best-performing + matrix-expanded queries (fase 14 playbook).
 * Keep brand-free for blind recall.
 */
export const DISCOVERY_QUERY_MATRIX: DiscoveryQuery[] = [
  // NL national / multi
  {
    id: "nl-travel-weekend",
    region: "nationaal",
    language: "nl",
    format: "weekend",
    query: "singles weekend België",
    priority: 100,
    travel: true,
  },
  {
    id: "nl-travel-reizen",
    region: "nationaal",
    language: "nl",
    format: "travel",
    query: "singles reizen België",
    priority: 98,
    travel: true,
  },
  {
    id: "nl-travel-groep",
    region: "nationaal",
    language: "nl",
    format: "travel",
    query: "groepsreizen singles België",
    priority: 96,
    travel: true,
  },
  {
    id: "nl-conscious",
    region: "nationaal",
    language: "nl",
    format: "activity",
    query: "conscious dating België",
    priority: 90,
  },
  {
    id: "nl-sportieve",
    region: "nationaal",
    language: "nl",
    format: "sport",
    query: "sportieve singles België",
    priority: 88,
  },
  // City NL
  {
    id: "nl-diner-antwerpen",
    region: "antwerpen",
    language: "nl",
    format: "dinner",
    query: "singles diner Antwerpen",
    priority: 85,
  },
  {
    id: "nl-party-antwerpen",
    region: "antwerpen",
    language: "nl",
    format: "party",
    query: "singles party Antwerpen",
    priority: 84,
  },
  {
    id: "nl-party-gent",
    region: "gent",
    language: "nl",
    format: "party",
    query: "singles party Gent",
    priority: 84,
  },
  {
    id: "nl-diner-gent",
    region: "gent",
    language: "nl",
    format: "dinner",
    query: "singles diner Gent",
    priority: 82,
  },
  {
    id: "nl-wandeling",
    region: "nationaal",
    language: "nl",
    format: "outdoor",
    query: "singles wandeling België",
    priority: 80,
  },
  {
    id: "nl-padel",
    region: "nationaal",
    language: "nl",
    format: "sport",
    query: "singles padel België",
    priority: 78,
  },
  {
    id: "nl-diner-leuven",
    region: "leuven",
    language: "nl",
    format: "dinner",
    query: "singles diner Leuven",
    priority: 76,
  },
  {
    id: "nl-drinks-mechelen",
    region: "mechelen",
    language: "nl",
    format: "drinks",
    query: "singles drinks Mechelen",
    priority: 72,
  },
  {
    id: "nl-limburg-outdoor",
    region: "limburg",
    language: "nl",
    format: "outdoor",
    query: "singles wandeling Limburg",
    priority: 70,
  },
  {
    id: "nl-west-diner",
    region: "west-vlaanderen",
    language: "nl",
    format: "dinner",
    query: "singles diner Brugge",
    priority: 68,
  },
  {
    id: "nl-oost-outdoor",
    region: "oost-vlaanderen",
    language: "nl",
    format: "outdoor",
    query: "singles outdoor Oost-Vlaanderen",
    priority: 66,
  },
  // FR
  {
    id: "fr-soiree-bxl",
    region: "brussel",
    language: "fr",
    format: "party",
    query: "soirée célibataires Bruxelles",
    priority: 86,
  },
  {
    id: "fr-diner-bxl",
    region: "brussel",
    language: "fr",
    format: "dinner",
    query: "dîner célibataires Bruxelles",
    priority: 85,
  },
  {
    id: "fr-voyage",
    region: "nationaal",
    language: "fr",
    format: "travel",
    query: "voyage célibataires Belgique",
    priority: 92,
    travel: true,
  },
  {
    id: "fr-rando",
    region: "nationaal",
    language: "fr",
    format: "outdoor",
    query: "randonnée célibataires Belgique",
    priority: 74,
  },
  {
    id: "fr-speed-liege",
    region: "wallonie",
    language: "fr",
    format: "speeddate",
    query: "speed dating Liège",
    priority: 60,
    wallonie: true,
  },
  {
    id: "fr-speed-namur",
    region: "wallonie",
    language: "fr",
    format: "speeddate",
    query: "speed dating Namur",
    priority: 58,
    wallonie: true,
  },
  {
    id: "fr-dinner-wallonie",
    region: "wallonie",
    language: "fr",
    format: "dinner",
    query: "dîner célibataires Liège",
    priority: 55,
    wallonie: true,
  },
  // EN
  {
    id: "en-events-be",
    region: "nationaal",
    language: "en",
    format: "activity",
    query: "singles events Belgium",
    priority: 87,
  },
  {
    id: "en-dinner-bxl",
    region: "brussel",
    language: "en",
    format: "dinner",
    query: "singles dinner Brussels",
    priority: 83,
  },
  {
    id: "en-travel",
    region: "nationaal",
    language: "en",
    format: "travel",
    query: "singles travel Belgium",
    priority: 91,
    travel: true,
  },
  {
    id: "en-retreat",
    region: "nationaal",
    language: "en",
    format: "retreat",
    query: "singles retreat Belgium",
    priority: 75,
    travel: true,
  },
];

/** Brand names that must never appear inside matrix query strings (blind recall). */
export const DISCOVERY_BLIND_RECALL_FORBIDDEN_BRANDS = [
  "tomeeto",
  "the sircle",
  "farm date",
  "agrimatching",
  "juntas",
  "hellotravel",
  "villavibes",
  "hoptodate",
  "party4singles",
  "will you date me",
] as const;

export type SelectDiscoveryQueriesOptions = {
  includeWallonie?: boolean;
  includeTravel?: boolean;
  maxQueries?: number;
  /** Rotate starting offset (e.g. day-of-year) for bounded cron variety. */
  rotateOffset?: number;
  languages?: DiscoveryLanguage[];
  regions?: DiscoveryRegionId[];
};

/**
 * Pick a bounded, priority-sorted query batch for one sweep.
 */
export function selectDiscoveryQueries(
  options: SelectDiscoveryQueriesOptions = {},
): DiscoveryQuery[] {
  const includeWallonie = options.includeWallonie === true;
  const includeTravel = options.includeTravel !== false;
  const maxQueries = Math.max(1, Math.min(40, options.maxQueries ?? 8));
  const rotateOffset = Math.max(0, options.rotateOffset ?? 0);

  let pool = DISCOVERY_QUERY_MATRIX.filter((q) => {
    if (q.wallonie && !includeWallonie) return false;
    if (q.travel && !includeTravel) return false;
    if (options.languages && !options.languages.includes(q.language)) {
      return false;
    }
    if (options.regions && !options.regions.includes(q.region)) return false;
    return true;
  });

  pool = [...pool].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  if (pool.length === 0) return [];
  const start = rotateOffset % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.slice(0, maxQueries);
}
