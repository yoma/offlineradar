import type { FieldEvidence } from "@/lib/aanvoer/field-evidence";
import type { IntakeEditableDraft, IntakeProposal } from "@/lib/aanvoer/types";
import { normalizeIntakeDateToYmd } from "@/lib/aanvoer/dates";
import { editionLocationIsDiscoverable } from "@/lib/geo-cities";

export type IntakeApprovalGate = {
  /** Hard fail: cannot save at all. */
  blockers: string[];
  /** Soft: lands under Jouw aandacht nodig; do not publish yet. */
  reviewReasons: string[];
  canPublish: boolean;
};

/** Methods that count as independent of the LLM for auto-publish. */
const INDEPENDENT_METHODS = new Set([
  "json_ld",
  "parser",
  "html",
  "ticket_page",
  "corroboration",
  "user",
]);

function hasConcreteDate(value: string): boolean {
  return Boolean(normalizeIntakeDateToYmd(value));
}

function hasConcretePrice(value: string): boolean {
  return /€|\d/.test(value);
}

function evidenceFor(
  evidence: FieldEvidence[] | undefined,
  field: string,
): FieldEvidence | undefined {
  return evidence?.find((e) => e.field === field);
}

/**
 * True when a filled critical draft value is still only AI/OCR-backed
 * (no independent method) and the admin has not edited the value away.
 */
export function isAiOnlyCriticalField(input: {
  field: string;
  draftValue: string;
  fieldEvidence?: FieldEvidence[] | null;
  /** deepScan fieldsConfirmed tokens, e.g. date / location / price */
  corroborated?: string[] | null;
}): boolean {
  const value = input.draftValue.trim();
  if (!value) return false;

  const ev = evidenceFor(input.fieldEvidence ?? undefined, input.field);
  if (!ev || ev.status === "unknown") return false;
  if (INDEPENDENT_METHODS.has(ev.method)) return false;

  // Admin corrected the extracted value → human-controlled.
  if (ev.value && ev.value.trim() !== value) return false;

  const confirmed = (input.corroborated ?? []).map((c) => c.toLowerCase());
  const aliases: Record<string, string[]> = {
    startDate: ["date", "startdate"],
    startTime: ["time", "starttime"],
    city: ["city", "location"],
    priceNotes: ["price", "pricenotes"],
    singlesOriented: ["singles", "singlesoriented"],
    singlesOnly: ["singles", "singlesonly"],
  };
  const keys = aliases[input.field] ?? [input.field.toLowerCase()];
  if (keys.some((k) => confirmed.includes(k))) return false;

  return ev.method === "ai" || ev.method === "ocr";
}

/**
 * Decide whether intake may auto-publish or needs human attention.
 * Admin can still save as draft and later publish manually after review.
 */
export function evaluateIntakeApproval(
  draft: IntakeEditableDraft,
  proposal: (Pick<
    IntakeProposal,
    | "needsSourceVerification"
    | "routeAdvice"
    | "aiFailed"
    | "deepScan"
    | "startTimeUnknown"
  > & {
    fieldEvidence?: FieldEvidence[] | null;
  }) | null,
): IntakeApprovalGate {
  const blockers: string[] = [];
  const reviewReasons: string[] = [];
  const deep = proposal?.deepScan ?? null;
  const fieldEvidence = proposal?.fieldEvidence ?? null;
  const corroborated = deep?.fieldsConfirmed ?? null;

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

  // Price / extraction conflicts must never auto-publish unseen.
  if (
    deep?.conflicts.some((c) => /prijs|price/i.test(c)) ||
    /extractie_conflicten=/i.test(draft.notes)
  ) {
    reviewReasons.push(
      "Bronnen geven conflicterende prijs- of extractiegegevens — handmatige controle nodig",
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

  // FU-5: AI/OCR-only critical displays need human confirmation before auto-publish.
  const aiOnlyLabels: string[] = [];
  if (
    hasConcreteDate(draft.startDate) &&
    isAiOnlyCriticalField({
      field: "startDate",
      draftValue: draft.startDate,
      fieldEvidence,
      corroborated,
    })
  ) {
    aiOnlyLabels.push("datum");
  }

  const timeConfirmed =
    !proposal?.startTimeUnknown && Boolean(draft.startTime.trim());
  if (
    timeConfirmed &&
    isAiOnlyCriticalField({
      field: "startTime",
      draftValue: draft.startTime,
      fieldEvidence,
      corroborated,
    })
  ) {
    aiOnlyLabels.push("begintijd");
  }

  if (
    city &&
    isAiOnlyCriticalField({
      field: "city",
      draftValue: city,
      fieldEvidence,
      corroborated,
    })
  ) {
    aiOnlyLabels.push("plaats");
  }

  if (
    hasConcretePrice(draft.priceNotes) &&
    isAiOnlyCriticalField({
      field: "priceNotes",
      draftValue: draft.priceNotes,
      fieldEvidence,
      corroborated,
    })
  ) {
    aiOnlyLabels.push("prijs");
  }

  // Claimed singles suitability must not rest on AI/OCR alone.
  if (
    (draft.singlesOriented === "true" &&
      isAiOnlyCriticalField({
        field: "singlesOriented",
        draftValue: "true",
        fieldEvidence,
        corroborated,
      })) ||
    (draft.singlesOnly === "true" &&
      isAiOnlyCriticalField({
        field: "singlesOnly",
        draftValue: "true",
        fieldEvidence,
        corroborated,
      }))
  ) {
    aiOnlyLabels.push("singlesgeschiktheid");
  }

  if (aiOnlyLabels.length) {
    reviewReasons.push(
      `AI-extractie zonder onafhankelijk bronbewijs (${[...new Set(aiOnlyLabels)].join(", ")}) — handmatig bevestigen vóór publicatie`,
    );
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
