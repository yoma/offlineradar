/**
 * Deterministic Route A/B + anti-pattern signals for organizer discovery.
 * AI may refine; heuristics never auto-publish.
 */

export type OrganizerRoute = "A" | "B" | null;

export type DiscoveryHeuristicVerdict = {
  accept: boolean;
  route: OrganizerRoute;
  reason: string;
  singlesScore: number;
  antiPattern: string | null;
};

const ROUTE_A_RE =
  /\b(singles?|alléénstaanden|alleenstaanden|vrijgezellen|célibataires?|celibataires?|dating\s?(night|event|dinner|party)?|speed\s?dat(e|ing)|conscious\s?dating|flirt(?:en|party)?)\b/i;

const BELGIUM_RE =
  /\b(belgi(?:ë|e|um)|vlaanderen|wallonie|wallonië|brussel|brussels|antwerpen|antwerp|gent|ghent|leuven|mechelen|brugge|li[eè]ge|namur|charleroi|mons|hasselt|kortrijk)\b/i;

const ANTI_PATTERNS: { id: string; re: RegExp }[] = [
  {
    id: "dating_app_only",
    re: /\b(tinder|bumble|happn|badoo|farm\s?date|agrimatching)\b.*\b(app|download|play store|app store)\b/i,
  },
  {
    id: "corporate_teambuilding",
    re: /\b(team[- ]?building|corporate\s+padel|bedrijfsuitje|incentive\s+travel)\b/i,
  },
  {
    id: "friendship_expat_only",
    re: /\b(expat\s+meetup|friendship\s+only|alleen\s+vriendschap|friends?\s+only)\b/i,
  },
  {
    id: "nightlife_aggregator",
    re: /\b(nightlife\s+guide|uitgaan\s+agenda)\b/i,
  },
];

/**
 * Score page text for singles Route A admission (organizer discovery).
 * Route B (Meet) is not auto-inferred from web pages in Phase 2A.
 */
export function evaluateDiscoveryHeuristics(input: {
  title: string;
  text: string;
  url: string;
}): DiscoveryHeuristicVerdict {
  const hay = `${input.title}\n${input.text}`.slice(0, 40_000);
  for (const ap of ANTI_PATTERNS) {
    if (ap.re.test(hay)) {
      return {
        accept: false,
        route: null,
        reason: `anti-pattern:${ap.id}`,
        singlesScore: 0,
        antiPattern: ap.id,
      };
    }
  }

  const routeA = ROUTE_A_RE.test(hay);
  const geo = BELGIUM_RE.test(hay) || BELGIUM_RE.test(input.url);
  let singlesScore = 0;
  if (routeA) singlesScore += 3;
  if (geo) singlesScore += 1;
  if (/\b(agenda|kalender|events?|edities|upcoming)\b/i.test(hay)) {
    singlesScore += 1;
  }

  if (!routeA) {
    return {
      accept: false,
      route: null,
      reason: "no_route_a_singles_signal",
      singlesScore,
      antiPattern: null,
    };
  }

  // Belgium/geo preferred; allow strong Route A without geo (national orgs).
  if (!geo && singlesScore < 4) {
    return {
      accept: false,
      route: null,
      reason: "weak_geo_for_route_a",
      singlesScore,
      antiPattern: null,
    };
  }

  return {
    accept: true,
    route: "A",
    reason: geo
      ? "Route A: expliciete singlesfocus + BE/regio-signaal"
      : "Route A: sterke singlesfocus (nationale organizer)",
    singlesScore,
    antiPattern: null,
  };
}

/** Strip tags for a cheap text sample (no DOM parser). */
export function htmlToTextSample(html: string, maxLen = 12_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function extractHtmlTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

export function guessOrganizerName(title: string, hostname: string): string {
  const cleaned = title
    .split(/\s*[|·•\-:]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)[0];
  if (cleaned && cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  const host = hostname.replace(/^www\./, "");
  const base = host.split(".")[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
