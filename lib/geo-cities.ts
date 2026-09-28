/**
 * City-center coordinates for distance when edition lat/lng is missing.
 * Never invent Antwerp for a different city.
 */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // Search places + Flanders
  antwerpen: { lat: 51.2194, lng: 4.4025 },
  mechelen: { lat: 51.0257, lng: 4.4776 },
  brussel: { lat: 50.8503, lng: 4.3517 },
  bruxelles: { lat: 50.8503, lng: 4.3517 },
  gent: { lat: 51.0543, lng: 3.7174 },
  leuven: { lat: 50.8798, lng: 4.7005 },
  turnhout: { lat: 51.3227, lng: 4.9446 },
  brugge: { lat: 51.2093, lng: 3.2247 },
  kortrijk: { lat: 50.8279, lng: 3.2649 },
  hasselt: { lat: 50.9307, lng: 5.3378 },
  aalst: { lat: 50.9372, lng: 4.0403 },
  geel: { lat: 51.1655, lng: 4.9892 },
  lochristi: { lat: 51.0973, lng: 3.8396 },
  "sint niklaas": { lat: 51.1657, lng: 4.1437 },
  sintniklaas: { lat: 51.1657, lng: 4.1437 },
  oostende: { lat: 51.2303, lng: 2.9169 },
  ieper: { lat: 50.8511, lng: 2.8857 },
  lier: { lat: 51.1313, lng: 4.5704 },
  kapellen: { lat: 51.3133, lng: 4.4347 },
  edegem: { lat: 51.1548, lng: 4.4453 },
  gooik: { lat: 50.7944, lng: 4.0428 },
  haacht: { lat: 50.9767, lng: 4.6381 },
  "heusden zolder": { lat: 51.0389, lng: 5.3011 },
  heusdenzolder: { lat: 51.0389, lng: 5.3011 },
  oostkamp: { lat: 51.1554, lng: 3.2291 },
  ronse: { lat: 50.7456, lng: 3.6007 },
  stekene: { lat: 51.2097, lng: 4.0403 },
  tremelo: { lat: 50.9914, lng: 4.7028 },
  // Wallonie / FR BE
  wavre: { lat: 50.7172, lng: 4.6093 },
  "louvain la neuve": { lat: 50.6696, lng: 4.6155 },
  louvainlaneuve: { lat: 50.6696, lng: 4.6155 },
  mons: { lat: 50.4542, lng: 3.9563 },
  namur: { lat: 50.4674, lng: 4.8719 },
  liege: { lat: 50.6326, lng: 5.5797 },
  luik: { lat: 50.6326, lng: 5.5797 },
  herve: { lat: 50.6408, lng: 5.7939 },
  hatrival: { lat: 50.0261, lng: 5.3514 },
  vielsalm: { lat: 50.2861, lng: 5.9153 },
  "la roche en ardenne": { lat: 50.1828, lng: 5.5753 },
  larocheenardenne: { lat: 50.1828, lng: 5.5753 },
  viroinval: { lat: 50.0706, lng: 4.5522 },
  // Travel / abroad hubs (still better than inventing Antwerp)
  ibiza: { lat: 38.9067, lng: 1.4206 },
  tenerife: { lat: 28.2916, lng: -16.6291 },
  cyprus: { lat: 35.1264, lng: 33.4299 },
  egypte: { lat: 27.2579, lng: 33.8116 },
  "costa de la luz": { lat: 36.52, lng: -6.28 },
  costadelaluz: { lat: 36.52, lng: -6.28 },
  lagos: { lat: 37.1028, lng: -8.673 },
  "gran canaria": { lat: 27.9202, lng: -15.5474 },
  grancanaria: { lat: 27.9202, lng: -15.5474 },
  kronplatz: { lat: 46.7389, lng: 11.9528 },
  oostenrijk: { lat: 47.2692, lng: 11.4041 },
};

function normalizeCityKey(city: string): string {
  return city
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactCityKey(city: string): string {
  return normalizeCityKey(city).replace(/\s+/g, "");
}

export function coordsForCity(city: string | null | undefined): {
  lat: number;
  lng: number;
} | null {
  if (!city?.trim()) return null;
  const key = normalizeCityKey(city);
  const compact = compactCityKey(city);
  if (CITY_COORDS[key]) return CITY_COORDS[key]!;
  if (CITY_COORDS[compact]) return CITY_COORDS[compact]!;
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (
      key === name ||
      compact === name.replace(/\s+/g, "") ||
      key.startsWith(`${name} `) ||
      key.includes(` ${name} `)
    ) {
      return coords;
    }
  }
  return null;
}

export function resolveEditionCoords(input: {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
}): { lat: number; lng: number; known: boolean } {
  if (
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return { lat: input.latitude, lng: input.longitude, known: true };
  }
  const fromCity = coordsForCity(input.city);
  if (fromCity) return { ...fromCity, known: true };
  return { lat: Number.NaN, lng: Number.NaN, known: false };
}

/** For DB writes: keep explicit coords, else city center, else null (never invent Antwerp). */
export function resolveCoordsForWrite(input: {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
}): { latitude: number | null; longitude: number | null } {
  if (
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return { latitude: input.latitude, longitude: input.longitude };
  }
  const fromCity = coordsForCity(input.city);
  return {
    latitude: fromCity?.lat ?? null,
    longitude: fromCity?.lng ?? null,
  };
}
