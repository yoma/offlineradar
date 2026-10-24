/**
 * Durable Instagram concept approvals bound to exact content.
 * Approval identity (content fingerprint) is separate from publish idempotency (concept key).
 */

import { getEventsSql } from "@/lib/events/db";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import {
  buildInstagramConceptKey,
  buildInstagramContentFingerprint,
  canonicalizeSlidesForApproval,
  slideEventIdsMatchConcept,
  type InstagramSlideApproval,
} from "@/lib/instagram/concept-key";

export type ConceptApprovalRecord = {
  conceptKey: string;
  contentFingerprint: string;
  format: InstagramFormatId;
  eventIds: string[];
  caption: string;
  slides: InstagramSlideApproval[];
};

export async function recordConceptApproval(input: {
  format: InstagramFormatId;
  eventIds: string[];
  caption: string;
  slides: InstagramSlideApproval[];
  approvedBy?: string | null;
}): Promise<
  | { ok: true; conceptKey: string; contentFingerprint: string }
  | { ok: false; error: string }
> {
  const sql = getEventsSql();
  if (!sql) return { ok: false, error: "neon_unavailable" };

  if (!slideEventIdsMatchConcept(input.eventIds, input.slides)) {
    return { ok: false, error: "slide_event_mismatch" };
  }

  const conceptKey = buildInstagramConceptKey(input.format, input.eventIds);
  const slides = canonicalizeSlidesForApproval(input.slides);
  const contentFingerprint = buildInstagramContentFingerprint({
    format: input.format,
    eventIds: input.eventIds,
    caption: input.caption,
    slides,
  });

  try {
    await sql`
      INSERT INTO instagram_concept_approvals (
        concept_key, format, event_ids, approved_by, approved_at,
        content_fingerprint, caption, slides
      ) VALUES (
        ${conceptKey},
        ${input.format},
        ${JSON.stringify(input.eventIds)},
        ${input.approvedBy ?? null},
        now(),
        ${contentFingerprint},
        ${input.caption.trim()},
        ${JSON.stringify(slides)}
      )
      ON CONFLICT (concept_key) DO UPDATE SET
        approved_by = COALESCE(EXCLUDED.approved_by, instagram_concept_approvals.approved_by),
        approved_at = now(),
        event_ids = EXCLUDED.event_ids,
        content_fingerprint = EXCLUDED.content_fingerprint,
        caption = EXCLUDED.caption,
        slides = EXCLUDED.slides
    `;
    return { ok: true, conceptKey, contentFingerprint };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validate that the submitted publish payload matches a stored approval.
 */
export async function assertConceptContentApproved(input: {
  format: InstagramFormatId;
  eventIds: string[];
  caption: string;
  slides: InstagramSlideApproval[];
}): Promise<
  | { ok: true; conceptKey: string; contentFingerprint: string }
  | { ok: false; code: "not_approved" | "content_mismatch" | "neon_unavailable"; message: string }
> {
  const sql = getEventsSql();
  if (!sql) {
    return {
      ok: false,
      code: "neon_unavailable",
      message: "Neon-database niet bereikbaar voor goedkeuringscontrole.",
    };
  }

  if (!slideEventIdsMatchConcept(input.eventIds, input.slides)) {
    return {
      ok: false,
      code: "content_mismatch",
      message:
        "Slide-inhoud hoort niet bij de eventselectie. Keur het concept opnieuw goed.",
    };
  }

  const conceptKey = buildInstagramConceptKey(input.format, input.eventIds);
  const contentFingerprint = buildInstagramContentFingerprint({
    format: input.format,
    eventIds: input.eventIds,
    caption: input.caption,
    slides: input.slides,
  });

  try {
    const rows = (await sql`
      SELECT content_fingerprint, caption, slides
      FROM instagram_concept_approvals
      WHERE concept_key = ${conceptKey}
      LIMIT 1
    `) as {
      content_fingerprint: string | null;
      caption: string;
      slides: unknown;
    }[];

    if (rows.length === 0) {
      return {
        ok: false,
        code: "not_approved",
        message: "Dit concept is nog niet goedgekeurd. Klik eerst op Goedkeuren.",
      };
    }

    const row = rows[0]!;
    if (
      !row.content_fingerprint ||
      row.content_fingerprint !== contentFingerprint
    ) {
      return {
        ok: false,
        code: "content_mismatch",
        message:
          "Caption of slides wijken af van de goedgekeurde versie. Keur opnieuw goed vóór publiceren.",
      };
    }

    return { ok: true, conceptKey, contentFingerprint };
  } catch {
    return {
      ok: false,
      code: "neon_unavailable",
      message: "Goedkeuringscontrole mislukt (database).",
    };
  }
}

/** @deprecated use assertConceptContentApproved */
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
