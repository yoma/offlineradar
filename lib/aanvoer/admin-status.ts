/**
 * Admin-facing queue status for /interne-aanvoer.
 * Backend publication_status stays as-is; this layer never shows draft/candidate/etc.
 */

export type AdminQueueStatus =
  | "klaar_om_toe_te_voegen"
  | "controle_nodig"
  | "toegevoegd"
  | "niet_toegevoegd";

export type AdminStatusInput = {
  publicationStatus: string;
  startsAt: string | null | undefined;
  sourceUrl: string | null | undefined;
  eligibilityRoute: string | null | undefined;
  singlesOnly: boolean | null | undefined;
  singlesOriented: boolean | null | undefined;
  internalNotes: string | null | undefined;
  tags?: string[] | null;
  /** Published edition with same title+day, if known. */
  publishedDuplicateSlug?: string | null;
  city?: string | null;
  venueName?: string | null;
};

export type AdminStatusResult = {
  status: AdminQueueStatus;
  /** One concrete Dutch reason when status is controle_nodig. */
  reason: string | null;
  /** Display date; null when unknown/placeholder (never show 2099). */
  displayDate: string | null;
  dateUnknown: boolean;
  checks: {
    singles: boolean;
    date: boolean;
    location: boolean;
    source: boolean;
  };
};

/** Sentinel used when starts_at is NOT NULL but date is unknown. */
export const PLACEHOLDER_STARTS_AT = "2099-12-31T12:00:00+01:00";

export function isPlaceholderStartsAt(value: string | null | undefined): boolean {
  if (!value) return true;
  const day = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true;
  const year = Number(day.slice(0, 4));
  return !Number.isFinite(year) || year < 2020 || year >= 2090;
}

export function displayEventDate(
  startsAt: string | null | undefined,
  tags?: string[] | null,
  notes?: string | null,
): string | null {
  if (hasDateUnknownMarker(tags, notes)) return null;
  if (isPlaceholderStartsAt(startsAt)) return null;
  return String(startsAt).slice(0, 10);
}

function hasDateUnknownMarker(
  tags?: string[] | null,
  notes?: string | null,
): boolean {
  if (tags?.includes("date_unknown")) return true;
  const n = notes ?? "";
  return /date_unknown|Startdatum onbekend|datum onbekend/i.test(n);
}

function singlesConfirmed(input: AdminStatusInput): boolean {
  if (input.singlesOnly === true || input.singlesOriented === true) return true;
  return (
    input.eligibilityRoute === "route_a" || input.eligibilityRoute === "route_b"
  );
}

function hasDateConflict(notes: string): boolean {
  return /conflict:\s*Datum|datumconflict/i.test(notes);
}

/**
 * Classify one edition for the admin queue.
 * Never auto-publishes; "toegevoegd" only when already published.
 */
export function classifyAdminStatus(input: AdminStatusInput): AdminStatusResult {
  const notes = input.internalNotes ?? "";
  const tags = input.tags ?? [];
  const dateUnknown =
    hasDateUnknownMarker(tags, notes) || isPlaceholderStartsAt(input.startsAt);
  const displayDate = displayEventDate(input.startsAt, tags, notes);
  const hasSource = Boolean(input.sourceUrl?.trim());
  const singles = singlesConfirmed(input);
  const location = Boolean(
    (input.city && input.city !== "Onbekend") || input.venueName?.trim(),
  );

  const checks = {
    singles,
    date: !dateUnknown && Boolean(displayDate),
    location,
    source: hasSource,
  };

  if (input.publicationStatus === "published") {
    return {
      status: "toegevoegd",
      reason: null,
      displayDate,
      dateUnknown,
      checks: { singles: true, date: true, location: true, source: true },
    };
  }

  if (input.publicationStatus === "rejected") {
    return {
      status: "niet_toegevoegd",
      reason: "Bewust niet toegevoegd",
      displayDate,
      dateUnknown,
      checks,
    };
  }

  // Remaining: draft / under_review / candidate / approved → queue
  if (input.publishedDuplicateSlug) {
    return {
      status: "controle_nodig",
      reason: "Dit event lijkt al in DateOfflineHub te staan.",
      displayDate,
      dateUnknown,
      checks,
    };
  }

  if (dateUnknown || hasDateConflict(notes)) {
    return {
      status: "controle_nodig",
      reason: "Datum kon niet worden bevestigd",
      displayDate: null,
      dateUnknown: true,
      checks: { ...checks, date: false },
    };
  }

  if (!hasSource) {
    return {
      status: "controle_nodig",
      reason: "Bron ontbreekt",
      displayDate,
      dateUnknown: false,
      checks,
    };
  }

  if (!singles) {
    return {
      status: "controle_nodig",
      reason: "We konden niet bevestigen dat dit singlesgericht is",
      displayDate,
      dateUnknown: false,
      checks,
    };
  }

  if (/Bronverificatie nodig/i.test(notes) && !hasSource) {
    return {
      status: "controle_nodig",
      reason: "Bron ontbreekt",
      displayDate,
      dateUnknown: false,
      checks,
    };
  }

  return {
    status: "klaar_om_toe_te_voegen",
    reason: null,
    displayDate,
    dateUnknown: false,
    checks,
  };
}

export const ADMIN_STATUS_LABEL: Record<AdminQueueStatus, string> = {
  klaar_om_toe_te_voegen: "Klaar om toe te voegen",
  controle_nodig: "Controle nodig",
  toegevoegd: "Toegevoegd",
  niet_toegevoegd: "Niet toegevoegd",
};
