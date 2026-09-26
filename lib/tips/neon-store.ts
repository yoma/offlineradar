import { randomUUID } from "node:crypto";
import { getTipsSql } from "@/lib/tips/db";
import type {
  SourceWatchEntry,
  TipAiPrep,
  TipReview,
  TipStatus,
  TipSubmission,
  TipsStoreSnapshot,
} from "@/types/tips";

type TipRow = {
  id: string;
  original_url: string;
  normalized_url: string;
  note: string | null;
  received_at: string | Date;
  status: TipStatus;
  notify_requested: boolean;
  email: string | null;
  duplicate_of_tip_id: string | null;
  linked_event_id: string | null;
  linked_source_id: string | null;
  duplicate_notes: unknown;
  submitter_user_agent: string | null;
};

type ReviewRow = {
  tip_id: string;
  checked_at: string | Date | null;
  source_url_checked: string | null;
  ai_prep: TipAiPrep | null;
  missing_or_conflicts: unknown;
  admin_decision: TipStatus | null;
  decision_reason: string | null;
  decided_at: string | Date | null;
  published_at: string | Date | null;
  published_event_path: string | null;
};

type SourceRow = {
  id: string;
  official_url: string;
  normalized_url: string;
  organizer_or_series_name: string;
  why_interesting: string;
  last_checked_at: string | Date | null;
  next_check_at: string | Date | null;
  created_at: string | Date;
};

function iso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function mapTip(row: TipRow): TipSubmission {
  return {
    id: row.id,
    originalUrl: row.original_url,
    normalizedUrl: row.normalized_url,
    note: row.note,
    receivedAt: iso(row.received_at) ?? new Date().toISOString(),
    notifyRequested: row.notify_requested === true,
    email: row.email,
    status: row.status,
    duplicateOfTipId: row.duplicate_of_tip_id,
    linkedEventId: row.linked_event_id,
    linkedSourceId: row.linked_source_id,
    duplicateNotes: asStringArray(row.duplicate_notes),
    submitterMeta: {
      userAgent: row.submitter_user_agent,
    },
  };
}

function mapReview(row: ReviewRow): TipReview {
  return {
    tipId: row.tip_id,
    checkedAt: iso(row.checked_at),
    sourceUrlChecked: row.source_url_checked,
    aiPrep: row.ai_prep ?? null,
    missingOrConflicts: asStringArray(row.missing_or_conflicts),
    adminDecision: row.admin_decision,
    decisionReason: row.decision_reason,
    decidedAt: iso(row.decided_at),
    publishedAt: iso(row.published_at),
    publishedEventPath: row.published_event_path,
    emailSentForStatuses: [],
  };
}

function mapSource(row: SourceRow, tipIds: string[]): SourceWatchEntry {
  return {
    id: row.id,
    officialUrl: row.official_url,
    normalizedUrl: row.normalized_url,
    organizerOrSeriesName: row.organizer_or_series_name,
    whyInteresting: row.why_interesting,
    lastCheckedAt: iso(row.last_checked_at),
    nextCheckAt: iso(row.next_check_at),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    tipIds,
  };
}

function emptyReview(tipId: string): TipReview {
  return {
    tipId,
    checkedAt: null,
    sourceUrlChecked: null,
    aiPrep: null,
    missingOrConflicts: [],
    adminDecision: null,
    decisionReason: null,
    decidedAt: null,
    publishedAt: null,
    publishedEventPath: null,
    emailSentForStatuses: [],
  };
}

export async function neonLoadSnapshot(): Promise<TipsStoreSnapshot | null> {
  const sql = getTipsSql();
  if (!sql) return null;

  const tipRows = (await sql`
    SELECT *
    FROM tips
    ORDER BY received_at DESC
  `) as TipRow[];

  const reviewRows = (await sql`
    SELECT *
    FROM tip_reviews
  `) as ReviewRow[];

  const sourceRows = (await sql`
    SELECT *
    FROM source_watchlist
    ORDER BY created_at DESC
  `) as SourceRow[];

  const linkRows = (await sql`
    SELECT source_id, tip_id
    FROM source_watch_tips
  `) as { source_id: string; tip_id: string }[];

  const tipIdsBySource = new Map<string, string[]>();
  for (const link of linkRows) {
    const list = tipIdsBySource.get(link.source_id) ?? [];
    list.push(link.tip_id);
    tipIdsBySource.set(link.source_id, list);
  }

  const emailLogs = (await sql`
    SELECT tip_id, status
    FROM tip_email_log
  `) as { tip_id: string; status: TipStatus }[];

  const emailed = new Map<string, TipStatus[]>();
  for (const row of emailLogs) {
    const list = emailed.get(row.tip_id) ?? [];
    list.push(row.status);
    emailed.set(row.tip_id, list);
  }

  const tips = tipRows.map(mapTip);
  const reviews = reviewRows.map((row) => {
    const review = mapReview(row);
    review.emailSentForStatuses = emailed.get(row.tip_id) ?? [];
    return review;
  });

  const tipIds = new Set(tips.map((tip) => tip.id));
  for (const tip of tips) {
    if (!reviews.some((review) => review.tipId === tip.id)) {
      reviews.push(emptyReview(tip.id));
    }
  }

  return {
    version: 1,
    tips,
    reviews: reviews.filter((review) => tipIds.has(review.tipId)),
    sources: sourceRows.map((row) =>
      mapSource(row, tipIdsBySource.get(row.id) ?? []),
    ),
  };
}

export async function neonInsertTip(input: {
  tip: TipSubmission;
  review: TipReview;
}): Promise<void> {
  const sql = getTipsSql();
  if (!sql) throw new Error("Neon SQL unavailable");

  await sql`
    INSERT INTO tips (
      id,
      original_url,
      normalized_url,
      note,
      received_at,
      status,
      notify_requested,
      email,
      duplicate_of_tip_id,
      linked_event_id,
      linked_source_id,
      duplicate_notes,
      submitter_user_agent
    ) VALUES (
      ${input.tip.id},
      ${input.tip.originalUrl},
      ${input.tip.normalizedUrl},
      ${input.tip.note},
      ${input.tip.receivedAt},
      ${input.tip.status},
      ${input.tip.notifyRequested},
      ${input.tip.email},
      ${input.tip.duplicateOfTipId},
      ${input.tip.linkedEventId},
      ${input.tip.linkedSourceId},
      ${JSON.stringify(input.tip.duplicateNotes)},
      ${input.tip.submitterMeta.userAgent}
    )
  `;

  await sql`
    INSERT INTO tip_reviews (
      tip_id,
      checked_at,
      source_url_checked,
      ai_prep,
      missing_or_conflicts,
      admin_decision,
      decision_reason,
      decided_at,
      published_at,
      published_event_path
    ) VALUES (
      ${input.review.tipId},
      ${input.review.checkedAt},
      ${input.review.sourceUrlChecked},
      ${input.review.aiPrep},
      ${JSON.stringify(input.review.missingOrConflicts)},
      ${input.review.adminDecision},
      ${input.review.decisionReason},
      ${input.review.decidedAt},
      ${input.review.publishedAt},
      ${input.review.publishedEventPath}
    )
  `;
}

export async function neonFindTipByNormalizedUrl(
  normalizedUrl: string,
): Promise<{ tip: TipSubmission; review: TipReview } | null> {
  const sql = getTipsSql();
  if (!sql) return null;

  const tipRows = (await sql`
    SELECT *
    FROM tips
    WHERE normalized_url = ${normalizedUrl}
    LIMIT 1
  `) as TipRow[];
  if (tipRows.length === 0) return null;
  const tip = mapTip(tipRows[0]);

  const reviewRows = (await sql`
    SELECT *
    FROM tip_reviews
    WHERE tip_id = ${tip.id}
    LIMIT 1
  `) as ReviewRow[];
  const review =
    reviewRows.length > 0 ? mapReview(reviewRows[0]) : emptyReview(tip.id);
  return { tip, review };
}

export async function neonUpdateExistingDuplicate(input: {
  tipId: string;
  duplicateNotes: string[];
  status: TipStatus;
  notifyRequested: boolean;
  email: string | null;
}): Promise<void> {
  const sql = getTipsSql();
  if (!sql) throw new Error("Neon SQL unavailable");

  await sql`
    UPDATE tips
    SET
      duplicate_notes = ${JSON.stringify(input.duplicateNotes)},
      status = ${input.status},
      notify_requested = ${input.notifyRequested},
      email = ${input.email},
      updated_at = now()
    WHERE id = ${input.tipId}
  `;

  await sql`
    INSERT INTO tip_reviews (tip_id)
    VALUES (${input.tipId})
    ON CONFLICT (tip_id) DO NOTHING
  `;
}

export async function neonUpdateTipStatus(input: {
  tipId: string;
  status: TipStatus;
  decisionReason: string | null;
  publishedEventPath: string | null;
}): Promise<boolean> {
  const sql = getTipsSql();
  if (!sql) return false;

  const updated = (await sql`
    UPDATE tips
    SET status = ${input.status}, updated_at = now()
    WHERE id = ${input.tipId}
    RETURNING id
  `) as { id: string }[];
  if (updated.length === 0) return false;

  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? now : null;

  await sql`
    INSERT INTO tip_reviews (
      tip_id,
      checked_at,
      source_url_checked,
      admin_decision,
      decision_reason,
      decided_at,
      published_at,
      published_event_path
    )
    VALUES (
      ${input.tipId},
      ${now},
      (SELECT normalized_url FROM tips WHERE id = ${input.tipId}),
      ${input.status},
      ${input.decisionReason},
      ${now},
      ${publishedAt},
      ${input.publishedEventPath}
    )
    ON CONFLICT (tip_id) DO UPDATE SET
      checked_at = COALESCE(tip_reviews.checked_at, EXCLUDED.checked_at),
      source_url_checked = COALESCE(tip_reviews.source_url_checked, EXCLUDED.source_url_checked),
      admin_decision = EXCLUDED.admin_decision,
      decision_reason = EXCLUDED.decision_reason,
      decided_at = EXCLUDED.decided_at,
      published_at = CASE
        WHEN EXCLUDED.admin_decision = 'published' THEN EXCLUDED.published_at
        ELSE tip_reviews.published_at
      END,
      published_event_path = CASE
        WHEN EXCLUDED.admin_decision = 'published' THEN EXCLUDED.published_event_path
        ELSE tip_reviews.published_event_path
      END
  `;

  return true;
}

export async function neonFindTipById(
  tipId: string,
): Promise<{ tip: TipSubmission; review: TipReview } | null> {
  const sql = getTipsSql();
  if (!sql) return null;

  const tipRows = (await sql`
    SELECT *
    FROM tips
    WHERE id = ${tipId}
    LIMIT 1
  `) as TipRow[];
  if (tipRows.length === 0) return null;
  const tip = mapTip(tipRows[0]);

  const reviewRows = (await sql`
    SELECT *
    FROM tip_reviews
    WHERE tip_id = ${tip.id}
    LIMIT 1
  `) as ReviewRow[];
  const review =
    reviewRows.length > 0 ? mapReview(reviewRows[0]) : emptyReview(tip.id);
  return { tip, review };
}

/**
 * Persist AI prep only. Never touches admin_decision / decided_at / published_*.
 */
export async function neonSaveAiPrep(input: {
  tipId: string;
  prep: TipAiPrep;
  sourceUrlChecked: string;
}): Promise<boolean> {
  const sql = getTipsSql();
  if (!sql) return false;

  const missing = [...input.prep.gaps, ...input.prep.conflicts].slice(0, 40);

  const updated = (await sql`
    INSERT INTO tip_reviews (
      tip_id,
      checked_at,
      source_url_checked,
      ai_prep,
      missing_or_conflicts
    )
    VALUES (
      ${input.tipId},
      ${input.prep.preparedAt},
      ${input.sourceUrlChecked},
      ${JSON.stringify(input.prep)},
      ${JSON.stringify(missing)}
    )
    ON CONFLICT (tip_id) DO UPDATE SET
      checked_at = EXCLUDED.checked_at,
      source_url_checked = EXCLUDED.source_url_checked,
      ai_prep = EXCLUDED.ai_prep,
      missing_or_conflicts = EXCLUDED.missing_or_conflicts
    RETURNING tip_id
  `) as { tip_id: string }[];

  return updated.length > 0;
}

/** Soft status move used while AI scan runs; never sets approved/published. */
export async function neonSetTipStatusIfCurrent(input: {
  tipId: string;
  fromStatuses: TipStatus[];
  toStatus: TipStatus;
}): Promise<boolean> {
  const sql = getTipsSql();
  if (!sql) return false;
  if (
    input.toStatus === "approved_for_publication" ||
    input.toStatus === "published"
  ) {
    return false;
  }

  const updated = (await sql`
    UPDATE tips
    SET status = ${input.toStatus}, updated_at = now()
    WHERE id = ${input.tipId}
      AND status IN (
        ${input.fromStatuses[0] ?? "__none__"},
        ${input.fromStatuses[1] ?? "__none__"},
        ${input.fromStatuses[2] ?? "__none__"},
        ${input.fromStatuses[3] ?? "__none__"}
      )
    RETURNING id
  `) as { id: string }[];
  return updated.length > 0;
}

/** Reuse a successful AI prep for the same normalized URL + content hash. */
export async function neonFindReusableAiPrep(input: {
  normalizedUrl: string;
  contentHash: string;
  excludeTipId?: string;
}): Promise<{ tipId: string; prep: TipAiPrep } | null> {
  const sql = getTipsSql();
  if (!sql) return null;

  const rows = (await sql`
    SELECT t.id AS tip_id, r.ai_prep
    FROM tips t
    INNER JOIN tip_reviews r ON r.tip_id = t.id
    WHERE t.normalized_url = ${input.normalizedUrl}
      AND r.ai_prep IS NOT NULL
      AND (${input.excludeTipId ?? null}::text IS NULL OR t.id <> ${input.excludeTipId ?? null})
    ORDER BY r.checked_at DESC NULLS LAST
    LIMIT 20
  `) as { tip_id: string; ai_prep: TipAiPrep | null }[];

  for (const row of rows) {
    const prep = row.ai_prep;
    if (
      prep?.sourceContentHash === input.contentHash &&
      prep.routeSuggestion &&
      !prep.scanError
    ) {
      return { tipId: row.tip_id, prep };
    }
  }
  return null;
}

export async function neonUpsertSourceWatch(input: {
  officialUrl: string;
  normalizedUrl: string;
  organizerOrSeriesName: string;
  whyInteresting: string;
  tipId: string;
}): Promise<string> {
  const sql = getTipsSql();
  if (!sql) throw new Error("Neon SQL unavailable");

  const existing = (await sql`
    SELECT id
    FROM source_watchlist
    WHERE normalized_url = ${input.normalizedUrl}
    LIMIT 1
  `) as { id: string }[];

  const sourceId = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await sql`
      INSERT INTO source_watchlist (
        id,
        official_url,
        normalized_url,
        organizer_or_series_name,
        why_interesting
      ) VALUES (
        ${sourceId},
        ${input.officialUrl},
        ${input.normalizedUrl},
        ${input.organizerOrSeriesName},
        ${input.whyInteresting}
      )
    `;
  }

  await sql`
    INSERT INTO source_watch_tips (source_id, tip_id)
    VALUES (${sourceId}, ${input.tipId})
    ON CONFLICT DO NOTHING
  `;

  await sql`
    UPDATE tips
    SET linked_source_id = ${sourceId}, updated_at = now()
    WHERE id = ${input.tipId}
  `;

  return sourceId;
}
