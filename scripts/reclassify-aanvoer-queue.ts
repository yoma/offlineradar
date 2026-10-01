/**
 * FASE 26.15 — re-evaluate aanvoer queue:
 * - Tag placeholder dates
 * - Auto-publish when gate fully passes
 * - Leave essential doubt as aandacht_nodig
 * Usage: node --env-file=.env.local --import tsx scripts/reclassify-aanvoer-queue.ts
 */
import {
  classifyAdminStatus,
  isManuallySuppressed,
} from "../lib/aanvoer/admin-status";
import { getEventsSql } from "../lib/events/db";

async function main() {
  const sql = getEventsSql();
  if (!sql) {
    console.error("NO_SQL");
    process.exit(1);
  }

  const publishedBefore = (await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `) as { n: number }[];

  const rows = (await sql`
    SELECT
      e.id,
      e.title,
      e.starts_at::text AS starts_at,
      e.publication_status,
      e.eligibility_route,
      e.singles_only,
      e.singles_oriented,
      e.internal_notes,
      e.tags,
      e.city,
      e.venue_name,
      s.url AS source_url,
      (
        SELECT p.slug FROM event_editions p
        WHERE p.publication_status = 'published'
          AND p.id <> e.id
          AND lower(p.title) = lower(e.title)
          AND p.starts_at::date = e.starts_at::date
          AND e.starts_at::date < '2090-01-01'::date
        LIMIT 1
      ) AS duplicate_slug
    FROM event_editions e
    LEFT JOIN LATERAL (
      SELECT url FROM event_sources
      WHERE event_edition_id = e.id
      ORDER BY is_primary DESC LIMIT 1
    ) s ON true
    WHERE e.publication_status IN ('draft', 'under_review', 'candidate', 'rejected')
    ORDER BY e.created_at DESC
  `) as {
    id: string;
    title: string;
    starts_at: string;
    publication_status: string;
    eligibility_route: string | null;
    singles_only: boolean | null;
    singles_oriented: boolean | null;
    internal_notes: string | null;
    tags: unknown;
    city: string;
    venue_name: string | null;
    source_url: string | null;
    duplicate_slug: string | null;
  }[];

  let placeholdersCleaned = 0;
  let autoPublished = 0;
  let skippedSuppressed = 0;
  const buckets = {
    aandacht_nodig: 0,
    toegevoegd: 0,
    niet_toegevoegd: 0,
  };
  const reasons: Record<string, number> = {};
  let legacyCandidates = 0;
  let fromIntake = 0;

  for (const row of rows) {
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((t): t is string => typeof t === "string")
      : [];
    let notes = row.internal_notes ?? "";
    const isIntake =
      tags.includes("admin-intake") || /Admin Quick Intake/i.test(notes);
    if (isIntake) fromIntake += 1;
    else legacyCandidates += 1;

    if (isManuallySuppressed(tags, notes)) {
      skippedSuppressed += 1;
      buckets.niet_toegevoegd += 1;
      reasons["Handmatig weggehaald"] =
        (reasons["Handmatig weggehaald"] ?? 0) + 1;
      continue;
    }

    const year = Number(String(row.starts_at).slice(0, 4));
    const isPlaceholder = !Number.isFinite(year) || year >= 2090;
    if (isPlaceholder && !tags.includes("date_unknown")) {
      const cleanedTags = isIntake
        ? [...new Set([...tags, "date_unknown", "admin-intake"])]
        : [...new Set([...tags, "date_unknown"])];
      const stamp =
        "date_unknown=1 | Startdatum onbekend (placeholder 2099 opgeschoond, niet als eventdatum tonen).";
      const nextNotes = /date_unknown=1/.test(notes)
        ? notes
        : `${notes}\n${stamp}`.trim();
      await sql`
        UPDATE event_editions SET
          tags = ${JSON.stringify(cleanedTags)}::jsonb,
          internal_notes = ${nextNotes},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      placeholdersCleaned += 1;
      tags.push("date_unknown");
      notes = nextNotes;
      row.internal_notes = nextNotes;
    }

    if (!/fase26_15_reclassified_at=/.test(notes)) {
      const stamp = `fase26_15_reclassified_at=${new Date().toISOString()}`;
      notes = `${notes}\n${stamp}`.trim();
      await sql`
        UPDATE event_editions SET
          internal_notes = ${notes},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      row.internal_notes = notes;
    }

    const classified = classifyAdminStatus({
      publicationStatus: row.publication_status,
      startsAt: row.starts_at,
      sourceUrl: row.source_url,
      eligibilityRoute: row.eligibility_route,
      singlesOnly: row.singles_only,
      singlesOriented: row.singles_oriented,
      internalNotes: notes,
      tags,
      publishedDuplicateSlug: row.duplicate_slug,
      city: row.city,
      venueName: row.venue_name,
    });

    if (
      classified.readyToPublish &&
      row.publication_status !== "rejected" &&
      row.publication_status !== "published"
    ) {
      const now = new Date().toISOString();
      const published = (await sql`
        UPDATE event_editions
        SET
          publication_status = 'published',
          published_at = ${now}::timestamptz,
          approved_at = COALESCE(approved_at, ${now}::timestamptz),
          updated_at = now()
        WHERE id = ${row.id}::uuid
          AND publication_status IN ('draft', 'under_review', 'candidate', 'approved')
          AND NOT (COALESCE(tags, '[]'::jsonb) @> '["manual_suppressed"]'::jsonb)
        RETURNING id
      `) as { id: string }[];
      if (published[0]) {
        autoPublished += 1;
        buckets.toegevoegd += 1;
        continue;
      }
    }

    if (row.publication_status === "rejected") {
      buckets.niet_toegevoegd += 1;
    } else {
      buckets[classified.status] += 1;
    }
    if (classified.reason) {
      reasons[classified.reason] = (reasons[classified.reason] ?? 0) + 1;
    }
  }

  const publishedAfter = (await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `) as { n: number }[];

  console.log(
    JSON.stringify(
      {
        totalQueue: rows.length,
        legacyCandidates,
        fromIntake,
        placeholdersCleaned,
        autoPublished,
        skippedSuppressed,
        buckets,
        reasons,
        publishedBefore: publishedBefore[0]?.n ?? null,
        publishedAfter: publishedAfter[0]?.n ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
