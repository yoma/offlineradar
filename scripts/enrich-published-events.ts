/**
 * One-time soft enrichment of the 7 published editions:
 * consumer-friendly availability notes only (no invented facts).
 * Usage: npm run enrich:published-events
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";

/** Known technical notes → short consumer detail text. Capacity status unchanged. */
const NOTE_UPDATES: Record<string, string | null> = {
  "singles-night-out-antwerp-2026-10-14":
    "Beschikbaarheid onbekend — controleer bij de organisator.",
  "apero-solo-mechelen-2026-10-02":
    "Inschrijving via telefoon of mail; restplaatsen niet online zichtbaar.",
  "embodied-dating-club-antwerp-2026-10-07":
    "Voor mannen geldt een wachtlijst. Controleer actuele tickets bij de organisator.",
  "speeddate-antwerpen-53-65-2026-10-12":
    "Vrouwen: volzet. Mannen: bijna volzet.",
  "speeddate-antwerpen-hogeropgeleiden-25-35-2026-10-21":
    "Mannen: volzet. Vrouwen: bijna volzet.",
  "love-on-the-rooftop-antwerp-2026-10-21":
    "Restplaatsen niet expliciet vermeld — controleer bij de organisator.",
  "singles-bowling-antwerpen-2026-10-24":
    "Sommige leeftijdsgroepen zijn beperkt of volzet. Controleer bij de organisator.",
};

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() !== expectedNeonProjectId()) {
    console.error("FAIL project mismatch");
    process.exit(1);
  }
  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL SQL unavailable");
    process.exit(1);
  }

  const tipBefore = await sql`SELECT count(*)::int AS n FROM tips`;
  let updated = 0;
  for (const [slug, note] of Object.entries(NOTE_UPDATES)) {
    const rows = await sql`
      UPDATE event_editions
      SET availability_note = ${note}, updated_at = now()
      WHERE slug = ${slug}
        AND publication_status = 'published'
      RETURNING slug
    `;
    if (rows[0]) {
      updated += 1;
      console.log("updated", slug);
    } else {
      console.warn("skip", slug);
    }
  }

  const mingle = await sql`
    SELECT publication_status FROM event_editions
    WHERE slug = 'mingle-night-how-to-be-single-2026-10-17'
    LIMIT 1
  `;
  if ((mingle[0] as { publication_status: string } | undefined)?.publication_status !== "under_review") {
    console.error("FAIL Mingle status changed");
    process.exit(1);
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  if ((tipAfter[0] as { n: number }).n !== (tipBefore[0] as { n: number }).n) {
    console.error("FAIL tip count changed");
    process.exit(1);
  }

  console.log(JSON.stringify({ updated, tipCount: (tipAfter[0] as { n: number }).n }, null, 2));
  console.log("\nOK: published availability notes softened.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
