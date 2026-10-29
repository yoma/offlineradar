/**
 * Analytics schema v2 (applied lazily, idempotent):
 * - analytics_excluded_sessions: devices of the admin (never counted, also
 *   retroactively).
 * - analytics_events_visible: analytics_events without those sessions; every
 *   dashboard query reads this view.
 */

import { getEventsSql } from "@/lib/events/db";
import { splitSqlStatements } from "@/lib/events/sql-split";

export const ANALYTICS_V2_MIGRATION_ID = "20261029_analytics_visitors_v2";

export const ANALYTICS_V2_SQL = `
CREATE TABLE IF NOT EXISTS analytics_excluded_sessions (
  session_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analytics_excluded_sessions_id_check CHECK (
    char_length(session_id) BETWEEN 8 AND 80
  )
);

CREATE OR REPLACE VIEW analytics_events_visible AS
  SELECT e.*
  FROM analytics_events e
  WHERE NOT EXISTS (
    SELECT 1 FROM analytics_excluded_sessions x
    WHERE x.session_id = e.anonymous_session_id
  );

INSERT INTO schema_migrations (id)
VALUES ('20261029_analytics_visitors_v2')
ON CONFLICT (id) DO NOTHING;
`;

let ensured: Promise<boolean> | null = null;

export function ensureAnalyticsSchemaV2(): Promise<boolean> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getEventsSql();
      if (!sql) return false;
      const done = (await sql`
        SELECT 1 FROM schema_migrations WHERE id = ${ANALYTICS_V2_MIGRATION_ID}
      `) as unknown[];
      if (done.length > 0) return true;
      await sql.transaction(
        splitSqlStatements(ANALYTICS_V2_SQL).map((s) => sql.query(s, [])),
      );
      return true;
    })().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}

/** Never count this device again (and drop it from past numbers). */
export async function excludeAnalyticsSession(
  sessionId: string,
  reason: "admin" | "self" = "admin",
): Promise<void> {
  const sql = getEventsSql();
  if (!sql || !(await ensureAnalyticsSchemaV2())) return;
  await sql`
    INSERT INTO analytics_excluded_sessions (session_id, reason)
    VALUES (${sessionId}, ${reason})
    ON CONFLICT (session_id) DO NOTHING
  `;
}

export async function includeAnalyticsSession(sessionId: string): Promise<void> {
  const sql = getEventsSql();
  if (!sql || !(await ensureAnalyticsSchemaV2())) return;
  await sql`DELETE FROM analytics_excluded_sessions WHERE session_id = ${sessionId}`;
}
