/**
 * Publish the 7 Phase-2 approved preview editions.
 * Never publishes Mingle Night (under_review) or any non-approved status.
 * Usage: npm run publish:preview-events
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { PREVIEW_IMPORT_DECISIONS } from "../data/pilot/preview-import-decisions";

const APPROVED_SLUGS = PREVIEW_IMPORT_DECISIONS.filter(
  (d) => d.publicationStatus === "approved",
).map((d) => d.slug);

const MINGLE_SLUG = "mingle-night-how-to-be-single-2026-10-17";

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  const projectId = process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim();
  if (projectId !== expectedNeonProjectId()) {
    console.error(
      `FAIL project must be ${expectedNeonProjectId()} (got ${projectId ?? "missing"})`,
    );
    process.exit(1);
  }
  if (APPROVED_SLUGS.length !== 7) {
    console.error(`FAIL expected 7 approved slugs, got ${APPROVED_SLUGS.length}`);
    process.exit(1);
  }
  if (APPROVED_SLUGS.includes(MINGLE_SLUG)) {
    console.error("FAIL Mingle must not be in approved publish list");
    process.exit(1);
  }

  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL SQL unavailable");
    process.exit(1);
  }

  const tipBefore = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipBeforeN = (tipBefore[0] as { n: number }).n;

  const before = await sql`
    SELECT slug, publication_status, published_at
    FROM event_editions
    ORDER BY slug
  `;
  console.log(
    "before",
    (before as { slug: string; publication_status: string }[]).map(
      (r) => `${r.slug}:${r.publication_status}`,
    ),
  );

  for (const slug of APPROVED_SLUGS) {
    const rows = await sql`
      UPDATE event_editions
      SET
        publication_status = 'published',
        published_at = now(),
        updated_at = now()
      WHERE slug = ${slug}
        AND publication_status = 'approved'
      RETURNING slug, publication_status, published_at
    `;
    if (!rows[0]) {
      console.error(`FAIL could not publish ${slug} (not approved or missing)`);
      process.exit(1);
    }
    console.log("published", (rows[0] as { slug: string }).slug);
  }

  const mingle = await sql`
    SELECT slug, publication_status, published_at
    FROM event_editions
    WHERE slug = ${MINGLE_SLUG}
    LIMIT 1
  `;
  const mingleRow = mingle[0] as
    | { slug: string; publication_status: string; published_at: string | null }
    | undefined;
  if (!mingleRow || mingleRow.publication_status !== "under_review") {
    console.error(
      `FAIL Mingle must stay under_review (got ${mingleRow?.publication_status ?? "missing"})`,
    );
    process.exit(1);
  }
  if (mingleRow.published_at) {
    console.error("FAIL Mingle has published_at");
    process.exit(1);
  }

  const published = await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE publication_status = 'published'
  `;
  const publishedN = (published[0] as { n: number }).n;
  if (publishedN !== 7) {
    console.error(`FAIL expected 7 published, got ${publishedN}`);
    process.exit(1);
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipAfterN = (tipAfter[0] as { n: number }).n;
  if (tipAfterN !== tipBeforeN) {
    console.error(`FAIL tip count changed ${tipBeforeN} → ${tipAfterN}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        project: expectedNeonProjectId(),
        published: publishedN,
        mingle: mingleRow.publication_status,
        tipCount: tipAfterN,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: 7 approved → published; Mingle under_review.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
