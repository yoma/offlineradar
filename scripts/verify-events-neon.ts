/**
 * Neon integration tests for events catalog on OfflineRadar only.
 * Creates temporary rows and deletes them. Does not leave production events.
 * Usage: npm run verify:events-neon
 */
import assert from "node:assert/strict";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  attachImage,
  attachSource,
  createEdition,
  createOrganizer,
  createSeries,
  deleteEditionHard,
  deleteOrganizerHard,
  getEditionById,
  getEditionBySlug,
  getOrganizerById,
  listEditions,
  listPublishedEditions,
  updateEditionPublication,
} from "../lib/events/neon-store";
import { mapEditionToConsumerEvent } from "../lib/events/map-to-consumer";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  const projectId = process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim();
  if (projectId !== expectedNeonProjectId()) {
    console.error(
      `FAIL project id must be ${expectedNeonProjectId()} (got ${projectId ?? "missing"})`,
    );
    process.exit(1);
  }

  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL SQL unavailable");
    process.exit(1);
  }

  const tipBefore = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipBeforeN = (tipBefore[0] as { n: number }).n;

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'organizers','event_series','event_editions','event_sources','event_images',
        'tips','tip_reviews'
      )
  `;
  assert.ok(tables.length >= 7);
  ok("event + tip tables exist");

  const stamp = Date.now();
  const organizer = await createOrganizer({
    slug: `phase1-test-org-${stamp}`,
    name: "Phase1 Test Org",
    websiteUrl: "https://example.com/phase1-org",
  });
  assert.ok(organizer);
  const reOrg = await getOrganizerById(organizer!.id);
  assert.equal(reOrg?.name, "Phase1 Test Org");
  ok("organizer create/read");

  const series = await createSeries({
    organizerId: organizer!.id,
    slug: `phase1-series-${stamp}`,
    name: "Phase1 Optional Series",
  });
  assert.ok(series);
  ok("optional series create");

  const edition = await createEdition({
    slug: `phase1-edition-${stamp}`,
    organizerId: organizer!.id,
    seriesId: series!.id,
    title: "Phase1 Temporary Test Edition",
    startsAt: "2026-11-01T18:00:00.000Z",
    city: "Antwerpen",
    region: "Antwerpen",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: null,
    minAge: 30,
    maxAge: 45,
    ageRule: "guideline",
    publicationStatus: "approved",
    approvedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    shortDescription: "Temporary Phase 1 test row",
  });
  assert.ok(edition);
  assert.equal(edition!.publicationStatus, "approved");
  assert.equal(edition!.publishedAt, null);
  ok("edition create/read fields");

  const withoutSeries = await createEdition({
    slug: `phase1-edition-noseries-${stamp}`,
    organizerId: organizer!.id,
    title: "Phase1 Edition Without Series",
    startsAt: "2026-11-02T18:00:00.000Z",
    city: "Gent",
    publicationStatus: "draft",
  });
  assert.ok(withoutSeries);
  assert.equal(withoutSeries!.seriesId, null);
  ok("edition without series works");

  const src1 = await attachSource({
    eventEditionId: edition!.id,
    sourceType: "official_event",
    url: "https://example.com/phase1-a",
    normalizedUrl: `https://example.com/phase1-a-${stamp}`,
    isPrimary: true,
    sourceName: "Official",
  });
  const src2 = await attachSource({
    eventEditionId: edition!.id,
    sourceType: "ticket",
    url: "https://example.com/phase1-b",
    normalizedUrl: `https://example.com/phase1-b-${stamp}`,
    isPrimary: false,
  });
  assert.ok(src1?.isPrimary);
  assert.ok(src2 && !src2.isPrimary);
  ok("multiple sources + primary");

  const img1 = await attachImage({
    eventEditionId: edition!.id,
    urlOrPath: "/preview-mood/test.png",
    imageType: "mood",
    isPrimary: true,
    altText: "test mood",
    rightsNote: "test only",
  });
  const img2 = await attachImage({
    eventEditionId: edition!.id,
    urlOrPath: "https://example.com/photo.jpg",
    imageType: "official",
    isPrimary: false,
  });
  assert.ok(img1?.isPrimary);
  assert.ok(img2);
  ok("multiple images + provenance");

  const publishedListBefore = await listPublishedEditions(50);
  assert.ok(
    !publishedListBefore.some((e) => e.id === edition!.id),
    "approved edition must not appear in listPublished",
  );
  ok("listPublished excludes approved");

  let threw = false;
  try {
    await updateEditionPublication({
      id: edition!.id,
      publicationStatus: "published",
      publishedAt: null,
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
  ok("published without publishedAt rejected in store");

  const published = await updateEditionPublication({
    id: edition!.id,
    publicationStatus: "published",
    publishedAt: new Date().toISOString(),
    approvedAt: edition!.approvedAt,
  });
  assert.equal(published?.publicationStatus, "published");
  const publishedList = await listPublishedEditions(200);
  assert.ok(publishedList.some((e) => e.id === edition!.id));
  ok("listPublished includes only published");

  const bundle = await getEditionById(edition!.id);
  assert.ok(bundle);
  assert.equal(bundle!.sources.length, 2);
  assert.equal(bundle!.images.length, 2);
  const bySlug = await getEditionBySlug(edition!.slug);
  assert.equal(bySlug?.edition.id, edition!.id);

  const consumer = mapEditionToConsumerEvent(bundle!);
  assert.equal(consumer.eligibilityAgeRule, "guideline");
  assert.equal(consumer.singlesOnly, null);
  assert.equal(consumer.singlesOriented, true);
  assert.equal(consumer.listingPath, "organic");
  assert.ok(consumer.lastCheckedAt);
  ok("bundle → consumer Event via Neon data");

  const all = await listEditions(500);
  assert.ok(all.some((e) => e.id === edition!.id));

  // Cleanup temporary rows (cascade sources/images; series then editions; organizer)
  assert.equal(await deleteEditionHard(edition!.id), true);
  assert.equal(await deleteEditionHard(withoutSeries!.id), true);
  await sql`DELETE FROM event_series WHERE id = ${series!.id}`;
  assert.equal(await deleteOrganizerHard(organizer!.id), true);
  ok("temporary test rows removed");

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  assert.equal((tipAfter[0] as { n: number }).n, tipBeforeN);
  ok("tip row count unchanged");

  console.log(
    `\nOK: events Neon catalog on project ${expectedNeonProjectId()}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
