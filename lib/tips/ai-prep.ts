import type { TipAiPrep, TipSubmission } from "@/types/tips";

/**
 * AI control preparation — schema + reuse hooks only.
 * Does not call Anthropic or fetch remote pages in this phase.
 *
 * Future flow:
 * 1. Admin starts prep for a tip.
 * 2. Fetch official URL safely (SSRF guards) → content hash.
 * 3. If hash matches a previous TipAiPrep, reuse (no paid call).
 * 4. Else run ContentScreener / Route A/B screening on neutral facts.
 * 5. Store TipAiPrep; human still decides status/publication.
 */

export function emptyAiPrepPlaceholder(tip: TipSubmission): TipAiPrep {
  return {
    preparedAt: new Date().toISOString(),
    modelHint: null,
    sourceContentHash: null,
    reusedFromTipId: null,
    proposedTitle: null,
    proposedOrganizer: null,
    proposedStartDate: null,
    proposedCity: null,
    singlesRoute: null,
    singlesEvidence: null,
    ageNotes: null,
    priceNotes: null,
    availabilityNotes: null,
    bookingUrl: tip.normalizedUrl,
    gaps: [
      "AI-controle is nog niet geactiveerd voor tips.",
      "Meldertekst is geen bewijs van singlesgerichtheid; controleer de officiële bron.",
    ],
    suggestsListable: null,
    rawNotes:
      "Placeholder only. Wire to lib/screening + ContentScreener later without auto-publish.",
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
    if (prep?.sourceContentHash && prep.sourceContentHash === contentHash) {
      return { tipId: tip.id, prep };
    }
  }
  return null;
}
