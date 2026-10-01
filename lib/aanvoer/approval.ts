import type { IntakeEditableDraft, IntakeProposal } from "@/lib/aanvoer/types";

export type IntakeApprovalGate = {
  /** Hard fail: cannot save at all. */
  blockers: string[];
  /** Soft: lands under Jouw aandacht nodig; do not publish yet. */
  reviewReasons: string[];
  canPublish: boolean;
};

function hasConcreteDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) && year >= 2020 && year < 2090;
}

/**
 * Decide whether intake may auto-publish or needs human attention.
 */
export function evaluateIntakeApproval(
  draft: IntakeEditableDraft,
  proposal: Pick<
    IntakeProposal,
    "needsSourceVerification" | "routeAdvice" | "aiFailed"
  > | null,
): IntakeApprovalGate {
  const blockers: string[] = [];
  const reviewReasons: string[] = [];

  if (!draft.title.trim()) {
    blockers.push("Geen eventtitel herkend.");
  }

  if (!hasConcreteDate(draft.startDate)) {
    reviewReasons.push("Datum kon niet worden bevestigd");
  }

  if (draft.routeAdvice === "not_suitable") {
    reviewReasons.push(
      draft.routeReason.trim() ||
        "We konden niet bevestigen dat dit singlesgericht is",
    );
  }

  if (
    draft.routeAdvice === "needs_review" ||
    (draft.singlesOnly === "unknown" &&
      draft.singlesOriented === "unknown" &&
      draft.routeAdvice !== "route_a" &&
      draft.routeAdvice !== "route_b")
  ) {
    reviewReasons.push(
      "We konden niet bevestigen dat dit singlesgericht is",
    );
  }

  const hasUrl = Boolean(
    draft.sourceUrl.trim() || draft.organizerUrl.trim(),
  );
  if (
    (proposal?.needsSourceVerification || !hasUrl) &&
    !hasUrl
  ) {
    reviewReasons.push("Bron ontbreekt");
  }

  if (proposal?.aiFailed) {
    reviewReasons.push("Analyse was onvolledig — opnieuw controleren");
  }

  const canPublish =
    blockers.length === 0 &&
    reviewReasons.length === 0 &&
    hasConcreteDate(draft.startDate) &&
    hasUrl &&
    (draft.routeAdvice === "route_a" || draft.routeAdvice === "route_b");

  return { blockers, reviewReasons, canPublish };
}
