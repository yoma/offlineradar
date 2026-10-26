/**
 * Lookup over every Belgian postcode place (data/be-places.ts).
 * Used to geocode event cities and as departure places for the distance filter.
 * Matching is exact (name or postcode), never a guess inside free text.
 */
import { BE_PLACES_RAW } from "@/data/be-places";

export type BelgianPlace = {
  /** Stable URL id: name slug, plus “-postcode” when the name exists twice far apart. */
  id: string;
  name: string;
  postcode: string;
  lat: number;
  lng: number;
};

/**
 * Same-name entries are one place when they share a postcode region
 * (Antwerpen 2000…2060, Liège 4000/4020) or lie this close together.
 * Aalst 3800/9300 and Hamme 1785/9220 stay two places.
 */
const SAME_PLACE_KM = 5;

function samePlace(
  a: { postcode: string; lat: number; lng: number },
  b: { postcode: string; lat: number; lng: number },
): boolean {
  return a.postcode.slice(0, 2) === b.postcode.slice(0, 2) || haversineKm(a, b) <= SAME_PLACE_KM;
}

/** Common Dutch/French/English names that are not the bpost spelling. */
const ALIASES: Record<string, string> = {
  luik: "liege",
  namen: "namur",
  waver: "wavre",
  bergen: "mons",
  doornik: "tournai",
  aarlen: "arlon",
  nijvel: "nivelles",
  hoei: "huy",
  borgworm: "waremme",
  bastenaken: "bastogne",
  moeskroen: "mouscron",
  edingen: "enghien",
  geldenaken: "jodoigne",
  anvers: "antwerpen",
  antwerp: "antwerpen",
  gand: "gent",
  ghent: "gent",
  malines: "mechelen",
  louvain: "leuven",
  courtrai: "kortrijk",
  bruges: "brugge",
  ostende: "oostende",
  ostend: "oostende",
  alost: "aalst",
  ypres: "ieper",
  bruxelles: "brussel",
  brussels: "brussel",
  ixelles: "elsene",
  schaerbeek: "schaarbeek",
  "saint gilles": "sint gillis",
  uccle: "ukkel",
  "woluwe saint lambert": "sint lambrechts woluwe",
  "woluwe saint pierre": "sint pieters woluwe",
  "molenbeek saint jean": "sint jans molenbeek",
  molenbeek: "sint jans molenbeek",
  "st niklaas": "sint niklaas",
};

/**
 * A bare name that exists twice far apart, mapped to the municipality people
 * mean by it. Lookup text in “postcode name” form.
 */
const PREFERRED: Record<string, string> = {
  aalst: "9300 Aalst",
  berchem: "2600 Berchem",
  beveren: "9120 Beveren-Waas",
  deurne: "2100 Deurne",
  halle: "1500 Halle",
  hamme: "9220 Hamme",
  haren: "1130 Haren",
  kapellen: "2950 Kapellen",
  machelen: "1830 Machelen",
  neufchateau: "6840 Neufchâteau",
  nieuwerkerken: "3850 Nieuwerkerken",
  tielt: "8700 Tielt",
  vorst: "1190 Vorst",
};

export function normalizePlaceKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slug(value: string): string {
  return normalizePlaceKey(value).replace(/\s+/g, "-");
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type Index = {
  all: BelgianPlace[];
  /** One entry per distinct place (clustered same names collapse). */
  distinct: BelgianPlace[];
  byKey: Map<string, BelgianPlace[]>;
  byPostcode: Map<string, BelgianPlace[]>;
  byId: Map<string, BelgianPlace>;
};

let index: Index | null = null;

function buildIndex(): Index {
  const parsed = BE_PLACES_RAW.trim()
    .split("\n")
    .map((line) => {
      const [postcode, name, lat, lng] = line.split("|");
      return { postcode: postcode!, name: name!, lat: Number(lat), lng: Number(lng) };
    })
    .sort((a, b) => a.postcode.localeCompare(b.postcode));

  const groups = new Map<string, typeof parsed>();
  for (const row of parsed) {
    const key = normalizePlaceKey(row.name);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const all: BelgianPlace[] = [];
  const distinct: BelgianPlace[] = [];
  const byKey = new Map<string, BelgianPlace[]>();
  const byPostcode = new Map<string, BelgianPlace[]>();
  const byId = new Map<string, BelgianPlace>();

  for (const [key, rows] of groups) {
    // Cluster around the lowest postcode; a far same-name place gets its own id.
    const clusters: (typeof parsed)[] = [];
    for (const row of rows) {
      const home = clusters.find((cluster) => samePlace(cluster[0]!, row));
      if (home) home.push(row);
      else clusters.push([row]);
    }
    const ambiguous = clusters.length > 1;
    const heads: BelgianPlace[] = [];
    for (const cluster of clusters) {
      const head = cluster[0]!;
      const id = ambiguous ? `${slug(head.name)}-${head.postcode}` : slug(head.name);
      const places = cluster.map((row) => ({ ...row, id }));
      all.push(...places);
      heads.push(places[0]!);
      distinct.push(places[0]!);
      byId.set(id, places[0]!);
      for (const place of places) {
        const list = byPostcode.get(place.postcode) ?? [];
        list.push(place);
        byPostcode.set(place.postcode, list);
      }
    }
    byKey.set(key, heads);
  }
  distinct.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  return { all, distinct, byKey, byPostcode, byId };
}

function getIndex(): Index {
  index ??= buildIndex();
  return index;
}

function headsForName(name: string): BelgianPlace[] {
  const { byKey } = getIndex();
  const key = normalizePlaceKey(name);
  if (!key) return [];
  return byKey.get(key) ?? byKey.get(ALIASES[key] ?? "") ?? [];
}

/**
 * For a bare postcode: the place nearest the middle of all places sharing it.
 * That is the town itself (9620 → Zottegem, 8800 → Roeselare), not a
 * deelgemeente at the edge.
 */
function centralPlace(places: BelgianPlace[]): BelgianPlace {
  const lat = places.reduce((sum, place) => sum + place.lat, 0) / places.length;
  const lng = places.reduce((sum, place) => sum + place.lng, 0) / places.length;
  let best = places[0]!;
  for (const place of places) {
    if (haversineKm(place, { lat, lng }) < haversineKm(best, { lat, lng })) best = place;
  }
  return best;
}

/**
 * Exact lookup for a city field: “Zottegem”, “9300 Aalst”, “Aalst (9300)”, “Luik”.
 * A bare name that exists twice far apart (Aalst 3800/9300) resolves only
 * through PREFERRED; otherwise it returns null and needs a postcode.
 */
export function findBelgianPlace(
  text: string | null | undefined,
): BelgianPlace | null {
  if (!text?.trim()) return null;
  const postcode = text.match(/\b([1-9]\d{3})\b/)?.[1];
  const name = text
    .replace(/\b[1-9]\d{3}\b/, " ")
    .replace(/[()]/g, " ")
    .trim();
  if (postcode) {
    const atCode = getIndex().byPostcode.get(postcode) ?? [];
    if (atCode.length === 0) return null;
    if (!name) return centralPlace(atCode);
    const key = normalizePlaceKey(name);
    const aliased = ALIASES[key];
    // A postcode with a name it does not cover is a typo; do not guess.
    return (
      atCode.find((place) => {
        const own = normalizePlaceKey(place.name);
        return own === key || own === aliased;
      }) ?? null
    );
  }
  const heads = headsForName(name);
  if (heads.length === 1) return heads[0]!;
  const preferred = PREFERRED[normalizePlaceKey(name)];
  return preferred ? findBelgianPlace(preferred) : null;
}

export function belgianPlaceById(id: string): BelgianPlace | null {
  return getIndex().byId.get(id) ?? null;
}

/** Text shown for a place in the picker; ambiguous names carry their postcode. */
export function belgianPlaceLabel(place: BelgianPlace): string {
  return place.id.endsWith(`-${place.postcode}`)
    ? `${place.name} (${place.postcode})`
    : place.name;
}

/**
 * Picker suggestions. Prefix matches first, then word matches
 * (“niklaas” finds Sint-Niklaas). A postcode prefix also matches.
 */
export function searchBelgianPlaces(query: string, limit = 12): BelgianPlace[] {
  const key = normalizePlaceKey(query);
  if (!key) return [];
  const { distinct, byPostcode } = getIndex();
  if (/^\d+$/.test(key)) {
    const out: BelgianPlace[] = [];
    const seen = new Set<string>();
    for (const [code, places] of byPostcode) {
      if (!code.startsWith(key)) continue;
      for (const place of places) {
        const head = getIndex().byId.get(place.id)!;
        if (seen.has(head.id)) continue;
        seen.add(head.id);
        out.push(head);
      }
    }
    return out
      .sort((a, b) => a.postcode.localeCompare(b.postcode))
      .slice(0, limit);
  }
  const aliased = ALIASES[key];
  const prefix: BelgianPlace[] = [];
  const word: BelgianPlace[] = [];
  for (const place of distinct) {
    const own = normalizePlaceKey(place.name);
    if (own.startsWith(key) || (aliased && own === aliased)) prefix.push(place);
    else if (own.includes(` ${key}`)) word.push(place);
  }
  // Exact name first, then shorter names (towns before deelgemeente variants).
  prefix.sort((a, b) => {
    const exactA = normalizePlaceKey(a.name) === key ? 0 : 1;
    const exactB = normalizePlaceKey(b.name) === key ? 0 : 1;
    return exactA - exactB || a.name.length - b.name.length || a.name.localeCompare(b.name, "nl");
  });
  return [...prefix, ...word].slice(0, limit);
}
