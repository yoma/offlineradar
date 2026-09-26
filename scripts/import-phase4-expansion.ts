/**
 * Fase 4: import curated expansion + resolve/publish Mingle.
 * Usage: npm run import:phase4-expansion
 * Tips untouched. No crawler.
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { mapConsumerEventToCatalogDraft } from "../lib/events/from-preview";
import {
  attachImage,
  attachSource,
  getEditionBySlug,
  upsertEditionBySlug,
  upsertOrganizerBySlug,
  upsertSeriesBySlug,
  updateEditionPublication,
} from "../lib/events/neon-store";
import {
  buildPhase4ExpansionBatch,
  eligibilityJsonFor,
  PHASE4_MINGLE_PATCH,
  type Phase4BatchItem,
} from "../data/pilot/phase4-expansion-batch";
import type { PreviewImportDecision } from "../data/pilot/preview-import-decisions";
import type { Event } from "../types/event";
import { buildRealPreviewEvents } from "../data/pilot/real-preview-events";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

function startsAtIso(date: string, time: string | null): string {
  const t = time ?? "00:00";
  return `${date}T${t}:00+02:00`;
}

function endsAtIso(
  date: string,
  endTime: string | null,
): string | null {
  if (!endTime) return null;
  return `${date}T${endTime}:00+02:00`;
}

function applyDecision(event: Event, decision: PreviewImportDecision) {
  const checkedAt = new Date().toISOString();
  const draft = mapConsumerEventToCatalogDraft(event);

  draft.organizer = {
    slug: decision.organizerSlug,
    name: decision.organizerName,
    websiteUrl: decision.organizerWebsite,
  };

  draft.edition = {
    ...draft.edition,
    slug: decision.slug,
    startsAt: startsAtIso(event.startDate, decision.startTime),
    endsAt: endsAtIso(event.startDate, decision.endTime),
    eligibilityRoute: decision.eligibilityRoute,
    singlesOriented: decision.singlesOriented,
    singlesOnly: decision.singlesOnly,
    singlesOnlyEvidence: decision.singlesOnlyEvidence,
    minAge: decision.minAge,
    maxAge: decision.maxAge,
    ageRule: decision.ageRule,
    eligibilityJson: eligibilityJsonFor(decision),
    priceAmount: decision.priceAmount,
    priceIsFrom: decision.priceIsFrom,
    priceNote: decision.priceNote,
    availabilityStatus: decision.availabilityStatus,
    availabilityNote: decision.availabilityNote,
    genderAvailability: decision.genderAvailability,
    startTimeDisplayNote: decision.startTimeDisplayNote,
    publicationStatus: decision.publicationStatus,
    approvedAt:
      decision.publicationStatus === "approved" ||
      decision.publicationStatus === ("published" as string)
        ? checkedAt
        : null,
    publishedAt: null,
    lastCheckedAt: checkedAt,
    sourceCheckedAt: checkedAt,
    internalNotes: [
      `batch_id=${decision.previewId}`,
      ...decision.reviewNotes,
      ...decision.changesVsPreview.map((c) => `change: ${c}`),
      ...decision.conflicts.map((c) => `conflict: ${c}`),
    ].join("\n"),
  };

  const sources = [
    {
      sourceType: "official_event" as const,
      url: decision.primarySourceUrl,
      normalizedUrl: normalizeUrl(decision.primarySourceUrl),
      sourceName: event.sourceName,
      isPrimary: true,
      checkedAt,
      evidenceNote: decision.reviewNotes[0] ?? null,
    },
    ...decision.extraSources.map((s) => ({
      sourceType: s.sourceType,
      url: s.url,
      normalizedUrl: normalizeUrl(s.url),
      sourceName: s.sourceName,
      isPrimary: s.isPrimary,
      checkedAt,
      evidenceNote: null as string | null,
    })),
  ];

  const byUrl = new Map<string, (typeof sources)[number]>();
  for (const s of sources) {
    const prev = byUrl.get(s.normalizedUrl);
    if (!prev || s.isPrimary) byUrl.set(s.normalizedUrl, s);
  }
  draft.sources = [...byUrl.values()];
  draft.images = event.imageUrl
    ? [
        {
          urlOrPath: event.imageUrl,
          imageType: event.imageIsAtmosphere ? "mood" : "official",
          isPrimary: true,
          altText: event.imageAlt ?? null,
          rightsNote: event.imageIsAtmosphere
            ? "Sfeerbeeld; geen officiële editiefoto."
            : null,
        },
      ]
    : [];

  return { draft, checkedAt };
}

async function upsertBatchItem(item: Phase4BatchItem) {
  const { draft } = applyDecision(item.event, item.decision);
  const org = await upsertOrganizerBySlug(draft.organizer);
  if (!org) throw new Error(`organizer upsert ${item.decision.organizerSlug}`);

  let seriesId: string | null = null;
  if (item.decision.seriesSlug && item.decision.seriesName) {
    const series = await upsertSeriesBySlug({
      organizerId: org.record.id,
      slug: item.decision.seriesSlug,
      name: item.decision.seriesName,
    });
    if (!series) throw new Error(`series upsert ${item.decision.seriesSlug}`);
    seriesId = series.record.id;
  }

  const editionResult = await upsertEditionBySlug({
    ...draft.edition,
    organizerId: org.record.id,
    seriesId,
    publishedAt: null,
  });
  if (!editionResult) throw new Error(`edition upsert ${item.decision.slug}`);

  for (const source of draft.sources) {
    await attachSource({
      eventEditionId: editionResult.record.id,
      ...source,
    });
  }

  const bundle = await getEditionBySlug(item.decision.slug);
  const existingPaths = new Set(
    (bundle?.images ?? []).map((img) => img.urlOrPath),
  );
  for (const image of draft.images) {
    if (existingPaths.has(image.urlOrPath)) continue;
    await attachImage({
      eventEditionId: editionResult.record.id,
      ...image,
    });
  }

  return editionResult;
}

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

  const tipBefore = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipBeforeN = (tipBefore[0] as { n: number }).n;

  const batch = buildPhase4ExpansionBatch();
  if (batch.length < 10 || batch.length > 16) {
    console.error(`FAIL unexpected batch size ${batch.length}`);
    process.exit(1);
  }

  // Duplicate slug guard vs existing + within batch
  const batchSlugs = batch.map((b) => b.decision.slug);
  if (new Set(batchSlugs).size !== batchSlugs.length) {
    console.error("FAIL duplicate slugs inside batch");
    process.exit(1);
  }

  const existing = await sql`SELECT slug FROM event_editions`;
  const existingSlugs = new Set(
    (existing as { slug: string }[]).map((r) => r.slug),
  );
  for (const slug of batchSlugs) {
    if (existingSlugs.has(slug)) {
      console.log(`note: updating existing slug ${slug}`);
    }
  }

  // 1) Patch Mingle from existing preview event + PHASE4 decision
  const previewEvents = buildRealPreviewEvents();
  const mingleEvent = previewEvents.find(
    (e) => e.slug === PHASE4_MINGLE_PATCH.slug,
  );
  if (!mingleEvent) {
    console.error("FAIL mingle preview event missing");
    process.exit(1);
  }
  const mingleUpsert = await upsertBatchItem({
    event: {
      ...mingleEvent,
      startTime: "19:00",
      startTimeDisplayNote: PHASE4_MINGLE_PATCH.startTimeDisplayNote,
      officialUrl: PHASE4_MINGLE_PATCH.primarySourceUrl,
    },
    decision: PHASE4_MINGLE_PATCH,
  });
  console.log(
    `mingle upserted | ${mingleUpsert.created ? "created" : "updated"} | approved`,
  );

  // 2) Import expansion
  let created = 0;
  let updated = 0;
  let approved = 0;
  let underReview = 0;
  for (const item of batch) {
    const result = await upsertBatchItem(item);
    if (result.created) created += 1;
    else updated += 1;
    if (item.decision.publicationStatus === "approved") approved += 1;
    if (item.decision.publicationStatus === "under_review") underReview += 1;
    console.log(
      [
        result.created ? "created" : "updated",
        item.decision.publicationStatus,
        item.decision.slug,
      ].join(" | "),
    );
  }

  // 3) Publish all currently approved (existing 7 + mingle + new approved)
  const toPublish = await sql`
    SELECT id, slug FROM event_editions
    WHERE publication_status = 'approved'
    ORDER BY starts_at
  `;
  const now = new Date().toISOString();
  for (const row of toPublish as { id: string; slug: string }[]) {
    const published = await updateEditionPublication({
      id: row.id,
      publicationStatus: "published",
      publishedAt: now,
      approvedAt: now,
    });
    if (!published) {
      console.error(`FAIL publish ${row.slug}`);
      process.exit(1);
    }
    console.log("published", row.slug);
  }

  const underReviewRows = await sql`
    SELECT slug FROM event_editions
    WHERE publication_status = 'under_review'
    ORDER BY slug
  `;
  const publishedRows = await sql`
    SELECT slug FROM event_editions
    WHERE publication_status = 'published'
    ORDER BY starts_at
  `;

  // Guard: under_review must not be public
  for (const row of underReviewRows as { slug: string }[]) {
    const pub = (publishedRows as { slug: string }[]).find(
      (p) => p.slug === row.slug,
    );
    if (pub) {
      console.error(`FAIL under_review also published: ${row.slug}`);
      process.exit(1);
    }
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipAfterN = (tipAfter[0] as { n: number }).n;
  if (tipAfterN !== tipBeforeN) {
    console.error(`FAIL tip count changed ${tipBeforeN} → ${tipAfterN}`);
    process.exit(1);
  }

  const mingle = await getEditionBySlug(PHASE4_MINGLE_PATCH.slug);
  if (mingle?.edition.publicationStatus !== "published") {
    console.error("FAIL Mingle not published after resolve");
    process.exit(1);
  }
  if (!mingle.edition.startsAt.includes("19:00") && !mingle.edition.startsAt.includes("T17:00")) {
    // 19:00+02 = 17:00Z
    console.error(`FAIL Mingle start unexpected: ${mingle.edition.startsAt}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        project: expectedNeonProjectId(),
        tipCount: tipAfterN,
        batchCreated: created,
        batchUpdated: updated,
        batchApproved: approved,
        batchUnderReview: underReview,
        publishedTotal: (publishedRows as unknown[]).length,
        underReviewSlugs: (underReviewRows as { slug: string }[]).map(
          (r) => r.slug,
        ),
        publishedSlugs: (publishedRows as { slug: string }[]).map((r) => r.slug),
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase4 expansion imported + published.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
