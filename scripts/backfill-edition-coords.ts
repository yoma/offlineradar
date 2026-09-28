/**
 * Backfill missing edition lat/lng from known city centers.
 * Usage: node --env-file=.env.local --import tsx scripts/backfill-edition-coords.ts
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { coordsForCity } from "../lib/geo-cities";

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

  const rows = await sql`
    SELECT id, city, latitude, longitude
    FROM event_editions
    WHERE publication_status = 'published'
      AND (latitude IS NULL OR longitude IS NULL)
  `;

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const coords = coordsForCity(String(row.city ?? ""));
    if (!coords) {
      skipped++;
      continue;
    }
    await sql`
      UPDATE event_editions
      SET
        latitude = ${coords.lat},
        longitude = ${coords.lng},
        updated_at = now()
      WHERE id = ${row.id as string}
        AND (latitude IS NULL OR longitude IS NULL)
    `;
    updated++;
  }

  const stillMissing = await sql`
    SELECT count(*)::int AS n
    FROM event_editions
    WHERE publication_status = 'published'
      AND (latitude IS NULL OR longitude IS NULL)
  `;

  console.log(
    JSON.stringify(
      {
        candidates: rows.length,
        updated,
        skippedUnknownCity: skipped,
        stillMissing: (stillMissing[0] as { n: number }).n,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: edition coords backfill");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
