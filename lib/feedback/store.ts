/**
 * Beta feedback store (public submit + admin inbox).
 */
import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  type BetaFeedbackRecord,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/feedback/labels";

export type { BetaFeedbackRecord, FeedbackCategory, FeedbackStatus };
export {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_STATUS_LABEL,
} from "@/lib/feedback/labels";

function iso(value: string | Date | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asCategory(value: unknown): FeedbackCategory {
  return FEEDBACK_CATEGORIES.includes(value as FeedbackCategory)
    ? (value as FeedbackCategory)
    : "other";
}

function asStatus(value: unknown): FeedbackStatus {
  return FEEDBACK_STATUSES.includes(value as FeedbackStatus)
    ? (value as FeedbackStatus)
    : "new";
}

type Row = {
  id: string;
  category: string | null;
  message: string | null;
  contact_email: string | null;
  app_user_id: string | null;
  pathname: string | null;
  query_string: string | null;
  status: string | null;
  admin_note: string | null;
  user_agent: string | null;
  what_went_well: string | null;
  what_unclear: string | null;
  what_missing: string | null;
  created_at: string | Date;
  updated_at: string | Date | null;
};

function mapRow(row: Row): BetaFeedbackRecord {
  const legacyParts = [
    row.what_went_well ? `Ging goed: ${row.what_went_well}` : null,
    row.what_unclear ? `Onduidelijk: ${row.what_unclear}` : null,
    row.what_missing ? `Mis ik: ${row.what_missing}` : null,
  ].filter(Boolean);
  const message =
    (row.message && row.message.trim()) ||
    legacyParts.join("\n\n") ||
    "(leeg)";

  return {
    id: row.id,
    category: asCategory(row.category),
    message,
    contactEmail: row.contact_email,
    appUserId: row.app_user_id,
    pathname: row.pathname,
    queryString: row.query_string,
    status: asStatus(row.status),
    adminNote: row.admin_note,
    userAgent: row.user_agent,
    whatWentWell: row.what_went_well,
    whatUnclear: row.what_unclear,
    whatMissing: row.what_missing,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at ?? row.created_at),
  };
}

export async function insertBetaFeedback(input: {
  category: FeedbackCategory;
  message: string;
  contactEmail?: string | null;
  appUserId?: string | null;
  pathname?: string | null;
  queryString?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sql = getEventsSql();
  if (!sql) return { ok: false, error: "unavailable" };

  const id = randomUUID();
  try {
    await sql`
      INSERT INTO beta_feedback (
        id, category, message, contact_email, app_user_id,
        pathname, query_string, status, user_agent
      ) VALUES (
        ${id},
        ${input.category},
        ${input.message},
        ${input.contactEmail ?? null},
        ${input.appUserId ?? null},
        ${input.pathname ?? null},
        ${input.queryString ?? null},
        'new',
        ${input.userAgent ?? null}
      )
    `;
    return { ok: true, id };
  } catch {
    return { ok: false, error: "insert_failed" };
  }
}

export async function listBetaFeedback(filters?: {
  status?: FeedbackStatus | "all";
  category?: FeedbackCategory | "all";
}): Promise<BetaFeedbackRecord[]> {
  const sql = getEventsSql();
  if (!sql) return [];

  const status = filters?.status && filters.status !== "all" ? filters.status : null;
  const category =
    filters?.category && filters.category !== "all" ? filters.category : null;

  const rows = (await sql`
    SELECT *
    FROM beta_feedback
    WHERE (${status}::text IS NULL OR status = ${status})
      AND (${category}::text IS NULL OR category = ${category})
    ORDER BY created_at DESC
    LIMIT 200
  `) as Row[];

  return rows.map(mapRow);
}

export async function countBetaFeedbackByStatus(): Promise<{
  new: number;
  reviewing: number;
  done: number;
  open: number;
}> {
  const sql = getEventsSql();
  if (!sql) return { new: 0, reviewing: 0, done: 0, open: 0 };
  const rows = (await sql`
    SELECT status, count(*)::int AS n
    FROM beta_feedback
    GROUP BY status
  `) as { status: string; n: number }[];

  const counts = { new: 0, reviewing: 0, done: 0 };
  for (const row of rows) {
    if (row.status === "new") counts.new = row.n;
    if (row.status === "reviewing") counts.reviewing = row.n;
    if (row.status === "done") counts.done = row.n;
  }
  return {
    ...counts,
    open: counts.new + counts.reviewing,
  };
}

export async function updateBetaFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  const rows = await sql`
    UPDATE beta_feedback
    SET status = ${status}, updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function updateBetaFeedbackCategory(
  id: string,
  category: FeedbackCategory,
): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  const rows = await sql`
    UPDATE beta_feedback
    SET category = ${category}, updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function updateBetaFeedbackAdminNote(
  id: string,
  adminNote: string | null,
): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  const note = adminNote?.trim() ? adminNote.trim().slice(0, 1000) : null;
  const rows = await sql`
    UPDATE beta_feedback
    SET admin_note = ${note}, updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

/** Soft spam guard: max N feedback rows in the last windowMinutes. */
export async function countRecentFeedback(windowMinutes = 15): Promise<number> {
  const sql = getEventsSql();
  if (!sql) return 0;
  const rows = (await sql`
    SELECT count(*)::int AS n
    FROM beta_feedback
    WHERE created_at > now() - (${windowMinutes}::int * interval '1 minute')
  `) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}
