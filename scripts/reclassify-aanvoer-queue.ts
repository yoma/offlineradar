/**
 * FASE 26.13 — one-time safe reclassification of aanvoer queue items.
 * - Tags placeholder dates (2099) as date_unknown (never shown as real dates)
 * - Does NOT auto-publish
 * Usage: node --env-file=.env.local --import tsx scripts/reclassify-aanvoer-queue.ts
 */
import { classifyAdminStatus } from "../lib/aanvoer/admin-status";
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
    WHERE e.publication_status IN ('draft', 'under_review', 'candidate')
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
  const buckets = {
    klaar_om_toe_te_voegen: 0,
    controle_nodig: 0,
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
    const notes = row.internal_notes ?? "";
    const isIntake =
      tags.includes("admin-intake") || /Admin Quick Intake/i.test(notes);
    if (isIntake) fromIntake += 1;
    else legacyCandidates += 1;

    const year = Number(String(row.starts_at).slice(0, 4));
    const isPlaceholder = !Number.isFinite(year) || year >= 2090;
    if (isPlaceholder && !tags.includes("date_unknown")) {
      const nextTags = [...new Set([...tags, "date_unknown", "admin-intake"].filter(Boolean))];
      // Keep admin-intake only if already intake; otherwise don't invent intake tag
      const cleanedTags = isIntake
        ? nextTags
        : [...new Set([...tags, "date_unknown"])];
      const stamp =
        "date_unknown=1 | Startdatum onbekend (placeholder 2099 opgeschoond, niet als eventdatum tonen).";
      const nextNotes = /date_unknown=1/.test(notes)
        ? notes.replace(/Startdatum onbekend; placeholder 2099-12-31\./g, stamp)
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
      row.internal_notes = nextNotes;
    } else if (
      /placeholder 2099/i.test(notes) &&
      !/date_unknown=1/.test(notes)
    ) {
      const nextNotes = notes.replace(
        /Startdatum onbekend; placeholder 2099-12-31\./gi,
        "date_unknown=1 | Startdatum onbekend (placeholder niet als eventdatum tonen).",
      );
      await sql`
        UPDATE event_editions SET
          internal_notes = ${nextNotes},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      placeholdersCleaned += 1;
      row.internal_notes = nextNotes;
    }

    // Stamp reclassification (idempotent)
    if (!/fase26_13_reclassified_at=/.test(row.internal_notes ?? "")) {
      const stamp = `fase26_13_reclassified_at=${new Date().toISOString()}`;
      const nextNotes = `${row.internal_notes ?? ""}\n${stamp}`.trim();
      await sql`
        UPDATE event_editions SET
          internal_notes = ${nextNotes},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      row.internal_notes = nextNotes;
    }

    const classified = classifyAdminStatus({
      publicationStatus: row.publication_status,
      startsAt: row.starts_at,
      sourceUrl: row.source_url,
      eligibilityRoute: row.eligibility_route,
      singlesOnly: row.singles_only,
      singlesOriented: row.singles_oriented,
      internalNotes: row.internal_notes,
      tags,
      publishedDuplicateSlug: row.duplicate_slug,
      city: row.city,
      venueName: row.venue_name,
    });
    buckets[classified.status] += 1;
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
        buckets,
        reasons,
        publishedBefore: publishedBefore[0]?.n ?? null,
        publishedAfter: publishedAfter[0]?.n ?? null,
        autoPublished: false,
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
