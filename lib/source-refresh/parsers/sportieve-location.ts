/**
 * Deterministic Sportieve Singles location evidence from listing/detail text.
 * Postcode + place name are independent signals; they must agree (or be aliases)
 * before a city is confirmed. Generic "België" / region-only is never enough.
 */
import { coordsForCity, inferKnownCityLabel } from "@/lib/geo-cities";
import { normalizeText, slugify } from "@/lib/source-refresh/normalize";

/** Belgian postcode → municipality (only curated, high-confidence entries). */
export const BE_POSTCODE_CITY: Record<string, string> = {
  "8670": "Koksijde", // incl. Oostduinkerke
  "9700": "Oudenaarde", // incl. Ename
  "3980": "Tessenderlo", // Tessenderlo-Ham
  "6820": "Florenville",
  "2323": "Hoogstraten", // Wortel / Kolonie
  "3530": "Houthalen-Helchteren",
  "3360": "Bierbeek", // Lovenjoel
  "2930": "Brasschaat", // Peerdsbos area
  "2600": "Antwerpen", // Berchem
};

/** Place / venue tokens → canonical municipality used for geo. */
const PLACE_ALIASES: Array<{ pattern: RegExp; city: string }> = [
  { pattern: /\bberchem\b/i, city: "Antwerpen" },
  { pattern: /\boostduinkerke\b/i, city: "Koksijde" },
  { pattern: /\bkoksijde\b/i, city: "Koksijde" },
  { pattern: /\bename\b/i, city: "Oudenaarde" },
  { pattern: /\boudenaarde\b/i, city: "Oudenaarde" },
  { pattern: /\btessenderlo(?:-ham)?\b/i, city: "Tessenderlo" },
  { pattern: /\bgerhagen\b/i, city: "Tessenderlo" },
  { pattern: /\bflorenville\b/i, city: "Florenville" },
  { pattern: /\bhoogstraten\b/i, city: "Hoogstraten" },
  { pattern: /\bwortel(?:-kolonie)?\b/i, city: "Hoogstraten" },
  { pattern: /\bhouthalen(?:-helchteren)?\b/i, city: "Houthalen-Helchteren" },
  { pattern: /\bkelchterhoef\b/i, city: "Houthalen-Helchteren" },
  { pattern: /\blovenjoel\b/i, city: "Bierbeek" },
  { pattern: /\bbierbeek\b/i, city: "Bierbeek" },
  { pattern: /\b(?:melkerij\s+)?peerdsbos\b/i, city: "Brasschaat" },
  { pattern: /\bbrasschaat\b/i, city: "Brasschaat" },
  { pattern: /\bantwerpen\b/i, city: "Antwerpen" },
  { pattern: /\bgent\b/i, city: "Gent" },
  { pattern: /\bkortrijk\b/i, city: "Kortrijk" },
  { pattern: /\bleuven\b/i, city: "Leuven" },
];

const GENERIC_PLACE =
  /^(belgi[eë]|belgium|vlaanderen|flanders|walloni[eë]|ardennen|ardennes|limburg|kempen|hageland|regio)$/i;

export type SportieveLocationEvidence = {
  city: string | null;
  postalCode: string | null;
  placeName: string | null;
  /** Independent signals that agreed on the city. */
  evidence: string[];
  /** True when city is specific enough for Ontdek geo. */
  confirmed: boolean;
  weakReason: string | null;
};

export function isWeakSportieveCity(city: string | null | undefined): boolean {
  if (!city?.trim()) return true;
  if (GENERIC_PLACE.test(city.trim())) return true;
  return coordsForCity(city) == null;
}

/** Title suffix after " / " on Sportieve listing cards. */
export function placeFromTitleSuffix(title: string): string | null {
  const m = title.match(/\/\s*([^/\n]+?)\s*$/u);
  if (!m?.[1]) return null;
  const raw = m[1].replace(/\s+/g, " ").trim();
  if (!raw || GENERIC_PLACE.test(raw)) return null;
  return raw;
}

/** First BE postcode + following place token. */
export function extractBePostcodePlace(text: string): {
  postalCode: string;
  placeName: string;
  cityFromPostcode: string | null;
} | null {
  const m =
    /\b([1-9]\d{3})\s+([A-ZÀ-Ü][A-Za-zÀ-ÿ'’ -]{2,40}?)(?=,|\s+Belgi|\s*$)/iu.exec(
      text.replace(/\u00a0/g, " "),
    );
  if (!m) return null;
  const postalCode = m[1]!;
  const placeName = m[2]!.replace(/\s+/g, " ").trim().replace(/,+$/, "");
  if (!placeName || GENERIC_PLACE.test(placeName)) return null;
  return {
    postalCode,
    placeName,
    cityFromPostcode: BE_POSTCODE_CITY[postalCode] ?? null,
  };
}

export function aliasCityFromPlace(place: string): string | null {
  const t = place.trim();
  if (!t || GENERIC_PLACE.test(t)) return null;
  for (const { pattern, city } of PLACE_ALIASES) {
    if (pattern.test(t)) return city;
  }
  // Fall back to geo catalogue label when the place itself is a known city.
  return inferKnownCityLabel(t);
}

function citiesAgree(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return true;
  // Alias pairs already resolved to same canonical city before compare.
  return false;
}

/**
 * Resolve a Sportieve edition city from title + same-event body.
 * Requires agreement when both postcode and place name are present.
 */
export function resolveSportieveLocation(
  title: string,
  body: string,
): SportieveLocationEvidence {
  const hay = `${title}\n${body}`.replace(/\u00a0/g, " ");
  const evidence: string[] = [];
  const post = extractBePostcodePlace(hay);
  const suffix = placeFromTitleSuffix(title);
  const namedFromHay = aliasCityFromPlace(hay);
  const namedFromSuffix = suffix ? aliasCityFromPlace(suffix) : null;

  let cityFromPost: string | null = null;
  if (post?.cityFromPostcode) {
    const placeAlias = aliasCityFromPlace(post.placeName);
    if (!placeAlias || citiesAgree(placeAlias, post.cityFromPostcode)) {
      cityFromPost = post.cityFromPostcode;
      evidence.push(`postcode ${post.postalCode}→${post.cityFromPostcode}`);
      if (placeAlias) evidence.push(`plaats “${post.placeName}”`);
    } else {
      return {
        city: null,
        postalCode: post.postalCode,
        placeName: post.placeName,
        evidence: [],
        confirmed: false,
        weakReason: `Conflict postcode ${post.postalCode} (${post.cityFromPostcode}) vs plaats “${post.placeName}” (${placeAlias})`,
      };
    }
  }

  const named = namedFromSuffix ?? namedFromHay;
  if (namedFromSuffix) evidence.push(`titel-suffix “${suffix}”→${namedFromSuffix}`);
  else if (namedFromHay && !cityFromPost) {
    evidence.push(`plaatsnaam in tekst→${namedFromHay}`);
  }

  if (cityFromPost && named && !citiesAgree(cityFromPost, named)) {
    return {
      city: null,
      postalCode: post?.postalCode ?? null,
      placeName: post?.placeName ?? suffix,
      evidence: [],
      confirmed: false,
      weakReason: `Conflict postcode-stad (${cityFromPost}) vs plaats (${named})`,
    };
  }

  const city = cityFromPost ?? named;
  if (!city || GENERIC_PLACE.test(city)) {
    return {
      city: null,
      postalCode: post?.postalCode ?? null,
      placeName: post?.placeName ?? suffix,
      evidence,
      confirmed: false,
      weakReason: "Geen specifieke plaats (alleen regio/België of onbekend)",
    };
  }

  if (coordsForCity(city) == null) {
    return {
      city,
      postalCode: post?.postalCode ?? null,
      placeName: post?.placeName ?? suffix,
      evidence,
      confirmed: false,
      weakReason: `Plaats “${city}” heeft nog geen geo-coördinaten`,
    };
  }

  // Require at least one concrete signal beyond a lone country word.
  if (evidence.length === 0) evidence.push(`bevestigde plaats ${city}`);

  return {
    city,
    postalCode: post?.postalCode ?? null,
    placeName: post?.placeName ?? suffix,
    evidence,
    confirmed: true,
    weakReason: null,
  };
}

/** Match a listing title to a /events/... detail URL from the calendar HTML. */
export function matchSportieveEventUrl(
  title: string,
  html: string,
): string | null {
  const urls = [
    ...html.matchAll(
      /https?:\/\/(?:www\.)?sportievesingles\.be\/events\/([a-z0-9-]+)/gi,
    ),
  ].map((m) => ({
    url: `https://www.sportievesingles.be/events/${m[1]!.toLowerCase()}`,
    slug: m[1]!.toLowerCase(),
  }));
  if (urls.length === 0) return null;

  const titleSlug = slugify(cleanTitleForSlug(title));
  const titleTokens = new Set(
    titleSlug.split("-").filter((t) => t.length >= 4),
  );
  let best: { url: string; score: number } | null = null;
  for (const u of urls) {
    const slugTokens = u.slug.split("-").filter((t) => t.length >= 4);
    let overlap = 0;
    for (const t of slugTokens) if (titleTokens.has(t)) overlap += 1;
    const score =
      overlap / Math.max(1, Math.min(titleTokens.size, slugTokens.length));
    if (titleSlug && u.slug.includes(titleSlug.slice(0, 24))) {
      return u.url;
    }
    if (!best || score > best.score) best = { url: u.url, score };
  }
  return best && best.score >= 0.45 ? best.url : null;
}

function cleanTitleForSlug(title: string): string {
  return title
    .replace(/\u00a0/g, " ")
    .replace(/\s*\/\s*[^/]+$/u, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .trim();
}
