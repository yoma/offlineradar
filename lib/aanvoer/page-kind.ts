/**
 * Detect whether an intake URL is one event page or a multi-event source/home.
 */

export type IntakePageKind =
  | "single_event"
  | "agenda_list"
  | "organizer_home"
  | "unknown";

export const INTAKE_PAGE_KIND_LABEL: Record<IntakePageKind, string> = {
  single_event: "Één eventpagina",
  agenda_list: "Agenda / lijst met meerdere events",
  organizer_home: "Organisator-homepage (meerdere events)",
  unknown: "Onbekend paginatype",
};

const DATE_SLUG_RE =
  /\d{1,2}-(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)-20\d{2}/i;

const EVENTISH_PATH_RE =
  /event|agenda|kalender|activiteit|singles|speeddate|date|rencontre|workshop|wandeling|bowling|party|aper[oô]|dinner|reis|weekend/i;

const LISTING_PATH_RE =
  /\/(agenda|kalender|calendar|events?|evenementen|activiteiten|aanbod)(\/|$)/i;

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function isHomepagePath(path: string): boolean {
  return path === "/" || path === "" || /^\/(index|home)\/?$/i.test(path);
}

function isLikelySingleEventPath(path: string): boolean {
  if (isHomepagePath(path) || LISTING_PATH_RE.test(path)) return false;
  // Dated WordPress-style event slugs
  if (DATE_SLUG_RE.test(path)) return true;
  // billetto / eventbrite style
  if (/\/e\/|\/events\/[^/]+|\/tickets?\//i.test(path)) return true;
  return false;
}

/**
 * Collect same-host event/listing candidate links from HTML.
 */
export function harvestIntakeEventLinks(
  html: string,
  baseUrl: string,
  limit = 24,
): string[] {
  if (!html) return [];
  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return [];
  }

  const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]!);
  const out: string[] = [];
  for (const href of hrefs) {
    try {
      const absolute = new URL(href, baseUrl);
      if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
        continue;
      }
      const host = absolute.hostname.replace(/^www\./, "").toLowerCase();
      if (host !== baseHost) continue;
      const path = absolute.pathname || "/";
      if (
        /login|cart|privacy|cookie|account|contact|over-ons|nieuwsbrief|wp-content|wp-json|feed|mailto:/i.test(
          `${path}${absolute.search}`,
        ) ||
        /\.(pdf|jpg|jpeg|png|svg|css|js|webp)(\?|$)/i.test(path)
      ) {
        continue;
      }
      const lower = `${path}${absolute.search}`.toLowerCase();
      const eventish =
        EVENTISH_PATH_RE.test(lower) ||
        DATE_SLUG_RE.test(lower) ||
        LISTING_PATH_RE.test(lower);
      if (!eventish) continue;
      // Prefer concrete dated event pages over category hubs for counting.
      absolute.hash = "";
      out.push(absolute.toString().replace(/\/$/, "") || absolute.toString());
    } catch {
      /* skip */
    }
  }
  return [...new Set(out)].slice(0, limit);
}

function countJsonLdEvents(html: string): number {
  if (!html || !/<script/i.test(html)) return 0;
  let count = 0;
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const stack: unknown[] = [parsed];
      while (stack.length) {
        const cur = stack.pop();
        if (Array.isArray(cur)) {
          stack.push(...cur);
          continue;
        }
        if (!cur || typeof cur !== "object") continue;
        const rec = cur as Record<string, unknown>;
        const t = rec["@type"];
        const types = Array.isArray(t)
          ? t.filter((x): x is string => typeof x === "string")
          : typeof t === "string"
            ? [t]
            : [];
        if (types.some((x) => x.toLowerCase() === "event")) count += 1;
        if ("@graph" in rec) stack.push(rec["@graph"]);
        if ("mainEntity" in rec) stack.push(rec.mainEntity);
      }
    } catch {
      /* skip */
    }
  }
  return count;
}

export function isAgendaLikeIntakePageKind(kind: IntakePageKind): boolean {
  return kind === "agenda_list" || kind === "organizer_home";
}

/**
 * Deterministic page-kind for admin intake URLs.
 */
export function detectIntakePageKind(input: {
  url: string | null | undefined;
  html?: string | null;
  pageText?: string | null;
}): {
  kind: IntakePageKind;
  eventLinkCount: number;
  sampleLinks: string[];
  preferredFetchUrl: string | null;
} {
  const url = (input.url ?? "").trim();
  if (!url) {
    return {
      kind: "unknown",
      eventLinkCount: 0,
      sampleLinks: [],
      preferredFetchUrl: null,
    };
  }

  const path = pathOf(url);
  const html = input.html ?? "";
  const links = harvestIntakeEventLinks(html, url);
  const datedLinks = links.filter((l) => DATE_SLUG_RE.test(pathOf(l)));
  const listingLinks = links.filter((l) => LISTING_PATH_RE.test(pathOf(l)));
  const jsonLdEvents = countJsonLdEvents(html);
  const text = (input.pageText ?? "").toLowerCase();

  const preferredFetchUrl =
    listingLinks.find((l) => /activiteiten|agenda|kalender|events/i.test(pathOf(l))) ??
    (LISTING_PATH_RE.test(path) ? url : null);

  if (isLikelySingleEventPath(path) && jsonLdEvents <= 1 && datedLinks.length <= 1) {
    return {
      kind: "single_event",
      eventLinkCount: datedLinks.length || links.length,
      sampleLinks: datedLinks.slice(0, 6),
      preferredFetchUrl: url,
    };
  }

  if (LISTING_PATH_RE.test(path) || datedLinks.length >= 3) {
    return {
      kind: "agenda_list",
      eventLinkCount: Math.max(datedLinks.length, links.length),
      sampleLinks: (datedLinks.length ? datedLinks : links).slice(0, 8),
      preferredFetchUrl: preferredFetchUrl || url,
    };
  }

  if (
    isHomepagePath(path) &&
    (datedLinks.length >= 2 ||
      links.length >= 4 ||
      /aankomende activiteiten|onze activiteiten|volgende activiteit|evenementen voor vrijgezellen/i.test(
        text,
      ))
  ) {
    return {
      kind: "organizer_home",
      eventLinkCount: Math.max(datedLinks.length, links.length),
      sampleLinks: (datedLinks.length ? datedLinks : links).slice(0, 8),
      preferredFetchUrl: preferredFetchUrl || url,
    };
  }

  if (jsonLdEvents >= 3) {
    return {
      kind: "agenda_list",
      eventLinkCount: jsonLdEvents,
      sampleLinks: links.slice(0, 8),
      preferredFetchUrl: preferredFetchUrl || url,
    };
  }

  if (isHomepagePath(path) && jsonLdEvents === 0 && links.length >= 2) {
    return {
      kind: "organizer_home",
      eventLinkCount: links.length,
      sampleLinks: links.slice(0, 8),
      preferredFetchUrl: preferredFetchUrl || url,
    };
  }

  return {
    kind: "unknown",
    eventLinkCount: datedLinks.length || links.length,
    sampleLinks: (datedLinks.length ? datedLinks : links).slice(0, 6),
    preferredFetchUrl: preferredFetchUrl,
  };
}
