import { brusselsToday } from "@/lib/dates";
import { isEventListable } from "@/lib/events";
import type { Event, EventMeetActivation, SocialSuitability } from "@/types/event";
import type {
  EligibilityConstraints,
  HardScreenResult,
  NormalizedCandidate,
  OccurrenceAssessment,
  PilotWindow,
  ScreeningCategory,
  ScreeningDecision,
  ScreeningResult,
  ScreeningStatusReason,
} from "@/types/screening";

/**
 * Deterministic screener (no AI in this pilot).
 *
 * Separates concept suitability (A), concrete occurrence (B) and personal
 * eligibility (C). Reuses the production listing gate (lib/events.isEventListable)
 * as a cross-check. Never invents facts; unknown stays unknown.
 */

/** Default pilot window: 7-14 days from 2026-09-25 (this test only). */
export const DEFAULT_PILOT_WINDOW: PilotWindow = {
  start: "2026-09-25",
  end: "2026-10-09",
};

export function hardScreen(
  candidate: NormalizedCandidate,
  duplicateOf: string | null,
  now = new Date(),
): HardScreenResult {
  const today = brusselsToday(now);
  const datePast = candidate.startDate != null && candidate.startDate < today;
  const regionInScope = candidate.region === "in_scope";
  const sourceIdentifiable =
    candidate.provenance.sourceName.trim().length > 0 &&
    /^https?:\/\//.test(candidate.provenance.sourceUrl.trim());

  const missing: string[] = [];
  if (candidate.region === "unknown") missing.push("regio/locatie onbekend");

  let hardReject = false;
  let hardRejectReason: string | null = null;
  if (datePast) {
    hardReject = true;
    hardRejectReason = "activiteit ligt in het verleden";
  } else if (candidate.region === "out_of_scope") {
    hardReject = true;
    hardRejectReason = `buiten pilotregio (${candidate.city ?? "onbekend"})`;
  } else if (!sourceIdentifiable) {
    hardReject = true;
    hardRejectReason = "bron niet identificeerbaar";
  } else if (duplicateOf) {
    hardReject = true;
    hardRejectReason = `duplicaat van ${duplicateOf}`;
  }

  return {
    datePast,
    regionInScope,
    sourceIdentifiable,
    duplicateOf,
    missing,
    hardReject,
    hardRejectReason,
  };
}

type RejectKind = "passive" | "private" | "insufficient";

type ContentVerdict = {
  category: ScreeningCategory;
  suitability: SocialSuitability;
  usedFacts: string[];
  blockingUnknowns: string[];
  rejectKind: RejectKind | null;
};

/**
 * A. Concept suitability for OfflineRadar.
 *
 * OfflineRadar is for singles meeting other singles offline — not a general
 * social calendar. Concept admission requires Route A or Route B:
 * - Route A: source shows a concrete singles-/dating-oriented activity
 * - Route B: confirmed singles-oriented OfflineRadar Meet on a place/activity
 *
 * Category `social` may describe a generally social format, but without Route A/B
 * it never makes the concept eligible (`rejectKind` set).
 * Singles-oriented ≠ singles-only (whole venue need not be singles-only).
 * "Singles friendly" marketing and payment never create admission.
 */
export function classifyContent(candidate: NormalizedCandidate): ContentVerdict {
  const s = candidate.signals;
  const usedFacts: string[] = [];
  const blockingUnknowns: string[] = [];

  // Route B: confirmed singles-oriented Meet (signal means real Meet, not a badge).
  if (s.confirmedMeetActivation === true) {
    usedFacts.push(
      "Route B: bevestigde singlesgerichte OfflineRadar Meet-opzet",
    );
    return {
      category: "meet_new_people",
      suitability: "high",
      usedFacts,
      blockingUnknowns,
      rejectKind: null,
    };
  }

  // Route A: explicit singles / dating activity from the source.
  if (s.explicitSinglesOrDating === true) {
    usedFacts.push(
      "Route A: bron richt zich expliciet op singles die andere singles ontmoeten",
    );
    return {
      category: "dating",
      suitability: "high",
      usedFacts,
      blockingUnknowns,
      rejectKind: null,
    };
  }

  if (s.passivePublicActivity === true) {
    usedFacts.push("passieve publieksactiviteit zonder singlesgerichte formule");
    return {
      category: "reject",
      suitability: "low",
      usedFacts,
      blockingUnknowns,
      rejectKind: "passive",
    };
  }

  if (s.membersOrPrivateOnly === true) {
    usedFacts.push("besloten / op uitnodiging");
    return {
      category: "reject",
      suitability: "low",
      usedFacts,
      blockingUnknowns,
      rejectKind: "private",
    };
  }

  // General "meet new people" / friendship social — descriptive only, not Route A/B.
  if (s.explicitMeetNewPeople === true) {
    usedFacts.push(
      "algemene kennismaking/vriendschap; geen aantoonbare singlesgerichte formule (geen Route A/B)",
    );
    if (s.individualParticipationNormal == null) {
      blockingUnknowns.push("solo deelnemen onduidelijk");
    }
    if (s.openToNewcomers == null) {
      blockingUnknowns.push("open voor nieuwe deelnemers onduidelijk");
    }
    return {
      category: "social",
      suitability: "low",
      usedFacts,
      blockingUnknowns,
      rejectKind: "insufficient",
    };
  }

  const solo = s.individualParticipationNormal;
  const open = s.openToNewcomers;
  const interaction = s.interactionOpportunity;
  const grouped = s.guidedOrGroupFormat;

  if (solo === false || interaction === false) {
    usedFacts.push("solo deelnemen of interactie met onbekenden niet realistisch");
    return {
      category: "reject",
      suitability: "low",
      usedFacts,
      blockingUnknowns,
      rejectKind: "insufficient",
    };
  }

  if (solo === true && open === true && interaction === true) {
    usedFacts.push(
      "gewone sociale activiteit (solo/open/interactie); onvoldoende zonder singles Route A/B",
    );
    if (grouped === true) usedFacts.push("groepsvorm aanwezig maar geen singlesformule");
    return {
      category: "social",
      suitability: "low",
      usedFacts,
      blockingUnknowns,
      rejectKind: "insufficient",
    };
  }

  if (solo == null) blockingUnknowns.push("solo deelnemen onduidelijk");
  if (open == null) blockingUnknowns.push("open voor nieuwe deelnemers onduidelijk");
  if (interaction == null) blockingUnknowns.push("reële interactie onduidelijk");

  if (solo === true || open === true || interaction === true) {
    usedFacts.push(
      "gedeeltelijke sociale signalen; geen aantoonbare singlesgerichte Route A/B",
    );
    return {
      category: "social",
      suitability: "low",
      usedFacts,
      blockingUnknowns,
      rejectKind: "insufficient",
    };
  }

  usedFacts.push("geen Route A (singlesgericht) en geen Route B (bevestigde Meet)");
  return {
    category: "reject",
    suitability: "low",
    usedFacts,
    blockingUnknowns,
    rejectKind: "insufficient",
  };
}

/** B. Concrete occurrence: only a confirmed schedule/edition counts. */
export function assessOccurrence(
  candidate: NormalizedCandidate,
  window: PilotWindow,
): OccurrenceAssessment {
  const status = candidate.occurrenceStatus;
  const recurring = candidate.signals.recurring === true;
  const date = candidate.startDate;

  let confirmed = false;
  let dateDerived = false;
  let withinPilotWindow = false;

  if (status === "announced_edition" && date) {
    confirmed = true;
    withinPilotWindow = date >= window.start && date <= window.end;
  } else if (status === "derived_from_schedule") {
    // A current, confirmed fixed schedule; the concrete next date is derived.
    confirmed = true;
    dateDerived = true;
    // A weekly/monthly active schedule has an occurrence within the window.
    withinPilotWindow = date ? date >= window.start && date <= window.end : true;
  }
  // historical_only / community_no_next / unverifiable -> not confirmed.

  return { status, confirmed, date, recurring, dateDerived, withinPilotWindow };
}

function eligibilityConstraints(
  candidate: NormalizedCandidate,
): EligibilityConstraints {
  return {
    ageMin: candidate.ageMin,
    ageMax: candidate.ageMax,
    ageRule: candidate.ageRule,
    restrictedAudience: candidate.restrictedAudience,
    openToNewParticipants: candidate.signals.openToNewcomers,
  };
}

function activeMeetStub(): EventMeetActivation {
  return {
    id: "screening-meet-crosscheck",
    organizerId: null,
    status: "active",
    hostProvided: true,
    meetZoneProvided: true,
    meetMoment: null,
    soloWelcome: true,
    recognitionProvided: false,
    recognitionMethod: null,
    recognitionDescription: null,
    interactionMethod: null,
    interactionDescription: null,
    responsiblePersonName: null,
    responsiblePersonRole: null,
    commitmentAcceptedAt: null,
    termsVersion: null,
    verificationStatus: "none",
  };
}

function listingGateProjection(
  suitability: SocialSuitability,
  confirmedMeet: boolean,
): boolean {
  const projection = {
    listingPath: confirmedMeet ? "meet_activation" : "organic",
    meetActivation: confirmedMeet ? activeMeetStub() : null,
    socialSuitability: suitability,
  } as unknown as Event;
  return isEventListable(projection);
}

const REASON_LABEL: Record<ScreeningStatusReason, string> = {
  publication_ready: "voorcontrole geslaagd",
  concept_unsuitable: "inhoudelijk ongeschikt",
  insufficiently_confirmed: "onvoldoende bevestigd",
  outside_window: "buiten zoekvenster",
  restricted_audience: "beperkte doelgroep",
  expired: "verlopen",
  out_of_region: "buiten pilotregio",
  duplicate: "duplicaat",
  needs_review: "aanvullende review nodig",
};

export function screenCandidate(
  candidate: NormalizedCandidate,
  duplicateOf: string | null,
  window: PilotWindow = DEFAULT_PILOT_WINDOW,
  now = new Date(),
): ScreeningResult {
  const hard = hardScreen(candidate, duplicateOf, now);
  const content = classifyContent(candidate);
  const occurrence = assessOccurrence(candidate, window);
  const eligibility = eligibilityConstraints(candidate);
  // Concept admission: Route A (dating) or Route B (confirmed Meet → meet_new_people).
  // Category `social` alone is never concept-suitable.
  const conceptSuitable =
    content.rejectKind === null &&
    (content.category === "dating" || content.category === "meet_new_people");
  const confirmedMeet = candidate.signals.confirmedMeetActivation === true;

  let decision: ScreeningDecision;
  let statusReason: ScreeningStatusReason;

  if (hard.hardReject) {
    decision = "REJECT";
    if (hard.datePast) statusReason = "expired";
    else if (candidate.region === "out_of_scope") statusReason = "out_of_region";
    else if (hard.duplicateOf) statusReason = "duplicate";
    else statusReason = "concept_unsuitable";
  } else if (!conceptSuitable) {
    decision = "REJECT";
    statusReason =
      content.rejectKind === "private" ? "restricted_audience" : "concept_unsuitable";
  } else if (!occurrence.confirmed) {
    decision = "REVIEW";
    statusReason = "insufficiently_confirmed";
  } else if (!occurrence.withinPilotWindow) {
    decision = "REVIEW";
    statusReason = "outside_window";
  } else if (eligibility.restrictedAudience) {
    decision = "REVIEW";
    statusReason = "restricted_audience";
  } else if (
    content.blockingUnknowns.length > 0 ||
    hard.missing.length > 0 ||
    eligibility.openToNewParticipants !== true
  ) {
    decision = "REVIEW";
    statusReason = "needs_review";
  } else {
    decision = "ACCEPT";
    statusReason = "publication_ready";
  }

  const publicationReady = decision === "ACCEPT";

  const uncertainties = [...candidate.uncertainties, ...content.blockingUnknowns];
  if (occurrence.dateDerived) {
    uncertainties.push(
      "concrete datum afgeleid uit vast schema (niet expliciet aangekondigd); controleer annuleringen/uitzonderingen vóór publicatie",
    );
  }
  if (statusReason === "insufficiently_confirmed") {
    const detail =
      occurrence.status === "historical_only"
        ? "enkel historische editie"
        : occurrence.status === "community_no_next"
          ? "community zonder aangekondigd volgend event"
          : "bron niet verifieerbaar";
    uncertainties.push(`geen bevestigd toekomstig moment (${detail})`);
  }

  // Build reason string with the precise status kind.
  const gaps = [...hard.missing, ...content.blockingUnknowns];
  let reason = `${decision} (${REASON_LABEL[statusReason]})`;
  if (decision === "REJECT") {
    reason += ` — ${hard.hardReject ? hard.hardRejectReason : content.usedFacts.join("; ")}.`;
  } else if (statusReason === "outside_window") {
    reason += ` — concept geschikt, editie op ${occurrence.date ?? "?"} valt buiten ${window.start}..${window.end}.`;
  } else if (statusReason === "insufficiently_confirmed") {
    reason += ` — ${content.usedFacts.join("; ")}; geen bevestigd toekomstig moment.`;
  } else if (statusReason === "restricted_audience") {
    reason += ` — ${content.usedFacts.join("; ")}; beperkte doelgroep: ${eligibility.restrictedAudience}.`;
  } else if (statusReason === "needs_review") {
    reason += ` — ${content.usedFacts.join("; ")}; ontbreekt: ${gaps.join(", ") || "toegang tot nieuwe deelnemers onbevestigd"}.`;
  } else {
    reason += ` — ${content.usedFacts.join("; ")}.`;
  }

  // Listing-gate cross-check only applies to content-based publish/reject.
  let listingGateAgrees: boolean;
  if (hard.hardReject || decision === "REVIEW") {
    listingGateAgrees = true;
  } else {
    const listable = listingGateProjection(content.suitability, confirmedMeet);
    listingGateAgrees = listable === publicationReady;
  }

  return {
    candidateId: candidate.id,
    conceptSuitable,
    category: content.category,
    socialSuitability: content.suitability,
    occurrence,
    eligibility,
    decision,
    statusReason,
    publicationReady,
    reason,
    usedFacts: content.usedFacts,
    uncertainties,
    needsManualReview: decision === "REVIEW",
    hard,
    listingGateAgrees,
  };
}
