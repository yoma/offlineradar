/**
 * Tip / meldportaal domain types.
 * Tips are visitor submissions of official activity URLs for human review.
 * Publication always requires an explicit admin decision (never automatic).
 */

export const TIP_STATUSES = [
  "received",
  "duplicate",
  "in_review",
  "needs_info",
  "rejected",
  "approved_for_publication",
  "published",
  "expired_or_cancelled",
] as const;

export type TipStatus = (typeof TIP_STATUSES)[number];

export const TIP_STATUS_LABEL: Record<TipStatus, string> = {
  received: "Nieuw ontvangen",
  duplicate: "Duplicaat",
  in_review: "In controle",
  needs_info: "Extra informatie nodig",
  rejected: "Afgewezen",
  approved_for_publication: "Goedgekeurd voor publicatie",
  published: "Gepubliceerd",
  expired_or_cancelled: "Verlopen of geannuleerd",
};

/** Visitor tip (submission). Email only when notifyRequested. */
export type TipSubmission = {
  id: string;
  originalUrl: string;
  /** Canonical form for duplicate matching. */
  normalizedUrl: string;
  note: string | null;
  receivedAt: string;
  notifyRequested: boolean;
  /** Present only when notifyRequested === true. */
  email: string | null;
  status: TipStatus;
  /** If this tip is a duplicate, points at the primary tip id. */
  duplicateOfTipId: string | null;
  /** Optional link to a curated event edition once known. */
  linkedEventId: string | null;
  /** Optional link to a recurring organizer / series watch entry. */
  linkedSourceId: string | null;
  /** Extra notes from later duplicate submissions (merged, not lost). */
  duplicateNotes: string[];
  /** Soft rate-limit metadata (not shown publicly). */
  submitterMeta: {
    userAgent: string | null;
  };
};

/**
 * Separate review record for a tip.
 * AI may prepare; only an authorized human decides publication.
 */
export type TipReview = {
  tipId: string;
  checkedAt: string | null;
  sourceUrlChecked: string | null;
  aiPrep: TipAiPrep | null;
  missingOrConflicts: string[];
  adminDecision: TipStatus | null;
  decisionReason: string | null;
  decidedAt: string | null;
  publishedAt: string | null;
  publishedEventPath: string | null;
  /** Idempotent mail tracking for optional status emails. */
  emailSentForStatuses: TipStatus[];
};

/**
 * Prepared AI screening payload for a tip.
 * Never auto-approves or publishes. Human decisions stay separate.
 * Reuse via sourceContentHash when the same unchanged source is tip'd again.
 */
export type TipRouteSuggestion =
  | "route_a_supported"
  | "route_b_supported"
  | "insufficient_evidence"
  | "not_eligible"
  | "needs_manual_review";

export type TipAiConfidence = "low" | "medium" | "high";

export type TipAiPrep = {
  preparedAt: string;
  modelHint: string | null;
  sourceContentHash: string | null;
  reusedFromTipId: string | null;
  /** Sources actually used for this prep (never invent). */
  sourceUrlsUsed: string[];
  proposedTitle: string | null;
  proposedOrganizer: string | null;
  proposedStartDate: string | null;
  proposedStartTime: string | null;
  proposedEndTime: string | null;
  proposedCity: string | null;
  proposedVenue: string | null;
  proposedPriceNotes: string | null;
  /** Legacy shorthand; prefer routeSuggestion. */
  singlesRoute: "A" | "B" | "insufficient" | "unknown" | null;
  routeSuggestion: TipRouteSuggestion | null;
  routeReason: string | null;
  confidence: TipAiConfidence | null;
  singlesEvidence: string | null;
  /** true only with explicit participation rule; else false/unknown. */
  singlesOnly: "true" | "false" | "unknown" | null;
  ageNotes: string | null;
  ageRule: "strict" | "guideline" | "unknown" | null;
  priceNotes: string | null;
  availabilityNotes: string | null;
  bookingUrl: string | null;
  gaps: string[];
  conflicts: string[];
  /** Never auto-approves listing. */
  suggestsListable: boolean | null;
  /** Suggest watchlist only; never auto-add. */
  suggestSourceWatch: boolean;
  suggestSourceWatchReason: string | null;
  rawNotes: string | null;
  scanError: string | null;
};

/** Recurring organizer / series watchlist (separate from concrete editions). */
export type SourceWatchEntry = {
  id: string;
  officialUrl: string;
  normalizedUrl: string;
  organizerOrSeriesName: string;
  whyInteresting: string;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  createdAt: string;
  tipIds: string[];
};

export type TipsStoreSnapshot = {
  version: 1;
  tips: TipSubmission[];
  reviews: TipReview[];
  sources: SourceWatchEntry[];
};

export type TipCreateInput = {
  url: string;
  note?: string | null;
  notifyRequested: boolean;
  email?: string | null;
  userAgent?: string | null;
};
