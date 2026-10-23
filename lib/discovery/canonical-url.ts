/**
 * Organizer-first catalog URLs: prefer site origin over event deep links
 * so https://org.be/event-123 and https://org.be/kalender collapse to one source.
 */

import { normalizeCatalogSourceUrl } from "@/lib/events/catalog-sources";
import type { DiscoveryChannel } from "@/data/discovery/query-matrix";

/** True when path looks like a single event/edition page, not a site home/agenda hub. */
export function looksLikeEventDeepPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/";
  if (p === "/") return false;
  // Common edition/detail patterns
  if (/\/event[-_/]/i.test(p)) return true;
  if (/\/events?\/[^/]+/i.test(p)) return true;
  if (/\/(activiteit|activiteiten|wandeling|diner|dinner|party|soir[eé]e)[-_/]/i.test(
    p,
  )) {
    return true;
  }
  // Long slug pages under a singles site
  if (p.split("/").filter(Boolean).length >= 2 && p.length > 40) return true;
  return false;
}

/**
 * Catalog official URL for a discovery hit.
 * - organizer: site origin (dedupe deep links)
 * - ticket / other: keep normalized full URL
 */
export function catalogUrlForDiscoveryChannel(
  url: string,
  channel: DiscoveryChannel,
): string {
  if (channel !== "organizer") {
    return normalizeCatalogSourceUrl(url);
  }
  try {
    const u = new URL(url);
    return normalizeCatalogSourceUrl(`${u.protocol}//${u.hostname}`);
  } catch {
    return normalizeCatalogSourceUrl(url);
  }
}

/** Hostname key for in-sweep organizer dedupe. */
export function discoveryDedupeKey(url: string, channel: DiscoveryChannel): string {
  try {
    const u = new URL(url);
    if (channel === "organizer") {
      return `host:${u.hostname.replace(/^www\./, "").toLowerCase()}`;
    }
    return `url:${normalizeCatalogSourceUrl(url)}`;
  } catch {
    return `url:${url.toLowerCase()}`;
  }
}
