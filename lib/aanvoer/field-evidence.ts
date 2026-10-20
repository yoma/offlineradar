/**
 * Per-field extraction evidence for admin diagnosis.
 * No inventing: unknown stays unknown with method/confidence recorded.
 */

import type { FieldStatus, IntakeProposal } from "@/lib/aanvoer/types";

export const FIELD_EVIDENCE_METHODS = [
  "json_ld",
  "parser",
  "html",
  "ticket_page",
  "ai",
  "ocr",
  "corroboration",
  "user",
] as const;

export type FieldEvidenceMethod = (typeof FIELD_EVIDENCE_METHODS)[number];

export type FieldConfidence = "high" | "medium" | "low" | "none";

export type FieldEvidence = {
  field: string;
  value: string | null;
  status: FieldStatus;
  confidence: FieldConfidence;
  sourceUrl: string | null;
  method: FieldEvidenceMethod;
  quote: string | null;
};

export const FIELD_EVIDENCE_LABELS: Record<FieldEvidenceMethod, string> = {
  json_ld: "JSON-LD",
  parser: "Parser",
  html: "HTML",
  ticket_page: "Ticketpagina",
  ai: "AI",
  ocr: "Screenshot-OCR",
  corroboration: "Bronvergelijking",
  user: "Handmatig",
};

export const FIELD_CONFIDENCE_LABELS: Record<FieldConfidence, string> = {
  high: "hoog",
  medium: "middel",
  low: "laag",
  none: "geen",
};

export function confidenceForMethod(method: FieldEvidenceMethod): FieldConfidence {
  switch (method) {
    case "json_ld":
    case "parser":
      return "high";
    case "ticket_page":
    case "html":
    case "corroboration":
      return "medium";
    case "ai":
    case "ocr":
      return "low";
    case "user":
      return "medium";
    default:
      return "none";
  }
}

export function evidenceFromField(input: {
  field: string;
  status: FieldStatus;
  value: string | null | undefined;
  method: FieldEvidenceMethod;
  sourceUrl?: string | null;
  quote?: string | null;
}): FieldEvidence {
  const value =
    input.value == null || String(input.value).trim() === ""
      ? null
      : String(input.value).trim();
  const status = value == null && input.status === "found" ? "unknown" : input.status;
  return {
    field: input.field,
    value,
    status,
    confidence:
      status === "unknown" ? "none" : confidenceForMethod(input.method),
    sourceUrl: input.sourceUrl ?? null,
    method: input.method,
    quote: input.quote ?? null,
  };
}

/** Keep the stronger evidence when merging layers (found > uncertain > unknown). */
export function mergeFieldEvidence(
  existing: FieldEvidence[],
  incoming: FieldEvidence[],
): FieldEvidence[] {
  const rank = (s: FieldStatus) =>
    s === "found" ? 3 : s === "uncertain" ? 2 : 1;
  const confRank = (c: FieldConfidence) =>
    c === "high" ? 3 : c === "medium" ? 2 : c === "low" ? 1 : 0;
  const map = new Map<string, FieldEvidence>();
  for (const row of existing) map.set(row.field, row);
  for (const row of incoming) {
    const prev = map.get(row.field);
    if (!prev) {
      map.set(row.field, row);
      continue;
    }
    if (rank(row.status) > rank(prev.status)) {
      map.set(row.field, row);
      continue;
    }
    if (
      rank(row.status) === rank(prev.status) &&
      confRank(row.confidence) > confRank(prev.confidence)
    ) {
      map.set(row.field, row);
    }
  }
  return [...map.values()];
}

export function collectProposalFieldEvidence(
  proposal: IntakeProposal,
  method: FieldEvidenceMethod,
  sourceUrl?: string | null,
): FieldEvidence[] {
  const pairs: Array<[string, { status: FieldStatus; value: string | null; evidence: string | null }]> = [
    ["title", proposal.title],
    ["startDate", proposal.startDate],
    ["startTime", proposal.startTime],
    ["endTime", proposal.endTime],
    ["city", proposal.city],
    ["venue", proposal.venue],
    ["priceNotes", proposal.priceNotes],
    ["sourceUrl", proposal.sourceUrl],
    ["organizerUrl", proposal.organizerUrl],
    ["organizer", proposal.organizer],
    ["ageNotes", proposal.ageNotes],
    [
      "singlesOnly",
      {
        value:
          proposal.singlesOnly.value === "unknown"
            ? null
            : proposal.singlesOnly.value,
        status:
          proposal.singlesOnly.value === "unknown"
            ? "unknown"
            : proposal.singlesOnly.status,
        evidence: proposal.singlesOnly.evidence,
      },
    ],
    [
      "singlesOriented",
      {
        value:
          proposal.singlesOriented.value === "unknown"
            ? null
            : proposal.singlesOriented.value,
        status:
          proposal.singlesOriented.value === "unknown"
            ? "unknown"
            : proposal.singlesOriented.status,
        evidence: proposal.singlesOriented.evidence,
      },
    ],
    [
      "ticketUrl",
      proposal.ticketUrl ?? {
        value: null,
        status: "unknown",
        evidence: null,
      },
    ],
  ];
  return pairs.map(([field, f]) =>
    evidenceFromField({
      field,
      status: f.status,
      value: f.value,
      method,
      sourceUrl,
      quote: f.evidence,
    }),
  );
}

export function formatFieldEvidenceLine(row: FieldEvidence): string {
  const method = FIELD_EVIDENCE_LABELS[row.method] ?? row.method;
  const conf = FIELD_CONFIDENCE_LABELS[row.confidence];
  const status =
    row.status === "found"
      ? "bevestigd"
      : row.status === "uncertain"
        ? "onzeker"
        : "onbekend";
  const value = row.value ? `“${row.value}”` : "(leeg)";
  const src = row.sourceUrl ? ` · bron ${row.sourceUrl}` : "";
  return `${row.field}: ${value} (${status}, ${method}, betrouwbaarheid ${conf})${src}`;
}
