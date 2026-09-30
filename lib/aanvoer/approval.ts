import type { IntakeEditableDraft, IntakeProposal } from "@/lib/aanvoer/types";

export type IntakeApprovalGate = {
  /** Hard fail: cannot save at all. */
  blockers: string[];
  /** Soft: save as draft under Te bekijken, do not publish yet. */
  reviewReasons: string[];
  canPublish: boolean;
};

function hasConcreteDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) && year >= 2020 && year < 2090;
}

/**
 * Decide whether "Goedkeuren & toevoegen" may publish immediately
 * or must land under Te bekijken.
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
    reviewReasons.push("Geen concrete eventdatum bevestigd.");
  }

  if (draft.routeAdvice === "not_suitable") {
    reviewReasons.push(
      draft.routeReason.trim() ||
        "Dit lijkt geen singlesgericht offline event.",
    );
  }

  if (
    draft.routeAdvice === "needs_review" ||
    (draft.singlesOnly === "unknown" &&
      draft.singlesOriented === "unknown" &&
      draft.routeAdvice !== "route_a" &&
      draft.routeAdvice !== "route_b")
  ) {
    reviewReasons.push("Singlesgerichtheid is nog niet duidelijk genoeg.");
  }

  const hasUrl = Boolean(
    draft.sourceUrl.trim() || draft.organizerUrl.trim(),
  );
  if (
    (proposal?.needsSourceVerification || !hasUrl) &&
    !hasUrl
  ) {
    reviewReasons.push(
      "Nog geen officiële of social URL om het event te verifiëren.",
    );
  }

  if (proposal?.aiFailed) {
    reviewReasons.push("AI-analyse was onvolledig; controleer de gegevens.");
  }

  const canPublish =
    blockers.length === 0 &&
    reviewReasons.length === 0 &&
    hasConcreteDate(draft.startDate) &&
    hasUrl &&
    (draft.routeAdvice === "route_a" || draft.routeAdvice === "route_b");

  return { blockers, reviewReasons, canPublish };
}
