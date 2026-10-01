/**
 * Audit published event images for semantic mismatches (FASE 26.19).
 * Read-only by default. Pass --fix to replace incompatible mood images.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/audit-semantic-event-images.ts
 *   node --env-file=.env.local --import tsx scripts/audit-semantic-event-images.ts --fix
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  inferRequiredImageCategory,
  isImageCompatibleWithEvent,
  resolvePublicEventImage,
  eventImageDiversityKey,
} from "../lib/image-compatibility";
import { buildVisualProfile } from "../lib/event-visual-profile";
import type { ActivityId } from "../types/event";

async function main() {
  const doFix = process.argv.includes("--fix");
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

  const pubBefore =
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`;

  const rows = (await sql`
    SELECT e.id AS edition_id, e.slug, e.title, e.category, e.activities, e.tags,
           e.sub_category, e.min_age, e.max_age,
           e.organizer_id,
           i.id AS image_id, i.url_or_path, i.image_type, i.rights_note
    FROM event_editions e
    LEFT JOIN event_images i ON i.event_edition_id = e.id AND i.is_primary = true
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
    min_age: number | null;
    max_age: number | null;
    organizer_id: string | null;
    image_id: string | null;
    url_or_path: string | null;
    image_type: string | null;
    rights_note: string | null;
  }[];

  let audited = 0;
  let mismatches = 0;
  let replaced = 0;
  const samples: Array<{
    slug: string;
    title: string;
    activity: string;
    before: string | null;
    compatible: boolean;
  }> = [];

  for (const row of rows) {
    audited++;
    const ctx = {
      category: row.category as "dating" | "meet_new_people" | "social",
      activities: (row.activities ?? []) as ActivityId[],
      tags: row.tags ?? [],
      title: row.title,
      subCategory: row.sub_category,
      minAge: row.min_age,
      maxAge: row.max_age,
    };
    const profile = buildVisualProfile(ctx);
    const current = row.url_or_path;
    const adminLocked = /admin_selected=1/i.test(row.rights_note ?? "");
    const compatible =
      !current ||
      adminLocked ||
      isImageCompatibleWithEvent(ctx, current);

    if (!compatible) {
      mismatches++;
      samples.push({
        slug: row.slug,
        title: row.title,
        activity: profile.primaryActivity,
        before: current,
        compatible: false,
      });

      if (doFix && row.image_id && !adminLocked) {
        const key = eventImageDiversityKey({
          eventId: row.edition_id,
          organizerId: row.organizer_id,
          imageCategory: inferRequiredImageCategory(ctx),
        });
        const resolved = resolvePublicEventImage(ctx, null, true, key);
        await sql`
          UPDATE event_images SET
            url_or_path = ${resolved.url},
            image_type = 'mood',
            alt_text = ${`Sfeerbeeld · ${profile.primaryActivity}`},
            rights_note = ${`semantic_fix_2619=1; why=${(resolved.why ?? []).join("|").slice(0, 200)}`}
          WHERE id = ${row.image_id}::uuid
        `;
        replaced++;
      }
    }
  }

  const pubAfter =
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`;
  if (
    (pubBefore[0] as { n: number }).n !== (pubAfter[0] as { n: number }).n
  ) {
    console.error("FAIL published count changed");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        audited,
        mismatches,
        replaced: doFix ? replaced : 0,
        mode: doFix ? "fix" : "audit",
        samples: samples.slice(0, 25),
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
