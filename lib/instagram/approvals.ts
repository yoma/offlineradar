/**
 * Durable Instagram concept approvals (required before Meta publish).
 */

import { getEventsSql } from "@/lib/events/db";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import { buildInstagramConceptKey } from "@/lib/instagram/concept-key";

export async function recordConceptApproval(input: {
  format: InstagramFormatId;
  eventIds: string[];
  approvedBy?: string | null;
}): Promise<{ ok: true; conceptKey: string } | { ok: false; error: string }> {
  const sql = getEventsSql();
  if (!sql) return { ok: false, error: "neon_unavailable" };

  const conceptKey = buildInstagramConceptKey(input.format, input.eventIds);
  try {
    await sql`
      INSERT INTO instagram_concept_approvals (
        concept_key, format, event_ids, approved_by, approved_at
      ) VALUES (
        ${conceptKey},
        ${input.format},
        ${JSON.stringify(input.eventIds)},
        ${input.approvedBy ?? null},
        now()
      )
      ON CONFLICT (concept_key) DO UPDATE SET
        approved_by = COALESCE(EXCLUDED.approved_by, instagram_concept_approvals.approved_by),
        approved_at = now(),
        event_ids = EXCLUDED.event_ids
    `;
    return { ok: true, conceptKey };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function isConceptApproved(conceptKey: string): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  try {
    const rows = await sql`
      SELECT 1 FROM instagram_concept_approvals
      WHERE concept_key = ${conceptKey}
      LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}
