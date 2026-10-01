/**
 * Admin-facing queue status for /interne-aanvoer.
 * Backend publication_status stays as-is; UI never shows draft/candidate/etc.
 *
 * FASE 26.15: three human statuses only.
 * Ready-to-publish items are auto-published (no "Klaar" queue).
 */

export type AdminQueueStatus =
  | "aandacht_nodig"
  | "toegevoegd"
  | "niet_toegevoegd";

/** @deprecated Keep for migrate/verify scripts that still mention the old label. */
export type LegacyAdminQueueStatus =
  | AdminQueueStatus
  | "klaar_om_toe_te_voegen"
  | "controle_nodig";

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
  /** One concrete Dutch reason when status is aandacht_nodig / niet. */
  reason: string | null;
  /** Display date; null when unknown/placeholder (never show 2099). */
  displayDate: string | null;
  dateUnknown: boolean;
  /** True when gate would allow auto-publish (caller may publish). */
  readyToPublish: boolean;
  checks: {
    singles: boolean;
    date: boolean;
    location: boolean;
    source: boolean;
  };
};

/** Sentinel used when starts_at is NOT NULL but date is unknown. */
export const PLACEHOLDER_STARTS_AT = "2099-12-31T12:00:00+01:00";

export const MANUAL_SUPPRESSED_TAG = "manual_suppressed";

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

export function isManuallySuppressed(
  tags?: string[] | null,
  notes?: string | null,
): boolean {
  if (tags?.includes(MANUAL_SUPPRESSED_TAG)) return true;
  return /manual_suppressed=1|Handmatig weggehaald/i.test(notes ?? "");
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
 * Never returns a "klaar" bucket: ready items set readyToPublish instead.
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
      readyToPublish: false,
      checks: { singles: true, date: true, location: true, source: true },
    };
  }

  if (
    input.publicationStatus === "rejected" ||
    isManuallySuppressed(tags, notes)
  ) {
    return {
      status: "niet_toegevoegd",
      reason: isManuallySuppressed(tags, notes)
        ? "Handmatig weggehaald"
        : "Bewust niet toegevoegd",
      displayDate,
      dateUnknown,
      readyToPublish: false,
      checks,
    };
  }

  // Remaining: draft / under_review / candidate / approved → attention or auto-ready
  if (input.publishedDuplicateSlug) {
    return {
      status: "aandacht_nodig",
      reason: "Mogelijk al aanwezig",
      displayDate,
      dateUnknown,
      readyToPublish: false,
      checks,
    };
  }

  if (dateUnknown || hasDateConflict(notes)) {
    return {
      status: "aandacht_nodig",
      reason: "Datum kon niet worden bevestigd",
      displayDate: null,
      dateUnknown: true,
      readyToPublish: false,
      checks: { ...checks, date: false },
    };
  }

  if (!hasSource) {
    return {
      status: "aandacht_nodig",
      reason: "Bron kon niet betrouwbaar worden geverifieerd",
      displayDate,
      dateUnknown: false,
      readyToPublish: false,
      checks,
    };
  }

  if (!singles) {
    return {
      status: "aandacht_nodig",
      reason: "Niet duidelijk of dit echt een singlesevent is",
      displayDate,
      dateUnknown: false,
      readyToPublish: false,
      checks,
    };
  }

  if (!location) {
    return {
      status: "aandacht_nodig",
      reason: "Locatie kon niet worden bevestigd",
      displayDate,
      dateUnknown: false,
      readyToPublish: false,
      checks,
    };
  }

  // Gate fully passed: ready for automatic publish (not a human queue).
  return {
    status: "aandacht_nodig",
    reason: null,
    displayDate,
    dateUnknown: false,
    readyToPublish: true,
    checks,
  };
}

export const ADMIN_STATUS_LABEL: Record<AdminQueueStatus, string> = {
  aandacht_nodig: "Jouw aandacht nodig",
  toegevoegd: "Toegevoegd",
  niet_toegevoegd: "Niet toegevoegd",
};

/** Backward-compat aliases used by older verify scripts. */
export const ADMIN_STATUS_LABEL_LEGACY = {
  ...ADMIN_STATUS_LABEL,
  klaar_om_toe_te_voegen: "Klaar om toe te voegen",
  controle_nodig: "Controle nodig",
} as const;
