export type IntakeMode = "url" | "text" | "screenshot";

export type FieldStatus = "found" | "uncertain" | "unknown";

export type IntakeField<T> = {
  value: T;
  status: FieldStatus;
  evidence: string | null;
};

export type IntakeSourceKindHint =
  | "website_first"
  | "social_first"
  | "ticket_platform_first"
  | "manual_only";

export type IntakeRouteAdvice =
  | "route_a"
  | "route_b"
  | "not_suitable"
  | "needs_review";

export type DeepScanReportLite = {
  triggered: boolean;
  reason: string;
  queries: string[];
  searchResultCount?: number;
  sourcesChecked: Array<{ url: string; ok: boolean; note?: string }>;
  fieldsConfirmed: string[];
  conflicts: string[];
  fieldsBefore?: Record<string, string | null>;
  fieldsAfter?: Record<string, string | null>;
  startedAt?: string;
  completedAt?: string;
  timestamp: string;
  outcome?: "skipped" | "new_info" | "no_new_info" | "failed";
  outcomeMessage?: string;
};

export type IntakeProposal = {
  organizer: IntakeField<string | null>;
  title: IntakeField<string | null>;
  startDate: IntakeField<string | null>;
  startTime: IntakeField<string | null>;
  endTime: IntakeField<string | null>;
  city: IntakeField<string | null>;
  venue: IntakeField<string | null>;
  location: IntakeField<string | null>;
  ageNotes: IntakeField<string | null>;
  priceNotes: IntakeField<string | null>;
  currency: IntakeField<string | null>;
  singlesOnly: IntakeField<"true" | "false" | "unknown">;
  singlesOriented: IntakeField<"true" | "false" | "unknown">;
  category: IntakeField<string | null>;
  sourceUrl: IntakeField<string | null>;
  organizerUrl: IntakeField<string | null>;
  availability: IntakeField<string | null>;
  notes: IntakeField<string | null>;
  sourceKindHint: IntakeSourceKindHint;
  routeAdvice: IntakeRouteAdvice;
  routeReason: string;
  needsSourceVerification: boolean;
  modelHint: string | null;
  aiFailed: boolean;
  aiError: string | null;
  /** Present after Pass 2 deep verification (FASE 26.16). */
  deepScan?: DeepScanReportLite | null;
};

export type IntakeEditableDraft = {
  organizer: string;
  title: string;
  startDate: string;
  startTime: string;
  endTime: string;
  city: string;
  venue: string;
  location: string;
  ageNotes: string;
  priceNotes: string;
  currency: string;
  singlesOnly: "true" | "false" | "unknown";
  singlesOriented: "true" | "false" | "unknown";
  category: string;
  sourceUrl: string;
  organizerUrl: string;
  availability: string;
  notes: string;
  sourceKindHint: IntakeSourceKindHint;
  routeAdvice: IntakeRouteAdvice;
  routeReason: string;
};

export type IntakeMatch = {
  kind: "catalog_source" | "event_edition" | "organizer";
  id: string;
  label: string;
  detail: string;
  matchReason: string;
};

export const INTAKE_ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const INTAKE_MAX_BYTES = 4 * 1024 * 1024;
/** Safe max length for free-text "Info plakken" intake. */
export const INTAKE_MAX_TEXT_CHARS = 60_000;

export function emptyIntakeField<T>(value: T): IntakeField<T> {
  return { value, status: "unknown", evidence: null };
}

export function blankProposal(partial?: Partial<IntakeProposal>): IntakeProposal {
  return {
    organizer: emptyIntakeField(null),
    title: emptyIntakeField(null),
    startDate: emptyIntakeField(null),
    startTime: emptyIntakeField(null),
    endTime: emptyIntakeField(null),
    city: emptyIntakeField(null),
    venue: emptyIntakeField(null),
    location: emptyIntakeField(null),
    ageNotes: emptyIntakeField(null),
    priceNotes: emptyIntakeField(null),
    currency: emptyIntakeField(null),
    singlesOnly: emptyIntakeField("unknown"),
    singlesOriented: emptyIntakeField("unknown"),
    category: emptyIntakeField(null),
    sourceUrl: emptyIntakeField(null),
    organizerUrl: emptyIntakeField(null),
    availability: emptyIntakeField(null),
    notes: emptyIntakeField(null),
    sourceKindHint: "manual_only",
    routeAdvice: "needs_review",
    routeReason: "Nog niet geanalyseerd.",
    needsSourceVerification: true,
    modelHint: null,
    aiFailed: false,
    aiError: null,
    ...partial,
  };
}

export function proposalToDraft(proposal: IntakeProposal): IntakeEditableDraft {
  return {
    organizer: proposal.organizer.value ?? "",
    title: proposal.title.value ?? "",
    startDate: proposal.startDate.value ?? "",
    startTime: proposal.startTime.value ?? "",
    endTime: proposal.endTime.value ?? "",
    city: proposal.city.value ?? "",
    venue: proposal.venue.value ?? "",
    location: proposal.location.value ?? "",
    ageNotes: proposal.ageNotes.value ?? "",
    priceNotes: proposal.priceNotes.value ?? "",
    currency: proposal.currency.value ?? "EUR",
    singlesOnly: proposal.singlesOnly.value,
    singlesOriented: proposal.singlesOriented.value,
    category: proposal.category.value ?? "",
    sourceUrl: proposal.sourceUrl.value ?? "",
    organizerUrl: proposal.organizerUrl.value ?? "",
    availability: proposal.availability.value ?? "",
    notes: proposal.notes.value ?? "",
    sourceKindHint: proposal.sourceKindHint,
    routeAdvice: proposal.routeAdvice,
    routeReason: proposal.routeReason,
  };
}
