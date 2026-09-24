/**
 * Future business / Meet domain types.
 *
 * These exist so OfflineRadar can later grow Organizer ownership, Meet
 * commitments, trust and promotions without rebuilding Event.
 *
 * Hard product rules (also in docs/domain-model.md):
 * - OfflineRadar is not a general event calendar.
 * - PAYMENT DOES NOT CREATE ELIGIBILITY.
 * - singlesOnly ≠ singlesFriendly ≠ OfflineRadar Meet.
 * - Organic ranking stays separate from paid promotion.
 */

/** Why an event is allowed on OfflineRadar (content, never payment). */
export type ListingPath = "organic" | "meet_activation";

export type MeetActivationStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "rejected"
  | "suspended"
  | "completed";

export type RecognitionMethod =
  | "wristband"
  | "badge"
  | "sticker"
  | "color_code"
  | "card"
  | "digital"
  | "other";

export type InteractionMethod =
  | "mixer"
  | "conversation_starters"
  | "short_intro"
  | "welcome_moment"
  | "icebreaker"
  | "other";

/**
 * Concrete Meet commitment for one event.
 * Lives beside Event, not as dozens of booleans on Event.
 */
export type EventMeetActivation = {
  id: string;
  /** Set when organizers are real entities; null in mock MVP. */
  organizerId: string | null;
  status: MeetActivationStatus;
  hostProvided: boolean;
  meetZoneProvided: boolean;
  /** Free-text description of when/where the Meet moment happens. */
  meetMoment: string | null;
  soloWelcome: boolean;
  /** Opt-in recognition exists; never means everyone must be labelled. */
  recognitionProvided: boolean;
  recognitionMethod: RecognitionMethod | null;
  recognitionDescription: string | null;
  interactionMethod: InteractionMethod | null;
  interactionDescription: string | null;
  responsiblePersonName: string | null;
  responsiblePersonRole: string | null;
  commitmentAcceptedAt: string | null;
  termsVersion: string | null;
  /** Later: post-event fulfilment checks. */
  verificationStatus: "none" | "pending" | "passed" | "failed";
};

/** Future claimed organization (stub only). */
export type OrganizerRef = {
  id: string;
  name: string;
};

/** Future claimed venue (stub only). */
export type VenueRef = {
  id: string;
  name: string;
};

/**
 * Future organizer-level trust. Sanctions apply to future access,
 * not to deleting past events after they happened.
 */
export type OrganizerTrustStatus =
  | "trusted"
  | "normal"
  | "manual_review_required"
  | "warning"
  | "meet_activation_suspended"
  | "promotion_suspended"
  | "business_account_suspended";

/**
 * Paid placement stays outside organic relevance.
 * Never used to invent eligibility or social suitability.
 */
export type PromotionPlacement = {
  id: string;
  eventId: string;
  organizerId: string | null;
  /** Soft boost points; applied only after organic eligibility passes. */
  boostScore: number;
  label: "sponsored" | "boosted";
  startsAt: string;
  endsAt: string;
};

export function isActiveMeetActivation(
  meet: EventMeetActivation | null | undefined,
): boolean {
  return meet?.status === "active";
}

/** Stable id helper for mock organizers / venues from a display name. */
export function slugId(prefix: string, name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${slug || "unknown"}`;
}
