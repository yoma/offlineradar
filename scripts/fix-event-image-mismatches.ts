/**
 * Fix published event_images that are semantically incompatible with the event.
 * Never changes publication_status. OfflineRadar Neon only.
 *
 * Usage: node --env-file=.env.local --import tsx scripts/fix-event-image-mismatches.ts
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  CATEGORY_MOOD_URLS,
  inferRequiredImageCategory,
  isImageCompatibleWithEvent,
  type ImageCategory,
} from "../lib/image-compatibility";
import type { ActivityId } from "../types/event";

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(check.error);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() !== expectedNeonProjectId()) {
    console.error("Wrong Neon project");
    process.exit(1);
  }
  const sql = getEventsSql();
  if (!sql) {
    console.error("SQL unavailable");
    process.exit(1);
  }

  const tipBefore = await sql`SELECT count(*)::int AS n FROM tips`;
  const pubBefore =
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`;

  const rows = (await sql`
    SELECT e.id AS edition_id, e.slug, e.title, e.category, e.activities, e.tags,
           e.sub_category, i.id AS image_id, i.url_or_path, i.alt_text, i.image_type
    FROM event_editions e
    JOIN event_images i ON i.event_edition_id = e.id AND i.is_primary = true
    WHERE e.publication_status = 'published'
    ORDER BY e.starts_at ASC
  `) as {
    edition_id: string;
    slug: string;
    title: string;
    category: string;
    activities: ActivityId[] | null;
    tags: string[] | null;
    sub_category: string | null;
    image_id: string;
    url_or_path: string;
    alt_text: string | null;
    image_type: string;
  }[];

  const mismatches: Array<{
    slug: string;
    title: string;
    before: string;
    after: string;
    required: ImageCategory;
  }> = [];

  for (const row of rows) {
    const ctx = {
      category: row.category as "dating" | "meet_new_people" | "social",
      activities: (row.activities ?? []) as ActivityId[],
      tags: row.tags ?? [],
      title: row.title,
      subCategory: row.sub_category,
    };
    if (isImageCompatibleWithEvent(ctx, row.url_or_path)) continue;

    const required = inferRequiredImageCategory(ctx);
    const after =
      required === "neutral"
        ? CATEGORY_MOOD_URLS.generic_social
        : CATEGORY_MOOD_URLS[required];
    const alt =
      required === "outdoor"
        ? "Sfeerbeeld outdoor singles wandeling"
        : required === "travel"
          ? "Sfeerbeeld singles weekend / reizen"
          : required === "drinks"
            ? "Sfeerbeeld singles borrel"
            : `Sfeerbeeld ${required.replace("_", " ")}`;

    await sql`
      UPDATE event_images
      SET
        url_or_path = ${after},
        alt_text = ${alt},
        image_type = 'mood',
        rights_note = 'Corrected incompatible mood asset (fase 10.1 image validation)'
      WHERE id = ${row.image_id}
    `;

    mismatches.push({
      slug: row.slug,
      title: row.title,
      before: row.url_or_path,
      after,
      required,
    });
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  const pubAfter =
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`;

  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        fixed: mismatches.length,
        mismatches,
        tipsUnchanged:
          (tipBefore[0] as { n: number }).n === (tipAfter[0] as { n: number }).n,
        publishedUnchanged:
          (pubBefore[0] as { n: number }).n === (pubAfter[0] as { n: number }).n,
        published: (pubAfter[0] as { n: number }).n,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
