import type { CapacityStatus, EligibilityAgeRule } from "@/types/event";

export const SOURCE_REFRESH_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "blocked",
  "cooldown",
] as const;
export type SourceRefreshRunStatus = (typeof SOURCE_REFRESH_RUN_STATUSES)[number];

export const SOURCE_REFRESH_DETECTION_TYPES = [
  "new",
  "existing_unchanged",
  "existing_changed",
  "possibly_removed",
] as const;
export type SourceRefreshDetectionType =
  (typeof SOURCE_REFRESH_DETECTION_TYPES)[number];

export const SOURCE_REFRESH_ITEM_STATUSES = [
  "needs_review",
  "ignored",
  "accepted",
  "rejected",
  "applied",
] as const;
export type SourceRefreshItemStatus =
  (typeof SOURCE_REFRESH_ITEM_STATUSES)[number];

export const SOURCE_REFRESH_MATCH_CONFIDENCE = [
  "exact",
  "probable",
  "none",
] as const;
export type SourceRefreshMatchConfidence =
  (typeof SOURCE_REFRESH_MATCH_CONFIDENCE)[number];

export type RefreshParserKey =
  | "speeddaten"
  | "hoptodate"
  | "sportieve-singles"
  | "tomeeto"
  | "juntas";

/** Deterministic normalized candidate from a source-specific parser. */
export type RefreshNormalizedCandidate = {
  externalKey: string;
  title: string;
  organizer: string;
  date: string; // YYYY-MM-DD
  startsAt: string; // ISO with offset when known
  endsAt: string | null;
  venue: string | null;
  city: string;
  address: string | null;
  minAge: number | null;
  maxAge: number | null;
  ageRule: EligibilityAgeRule;
  price: number | null;
  availability: CapacityStatus | null;
  officialUrl: string;
  ticketUrl: string | null;
  rawEvidenceSummary: string;
  sourceCheckedAt: string;
};

export type RefreshFieldChange = {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
};

export const SOURCE_REFRESH_TRIGGER_TYPES = ["manual", "scheduled"] as const;
export type SourceRefreshTriggerType =
  (typeof SOURCE_REFRESH_TRIGGER_TYPES)[number];

export type SourceRefreshRunRecord = {
  id: string;
  catalogSourceId: string;
  status: SourceRefreshRunStatus;
  startedAt: string;
  completedAt: string | null;
  fetchedUrl: string | null;
  httpStatus: number | null;
  fetchState: string | null;
  parserKey: RefreshParserKey | string;
  parserVersion: string;
  candidateCount: number;
  newCount: number;
  unchangedCount: number;
  changedCount: number;
  removedCount: number;
  error: string | null;
  triggeredBy: string | null;
  /** manual (admin) | scheduled (cron) */
  triggerType: SourceRefreshTriggerType;
  createdAt: string;
};

export type SourceRefreshItemRecord = {
  id: string;
  refreshRunId: string;
  catalogSourceId: string;
  detectedExternalKey: string;
  normalizedUrl: string | null;
  detectedTitle: string | null;
  detectedStart: string | null;
  detectedLocation: string | null;
  detectedMinAge: number | null;
  detectedMaxAge: number | null;
  detectedAgeRule: string | null;
  detectedPrice: number | null;
  detectedAvailability: string | null;
  detectedSourceUrl: string | null;
  matchEventEditionId: string | null;
  detectionType: SourceRefreshDetectionType;
  matchConfidence: SourceRefreshMatchConfidence | null;
  changeSummary: RefreshFieldChange[] | null;
  proposedData: RefreshNormalizedCandidate | Record<string, unknown>;
  status: SourceRefreshItemStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type RefreshParserResult = {
  candidates: RefreshNormalizedCandidate[];
  warnings: string[];
  /**
   * Calendar completeness signal for possibly_removed safety.
   * - complete: listing is believed exhaustive for the observed window
   * - partial: incomplete / paginated / unknown window → never emit removals
   * - unknown: treat like partial (safe default)
   */
  listingCoverage?: "complete" | "partial" | "unknown";
};
