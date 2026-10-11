/**
 * Deterministic Event facts from schema.org JSON-LD in HTML.
 * Runs before / alongside AI extract so aggregators (allevents, etc.) keep
 * city, venue, time, and price even when plain text is sparse.
 */

export type StructuredEventFacts = {
  title: string | null;
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
  city: string | null;
  venue: string | null;
  locationText: string | null;
  priceNotes: string | null;
  organizer: string | null;
  sourceUrl: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t.toLowerCase()];
  if (Array.isArray(t)) {
    return t.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  }
  return [];
}

function isEventNode(node: Record<string, unknown>): boolean {
  return typesOf(node).some((t) => t === "event" || t.endsWith("/event"));
}

function collectNodes(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out);
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  out.push(rec);
  if ("@graph" in rec) collectNodes(rec["@graph"], out);
  if ("mainEntity" in rec) collectNodes(rec.mainEntity, out);
}

function parseDateTime(value: string | null): {
  date: string | null;
  time: string | null;
} {
  if (!value) return { date: null, time: null };
  const iso = value.trim();
  const dateMatch = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch?.[1] ?? null;
  const timeMatch = iso.match(/T(\d{2}):(\d{2})/);
  const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null;
  return { date, time };
}

function locationParts(loc: unknown): {
  venue: string | null;
  city: string | null;
  locationText: string | null;
} {
  if (typeof loc === "string") {
    return { venue: null, city: null, locationText: loc.trim() || null };
  }
  const rec = asRecord(loc);
  if (!rec) return { venue: null, city: null, locationText: null };
  const venue = asString(rec.name);
  const address = asRecord(rec.address) ?? rec;
  const city =
    asString(address.addressLocality) ||
    asString(address.addressRegion) ||
    asString(rec.addressLocality);
  const street = asString(address.streetAddress);
  const locationText = [venue, street, city].filter(Boolean).join(", ") || null;
  return { venue, city, locationText };
}

function offerPrice(offers: unknown): string | null {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const price = rec.price;
    const currency = asString(rec.priceCurrency) ?? "EUR";
    if (typeof price === "number" && Number.isFinite(price)) {
      return `${currency === "EUR" ? "€" : `${currency} `}${price}`;
    }
    if (typeof price === "string" && price.trim()) {
      const p = price.trim();
      if (/^€/.test(p) || /eur/i.test(p)) return p;
      return currency === "EUR" ? `€${p}` : `${currency} ${p}`;
    }
    const low = rec.lowPrice ?? rec.highPrice;
    if (typeof low === "number" && Number.isFinite(low)) {
      return `${currency === "EUR" ? "€" : `${currency} `}${low}`;
    }
  }
  return null;
}

function organizerName(org: unknown): string | null {
  if (typeof org === "string") return org.trim() || null;
  const rec = asRecord(org);
  return rec ? asString(rec.name) : null;
}

function factsFromEvent(node: Record<string, unknown>): StructuredEventFacts {
  const start = parseDateTime(asString(node.startDate));
  const end = parseDateTime(asString(node.endDate));
  const loc = locationParts(node.location);
  return {
    title: asString(node.name),
    startDate: start.date,
    startTime: start.time,
    endTime: end.time,
    city: loc.city,
    venue: loc.venue,
    locationText: loc.locationText,
    priceNotes: offerPrice(node.offers),
    organizer: organizerName(node.organizer) || organizerName(node.performer),
    sourceUrl: asString(node.url),
  };
}

function scoreFacts(facts: StructuredEventFacts): number {
  return [
    facts.title,
    facts.startDate,
    facts.city,
    facts.venue,
    facts.priceNotes,
    facts.organizer,
  ].filter(Boolean).length;
}

/**
 * Extract the best Event node from JSON-LD script blocks in HTML.
 */
export function extractJsonLdEventFacts(html: string): StructuredEventFacts | null {
  if (!html || !/<script/i.test(html)) return null;
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  let best: StructuredEventFacts | null = null;
  let bestScore = 0;

  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes: Record<string, unknown>[] = [];
    collectNodes(parsed, nodes);
    for (const node of nodes) {
      if (!isEventNode(node)) continue;
      const facts = factsFromEvent(node);
      const score = scoreFacts(facts);
      if (score > bestScore) {
        best = facts;
        bestScore = score;
      }
    }
  }

  return bestScore > 0 ? best : null;
}
