/**
 * Real Data Screening Pilot types (isolated).
 *
 * Pipeline: RawCandidate -> NormalizedCandidate -> Screening -> Decision.
 *
 * The screening explicitly separates three questions:
 *   A. Concept suitability   - does this kind of activity fit OfflineRadar?
 *   B. Concrete occurrence    - is there a confirmed, dated future moment?
 *   C. Personal eligibility   - constraints (age / group) for a specific user.
 *
 * Hard rules (see docs/screening-pilot.md and docs/domain-model.md):
 * - OfflineRadar is not a general event calendar.
 * - PAYMENT DOES NOT CREATE ELIGIBILITY.
 * - Unknown facts stay unknown; never invented (no favourable defaults).
 * - A recurring concept is not proof of a confirmed next occurrence.
 * - Being outside the pilot window is not the same as being unsuitable.
 * - Source facts are kept separate from OfflineRadar's interpretation.
 *
 * This module does not touch the production feed, mock data, or app routes.
 */

import type { EligibilityAgeRule, SocialSuitability } from "@/types/event";

/** Where a candidate came from. Kept separate from interpretation. */
export type SourceProvenance = {
  sourceName: string;
  sourceUrl: string;
  checkedAtIso: string;
};

/** How a concrete date was (or was not) established for a candidate. */
export type OccurrenceStatus =
  /** Source explicitly announces a dated next edition. */
  | "announced_edition"
  /** Date derived from a current, confirmed fixed schedule (e.g. weekly). */
  | "derived_from_schedule"
  /** Only a past instance is available; no confirmed future. */
  | "historical_only"
  /** General community page with no announced upcoming event. */
  | "community_no_next"
  /** Source could not be verified. */
  | "unverifiable";

/**
 * Boolean-or-unknown signals read literally from the source.
 * null = the source does not say. Never guessed.
 */
export type CandidateSignals = {
  explicitSinglesOrDating: boolean | null;
  explicitMeetNewPeople: boolean | null;
  individualParticipationNormal: boolean | null;
  openToNewcomers: boolean | null;
  interactionOpportunity: boolean | null;
  guidedOrGroupFormat: boolean | null;
  passivePublicActivity: boolean | null;
  membersOrPrivateOnly: boolean | null;
  confirmedMeetActivation: boolean | null;
  recurring: boolean | null;
};

/** Raw source facts. No interpretation, no invented values. */
export type RawCandidate = {
  id: string;
  provenance: SourceProvenance;
  statedTitle: string;
  /** Concrete date (YYYY-MM-DD) if the source gives one; null otherwise. */
  statedStartDate: string | null;
  statedStartTime: string | null;
  statedEndTime: string | null;
  statedCity: string | null;
  statedVenue: string | null;
  statedOrganizer: string | null;
  statedAgeMin: number | null;
  statedAgeMax: number | null;
  statedAgeRule: EligibilityAgeRule;
  statedPrice: number | null;
  priceKnown: boolean;
  factualSummary: string;
  signals: CandidateSignals;
  /**
   * How the next occurrence is established. When omitted, it is inferred:
   * a stated date -> announced_edition; else recurring -> derived_from_schedule;
   * else community_no_next.
   */
  occurrenceStatus?: OccurrenceStatus;
  /**
   * Non age/gender audience restriction that limits who can join at all
   * (e.g. "students only", "members of X"). null = no such restriction stated.
   */
  restrictedAudience?: string | null;
  /**
   * Neutral, source-derived factual description used as AI input. Must contain
   * only facts from the source (no OfflineRadar conclusions like "suitable" or
   * "social suitability high"). When absent, there is not enough neutral source
   * information to send to the AI layer.
   */
  sourceFactsNeutral?: string;
  uncertainties: string[];
};

export type RegionScope = "in_scope" | "out_of_scope" | "unknown";

/** Structured candidate with unknowns preserved. */
export type NormalizedCandidate = {
  id: string;
  provenance: SourceProvenance;
  title: string;
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
  city: string | null;
  region: RegionScope;
  venue: string | null;
  organizer: string | null;
  ageMin: number | null;
  ageMax: number | null;
  ageRule: EligibilityAgeRule;
  price: number | null;
  priceKnown: boolean;
  signals: CandidateSignals;
  occurrenceStatus: OccurrenceStatus;
  restrictedAudience: string | null;
  uncertainties: string[];
};

export type ScreeningCategory =
  | "dating"
  | "meet_new_people"
  | "social"
  | "reject";

export type ScreeningDecision = "ACCEPT" | "REVIEW" | "REJECT";

/**
 * Precise reason, kept distinct so different problems are never merged into
 * one vague status.
 */
export type ScreeningStatusReason =
  | "publication_ready"
  | "concept_unsuitable"
  | "insufficiently_confirmed"
  | "outside_window"
  | "restricted_audience"
  | "expired"
  | "out_of_region"
  | "duplicate"
  | "needs_review";

/** Selection window for this pilot (a test criterion, not a platform rule). */
export type PilotWindow = { start: string; end: string };

/** Result of the factual (hard) screening step. */
export type HardScreenResult = {
  datePast: boolean;
  regionInScope: boolean;
  sourceIdentifiable: boolean;
  duplicateOf: string | null;
  missing: string[];
  hardReject: boolean;
  hardRejectReason: string | null;
};

/** B. Concrete occurrence assessment. */
export type OccurrenceAssessment = {
  status: OccurrenceStatus;
  /** A confirmed, dated (or actively scheduled) future moment exists. */
  confirmed: boolean;
  date: string | null;
  recurring: boolean;
  /** Date was derived from a schedule rather than explicitly announced. */
  dateDerived: boolean;
  withinPilotWindow: boolean;
};

/** C. Personal eligibility constraints (evaluated per user later, not here). */
export type EligibilityConstraints = {
  ageMin: number | null;
  ageMax: number | null;
  ageRule: EligibilityAgeRule;
  /** Non age/gender restriction limiting who can join at all. */
  restrictedAudience: string | null;
  openToNewParticipants: boolean | null;
};

/** Full screening result for one candidate. */
export type ScreeningResult = {
  candidateId: string;
  // A. Concept
  conceptSuitable: boolean;
  category: ScreeningCategory;
  socialSuitability: SocialSuitability;
  // B. Occurrence
  occurrence: OccurrenceAssessment;
  // C. Eligibility (constraints only)
  eligibility: EligibilityConstraints;
  // Headline
  decision: ScreeningDecision;
  statusReason: ScreeningStatusReason;
  publicationReady: boolean;
  reason: string;
  usedFacts: string[];
  uncertainties: string[];
  needsManualReview: boolean;
  hard: HardScreenResult;
  /** Cross-check against the existing production listing gate (lib/events). */
  listingGateAgrees: boolean;
};

/**
 * Neutral facts sent to the AI content layer. Contains only source-derived
 * facts; never the rule-based decision, score, category, or golden labels.
 */
export type NeutralCandidateFacts = {
  id: string;
  title: string;
  dateText: string;
  location: string;
  organizer: string;
  ageConditions: string;
  price: string;
  sourceName: string;
  sourceUrl: string;
  /** Neutral, source-derived description (untrusted content, not instructions). */
  sourceFacts: string;
  uncertainties: string[];
};

/**
 * The AI content layer's verdict on ONE dimension only: how suitable the
 * activity FORMAT is for an individual newcomer to meet new people. It never
 * declares an event publication-ready and never overrides a hard control.
 */
export type AiConceptVerdict = {
  category: ScreeningCategory;
  socialSuitability: SocialSuitability;
  reason: string;
  usedFacts: string[];
  uncertainties: string[];
  needsManualReview: boolean;
  /** Model self-estimate only; NOT a proven accuracy figure. */
  confidence?: "low" | "medium" | "high";
};

/**
 * Claude output as captured from the Fase 2/2B console runs.
 *
 * These were NOT persisted from the API; only console output was available.
 * `capture` records completeness: `full` (unlikely), `truncated` (reason and/or
 * uncertainties were console-truncated), or `category_only` (only category +
 * suitability are known; reason/uncertainties/needsReview were not captured).
 * No new paid calls are made to reconstruct missing data.
 */
export type CapturedClaudeResult = {
  candidateId: string;
  category: ScreeningCategory;
  socialSuitability: SocialSuitability;
  needsManualReview: boolean | null;
  reason: string | null;
  uncertainties: string[] | null;
  capture: "full" | "truncated" | "category_only";
};

/**
 * Provisional expected outcome.
 *
 * IMPORTANT: the current labels were authored by the same AI as the screener,
 * so they are test fixtures, NOT an independent accuracy measurement. Every
 * label still needs independent human review (`needsHumanReview`).
 */
export type GoldenLabel = {
  candidateId: string;
  expectedDecision: ScreeningDecision;
  expectedCategory?: ScreeningCategory;
  note: string;
  labeledBy: string;
  /** True while these remain AI-authored fixtures, not independent labels. */
  provisional: boolean;
  needsHumanReview: boolean;
};
