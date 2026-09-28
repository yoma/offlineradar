/**
 * Evidence-based freshness backfill from successful refresh matches.
 * Does NOT invent dates. Only uses completed ok runs with existing_unchanged items.
 *
 * Usage: node --env-file=.env.local --import tsx scripts/backfill-freshness-from-refresh.ts
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() !== expectedNeonProjectId()) {
    console.error(`FAIL project must be ${expectedNeonProjectId()}`);
    process.exit(1);
  }
  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL SQL unavailable");
    process.exit(1);
  }

  const pubBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const pubBeforeN = (pubBefore[0] as { n: number }).n;

  const editionUpdates = await sql`
    WITH latest AS (
      SELECT
        i.match_event_edition_id AS edition_id,
        max(r.completed_at) AS verified_at
      FROM source_refresh_items i
      JOIN source_refresh_runs r ON r.id = i.refresh_run_id
      WHERE i.detection_type = 'existing_unchanged'
        AND i.match_event_edition_id IS NOT NULL
        AND r.status = 'completed'
        AND r.fetch_state = 'ok'
        AND r.completed_at IS NOT NULL
        AND (r.error IS NULL OR r.error = '')
      GROUP BY i.match_event_edition_id
    )
    UPDATE event_editions e
    SET
      source_checked_at = latest.verified_at,
      last_checked_at = latest.verified_at,
      updated_at = now()
    FROM latest
    WHERE e.id = latest.edition_id
      AND (
        e.source_checked_at IS NULL
        OR e.source_checked_at < latest.verified_at
        OR e.last_checked_at IS NULL
        OR e.last_checked_at < latest.verified_at
      )
    RETURNING e.id, e.title, e.source_checked_at
  `;

  const catalogUpdates = await sql`
    WITH latest AS (
      SELECT
        catalog_source_id,
        max(completed_at) AS verified_at
      FROM source_refresh_runs
      WHERE status = 'completed'
        AND fetch_state = 'ok'
        AND completed_at IS NOT NULL
        AND (error IS NULL OR error = '')
      GROUP BY catalog_source_id
    )
    UPDATE catalog_sources c
    SET
      last_checked_at = latest.verified_at,
      updated_at = now()
    FROM latest
    WHERE c.id = latest.catalog_source_id
      AND (
        c.last_checked_at IS NULL
        OR c.last_checked_at < latest.verified_at
      )
    RETURNING c.id, c.name, c.last_checked_at
  `;

  // Clear import/update stamps that were never proven by a successful refresh.
  // Public freshness uses source_checked_at only — do not invent dates.
  const cleared = await sql`
    WITH evidenced AS (
      SELECT DISTINCT i.match_event_edition_id AS edition_id
      FROM source_refresh_items i
      JOIN source_refresh_runs r ON r.id = i.refresh_run_id
      WHERE i.detection_type = 'existing_unchanged'
        AND i.match_event_edition_id IS NOT NULL
        AND r.status = 'completed'
        AND r.fetch_state = 'ok'
    )
    UPDATE event_editions e
    SET
      source_checked_at = NULL,
      updated_at = now()
    WHERE e.publication_status = 'published'
      AND e.source_checked_at IS NOT NULL
      AND e.id NOT IN (SELECT edition_id FROM evidenced)
      AND e.created_at IS NOT NULL
      AND e.source_checked_at::date = e.created_at::date
    RETURNING e.id
  `;

  const pubAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const pubAfterN = (pubAfter[0] as { n: number }).n;
  if (pubAfterN !== pubBeforeN) {
    console.error(`FAIL published count changed ${pubBeforeN} → ${pubAfterN}`);
    process.exit(1);
  }

  const dist = await sql`
    SELECT
      count(*)::int AS published,
      count(DISTINCT source_checked_at::date)::int AS distinct_src_days,
      count(DISTINCT last_checked_at::date)::int AS distinct_last_days,
      count(*) FILTER (
        WHERE source_checked_at IS NOT NULL
      )::int AS with_real_source_check,
      count(*) FILTER (
        WHERE source_checked_at IS NULL
      )::int AS unknown_public_freshness
    FROM event_editions
    WHERE publication_status = 'published'
  `;

  console.log(
    JSON.stringify(
      {
        editionRowsUpdated: editionUpdates.length,
        catalogRowsUpdated: catalogUpdates.length,
        importStampsCleared: cleared.length,
        published: pubAfterN,
        distribution: dist[0],
        sampleEditions: editionUpdates.slice(0, 5).map((row) => ({
          id: (row as { id: string }).id,
          title: String((row as { title: string }).title).slice(0, 50),
          sourceCheckedAt: (row as { source_checked_at: string }).source_checked_at,
        })),
        sampleCatalog: catalogUpdates.map((row) => ({
          name: (row as { name: string }).name,
          lastCheckedAt: (row as { last_checked_at: string }).last_checked_at,
        })),
      },
      null,
      2,
    ),
  );
  console.log("\nOK: freshness backfill from refresh evidence.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
