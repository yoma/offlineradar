import type { IntakeEditableDraft, IntakeProposal } from "@/lib/aanvoer/types";
import { editionLocationIsDiscoverable } from "@/lib/geo-cities";

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
    "needsSourceVerification" | "routeAdvice" | "aiFailed" | "deepScan"
  > | null,
): IntakeApprovalGate {
  const blockers: string[] = [];
  const reviewReasons: string[] = [];
  const deep = proposal?.deepScan ?? null;

  if (!draft.title.trim()) {
    blockers.push("Geen eventtitel herkend.");
  }

  if (deep?.conflicts.some((c) => /datum/i.test(c))) {
    reviewReasons.push("Bronnen geven verschillende datums.");
  } else if (!hasConcreteDate(draft.startDate)) {
    reviewReasons.push(
      deep?.triggered
        ? "Datum kon ook na uitgebreid zoeken niet bevestigd worden"
        : "Datum kon niet worden bevestigd",
    );
  }

  if (draft.routeAdvice === "not_suitable") {
    const reason = (
      draft.routeReason.trim() ||
      "We konden niet bevestigen dat dit singlesgericht is"
    ).toLowerCase();
    const hasSite = Boolean(
      draft.sourceUrl.trim() || draft.organizerUrl.trim(),
    );
    // Don't keep Facebook false-negatives once a website lead exists.
    if (
      hasSite &&
      /internetprovider|provider-app|screenshot van een/i.test(reason)
    ) {
      reviewReasons.push(
        "Website gevonden vanuit screenshot — singlesgerichtheid nog via die site controleren",
      );
    } else {
      reviewReasons.push(
        draft.routeReason.trim() ||
          "We konden niet bevestigen dat dit singlesgericht is",
      );
    }
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

  const city = draft.city.trim();
  if (!editionLocationIsDiscoverable({ city })) {
    reviewReasons.push(
      !city || /^onbekend$/i.test(city)
        ? "Plaats ontbreekt"
        : `Plaats “${city}” heeft geen bekende coördinaten; zou onzichtbaar blijven op Ontdek`,
    );
  }

  if (proposal?.aiFailed) {
    reviewReasons.push("Analyse was onvolledig — opnieuw laten zoeken");
  }

  const canPublish =
    blockers.length === 0 &&
    reviewReasons.length === 0 &&
    hasConcreteDate(draft.startDate) &&
    hasUrl &&
    editionLocationIsDiscoverable({ city }) &&
    (draft.routeAdvice === "route_a" || draft.routeAdvice === "route_b");

  return { blockers, reviewReasons, canPublish };
}
