/**
 * Tip AI prep helpers + orchestration entry points.
 * Never auto-publishes. Human decisions stay separate.
 */

import type { TipAiPrep, TipSubmission } from "@/types/tips";

export function emptyAiPrepPlaceholder(tip: TipSubmission): TipAiPrep {
  return {
    preparedAt: new Date().toISOString(),
    modelHint: null,
    sourceContentHash: null,
    reusedFromTipId: null,
    sourceUrlsUsed: [],
    proposedTitle: null,
    proposedOrganizer: null,
    proposedStartDate: null,
    proposedStartTime: null,
    proposedEndTime: null,
    proposedCity: null,
    proposedVenue: null,
    proposedPriceNotes: null,
    singlesRoute: null,
    routeSuggestion: null,
    routeReason: null,
    confidence: null,
    singlesEvidence: null,
    singlesOnly: null,
    ageNotes: null,
    ageRule: null,
    priceNotes: null,
    availabilityNotes: null,
    bookingUrl: tip.normalizedUrl,
    gaps: [
      "AI-controle is nog niet uitgevoerd.",
      "Meldertekst is geen bewijs van singlesgerichtheid; controleer de officiële bron.",
    ],
    conflicts: [],
    suggestsListable: null,
    suggestSourceWatch: false,
    suggestSourceWatchReason: null,
    rawNotes: null,
    scanError: null,
  };
}

export function findReusableAiPrep(
  tips: TipSubmission[],
  prepsByTipId: Map<string, TipAiPrep | null>,
  normalizedUrl: string,
  contentHash: string | null,
): { tipId: string; prep: TipAiPrep } | null {
  if (!contentHash) return null;
  for (const tip of tips) {
    if (tip.normalizedUrl !== normalizedUrl) continue;
    const prep = prepsByTipId.get(tip.id);
    if (
      prep?.sourceContentHash &&
      prep.sourceContentHash === contentHash &&
      !prep.scanError &&
      prep.routeSuggestion
    ) {
      return { tipId: tip.id, prep };
    }
  }
  return null;
}

export function clonePrepForReuse(
  prep: TipAiPrep,
  reusedFromTipId: string,
): TipAiPrep {
  return {
    ...prep,
    preparedAt: new Date().toISOString(),
    reusedFromTipId,
    scanError: null,
  };
}

/** Recent successful scan cooldown (avoid double-click paid calls). */
export function isAiPrepFresh(prep: TipAiPrep | null, withinMs = 10 * 60_000): boolean {
  if (!prep?.preparedAt || prep.scanError || !prep.routeSuggestion) return false;
  const ts = Date.parse(prep.preparedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < withinMs;
}
