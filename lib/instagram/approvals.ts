/**
 * Durable Instagram concept approvals bound to exact content + event snapshots.
 * Approval identity (content fingerprint) is separate from publish idempotency (concept key).
 *
 * Event snapshots are stored inside the existing `slides` JSONB as a v2 envelope
 * (no extra Neon migration required).
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
import {
  canonicalizeEventSnapshots,
  type InstagramEventSnapshot,
} from "@/lib/instagram/event-snapshot";

export type ApprovalSlidesEnvelope = {
  v: 2;
  slides: InstagramSlideApproval[];
  eventSnapshots: InstagramEventSnapshot[];
};

export function packApprovalSlides(
  slides: InstagramSlideApproval[],
  eventSnapshots: InstagramEventSnapshot[],
): ApprovalSlidesEnvelope {
  return {
    v: 2,
    slides: canonicalizeSlidesForApproval(slides),
    eventSnapshots: canonicalizeEventSnapshots(eventSnapshots),
  };
}

export function unpackApprovalSlides(raw: unknown): ApprovalSlidesEnvelope | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    // Legacy approvals without event snapshots cannot authorize publish/render.
    return null;
  }
  if (typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 2 || !Array.isArray(obj.slides) || !Array.isArray(obj.eventSnapshots)) {
    return null;
  }
  return {
    v: 2,
    slides: obj.slides as InstagramSlideApproval[],
    eventSnapshots: obj.eventSnapshots as InstagramEventSnapshot[],
  };
}

export async function recordConceptApproval(input: {
  format: InstagramFormatId;
  eventIds: string[];
  caption: string;
  slides: InstagramSlideApproval[];
  eventSnapshots: InstagramEventSnapshot[];
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
  if (input.eventSnapshots.length !== input.eventIds.length) {
    return { ok: false, error: "snapshot_count_mismatch" };
  }
  for (let i = 0; i < input.eventIds.length; i++) {
    if (input.eventSnapshots[i]?.id !== input.eventIds[i]) {
      return { ok: false, error: "snapshot_order_mismatch" };
    }
  }

  const conceptKey = buildInstagramConceptKey(input.format, input.eventIds);
  const slides = canonicalizeSlidesForApproval(input.slides);
  const eventSnapshots = canonicalizeEventSnapshots(input.eventSnapshots);
  const contentFingerprint = buildInstagramContentFingerprint({
    format: input.format,
    eventIds: input.eventIds,
    caption: input.caption,
    slides,
    eventSnapshots,
  });
  const packed = packApprovalSlides(slides, eventSnapshots);

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
        ${JSON.stringify(packed)}
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
 * Frozen event snapshots come from the stored approval (not the live catalog).
 */
export async function assertConceptContentApproved(input: {
  format: InstagramFormatId;
  eventIds: string[];
  caption: string;
  slides: InstagramSlideApproval[];
}): Promise<
  | {
      ok: true;
      conceptKey: string;
      contentFingerprint: string;
      eventSnapshots: InstagramEventSnapshot[];
    }
  | {
      ok: false;
      code: "not_approved" | "content_mismatch" | "neon_unavailable";
      message: string;
    }
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
    const packed = unpackApprovalSlides(row.slides);
    if (!row.content_fingerprint || !packed) {
      return {
        ok: false,
        code: "content_mismatch",
        message:
          "Goedkeuring mist event-snapshots (titel/datum/locatie). Keur het concept opnieuw goed.",
      };
    }

    const contentFingerprint = buildInstagramContentFingerprint({
      format: input.format,
      eventIds: input.eventIds,
      caption: input.caption,
      slides: input.slides,
      eventSnapshots: packed.eventSnapshots,
    });

    if (row.content_fingerprint !== contentFingerprint) {
      return {
        ok: false,
        code: "content_mismatch",
        message:
          "Caption, slides of eventgegevens (titel/datum/locatie) wijken af van de goedgekeurde versie. Keur opnieuw goed vóór publiceren.",
      };
    }

    return {
      ok: true,
      conceptKey,
      contentFingerprint,
      eventSnapshots: packed.eventSnapshots,
    };
  } catch {
    return {
      ok: false,
      code: "neon_unavailable",
      message: "Goedkeuringscontrole mislukt (database).",
    };
  }
}

/** Load frozen approval content for Meta public-media rendering. */
export async function getApprovalByContentFingerprint(
  contentFingerprint: string,
): Promise<ApprovalSlidesEnvelope | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  try {
    const rows = (await sql`
      SELECT slides
      FROM instagram_concept_approvals
      WHERE content_fingerprint = ${contentFingerprint}
      LIMIT 1
    `) as { slides: unknown }[];
    if (!rows[0]) return null;
    return unpackApprovalSlides(rows[0].slides);
  } catch {
    return null;
  }
}
