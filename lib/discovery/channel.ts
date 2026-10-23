/**
 * Channel ranking for discovery hits (organizer-first playbook rule).
 * Instagram/Facebook = signal only; never primary catalog source.
 */

import type { DiscoveryChannel } from "@/data/discovery/query-matrix";

const TICKET_HOST_RE =
  /eventbrite|hipsy|partyfinder|eventgoose|ikwileenticket|billetweb|billetto|ticketmaster|atleta\.cc/i;

const AGGREGATOR_HOST_RE =
  /meetup\.com|alleevents|uitinvlaanderen|stayhappening|facebook\.com\/events|eventful/i;

const SOCIAL_HOST_RE =
  /instagram\.com|facebook\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com/i;

const LINK_IN_BIO_RE = /linktr\.ee|linktree|beacons\.ai|bio\.site|carrd\.co/i;

export function classifyDiscoveryChannel(url: string): DiscoveryChannel {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "aggregator";
  }
  if (SOCIAL_HOST_RE.test(host)) return "social_signal";
  if (LINK_IN_BIO_RE.test(host)) return "link_in_bio";
  if (TICKET_HOST_RE.test(host)) return "ticket_platform";
  if (AGGREGATOR_HOST_RE.test(host)) return "aggregator";
  return "organizer";
}

/** Prefer organizer > ticket > link-in-bio; social/aggregator last. */
export function discoveryChannelRank(channel: DiscoveryChannel): number {
  switch (channel) {
    case "organizer":
      return 1;
    case "ticket_platform":
      return 2;
    case "link_in_bio":
      return 3;
    case "newsletter":
      return 4;
    case "social_signal":
      return 5;
    case "aggregator":
      return 6;
    default:
      return 9;
  }
}

/** Social is signal-only — never insert as catalog primary. */
export function isSignalOnlyChannel(channel: DiscoveryChannel): boolean {
  return channel === "social_signal";
}
