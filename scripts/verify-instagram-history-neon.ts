/**
 * Neon Instagram concept-history: upsert + recent-read (no Meta publish).
 * Usage: npm run verify:instagram-history-neon
 */
import assert from "node:assert/strict";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  getRecentlyUsedEventIds,
  recordConceptEventIds,
} from "../lib/instagram/history";

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() !== expectedNeonProjectId()) {
    console.error(`FAIL wrong Neon project`);
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

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'instagram_concept_history'
  `;
  assert.equal(tables.length, 1, "instagram_concept_history must exist");
  console.log("OK: table present");

  const probeId = `__ig_verify_${Date.now()}__`;
  const first = await recordConceptEventIds([probeId, probeId]);
  assert.equal(first.stored, "neon");
  assert.equal(first.count, 1, "duplicate ids in one call collapse");
  console.log("OK: upsert dedupes within batch");

  const second = await recordConceptEventIds([probeId]);
  assert.equal(second.stored, "neon");
  assert.equal(second.count, 1);

  const rows = await sql`
    SELECT count(*)::int AS n FROM instagram_concept_history WHERE event_id = ${probeId}
  `;
  assert.equal((rows[0] as { n: number }).n, 1, "no duplicate rows after re-approve");
  console.log("OK: re-approve does not duplicate rows");

  const recent = await getRecentlyUsedEventIds(21);
  assert.ok(recent.has(probeId), "probe id appears in recent set");
  console.log("OK: recent-used read");

  await sql`DELETE FROM instagram_concept_history WHERE event_id = ${probeId}`;

  const pubAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  assert.equal(
    (pubAfter[0] as { n: number }).n,
    pubBeforeN,
    "published events must not change",
  );
  console.log("OK: published event count unchanged");

  console.log("\nOK: Instagram concept-history Neon verify.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
