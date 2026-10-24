/**
 * Neon Instagram publishes table smoke (no Meta publish).
 */
import assert from "node:assert/strict";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  claimPublishAttempt,
  finishPublishAttempt,
  findActivePublish,
} from "../lib/instagram/publish-store";

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

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'instagram_publishes'
  `;
  assert.equal(tables.length, 1, "instagram_publishes must exist");

  const pubBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const pubBeforeN = (pubBefore[0] as { n: number }).n;

  const conceptKey = `verify3b${Date.now().toString(16)}`.padEnd(16, "0").slice(0, 64);
  const claim1 = await claimPublishAttempt({
    conceptKey,
    format: "deze_week",
    eventIds: ["probe-a"],
    caption: "probe",
    slideCount: 1,
    dryRun: true,
    requestedBy: "verify-script",
  });
  assert.equal(claim1.ok, true);
  if (!claim1.ok) process.exit(1);
  assert.equal(claim1.created, true);

  const claim2 = await claimPublishAttempt({
    conceptKey,
    format: "deze_week",
    eventIds: ["probe-a"],
    caption: "probe",
    slideCount: 1,
    dryRun: true,
  });
  assert.equal(claim2.ok, true);
  if (!claim2.ok) process.exit(1);
  assert.equal(claim2.created, false, "second claim must not create");
  assert.equal(claim2.row.id, claim1.row.id);

  await finishPublishAttempt(claim1.row.id, {
    status: "published",
    metaMediaId: "media_probe",
  });
  const active = await findActivePublish(conceptKey);
  assert.ok(active);
  assert.equal(active?.status, "published");
  assert.equal(active?.metaMediaId, "media_probe");

  await sql`DELETE FROM instagram_publishes WHERE concept_key = ${conceptKey}`;

  const pubAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  assert.equal((pubAfter[0] as { n: number }).n, pubBeforeN);

  console.log("OK: table present");
  console.log("OK: claim is idempotent while pending");
  console.log("OK: published row retained with meta id");
  console.log("OK: published event count unchanged");
  console.log("\nOK: Instagram publishes Neon verify.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
