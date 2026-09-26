/**
 * Fase 9: high-yield curated event batch + Source Map yield updates + publish.
 * Usage: npm run import:phase9-expansion
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
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import {
  buildPhase9ExpansionBatch,
  eligibilityJsonFor,
  PHASE9_SOURCE_YIELD_UPSERTS,
  type Phase9Item,
} from "../data/pilot/phase9-expansion-batch";
import type { PreviewImportDecision } from "../data/pilot/preview-import-decisions";
import type { Event } from "../types/event";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

function startsAtIso(date: string, time: string | null): string {
  return `${date}T${time ?? "00:00"}:00+02:00`;
}

function endsAtIso(
  startDate: string,
  endDate: string | null | undefined,
  endTime: string | null,
): string | null {
  if (!endTime) return null;
  const date = endDate ?? startDate;
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
    endsAt: endsAtIso(event.startDate, event.endDate, decision.endTime),
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
      decision.publicationStatus === "approved" ? checkedAt : null,
    publishedAt: null,
    lastCheckedAt: checkedAt,
    sourceCheckedAt: checkedAt,
    internalNotes: [
      `batch_id=${decision.previewId}`,
      ...decision.reviewNotes,
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
  return { draft };
}

async function upsertBatchItem(item: Phase9Item) {
  const { draft } = applyDecision(item.event, item.decision);
  const org = await upsertOrganizerBySlug(draft.organizer);
  if (!org) throw new Error(`organizer ${item.decision.organizerSlug}`);
  let seriesId: string | null = null;
  if (item.decision.seriesSlug && item.decision.seriesName) {
    const series = await upsertSeriesBySlug({
      organizerId: org.record.id,
      slug: item.decision.seriesSlug,
      name: item.decision.seriesName,
    });
    if (!series) throw new Error(`series ${item.decision.seriesSlug}`);
    seriesId = series.record.id;
  }
  const editionResult = await upsertEditionBySlug({
    ...draft.edition,
    organizerId: org.record.id,
    seriesId,
    publishedAt: null,
  });
  if (!editionResult) throw new Error(`edition ${item.decision.slug}`);
  for (const source of draft.sources) {
    await attachSource({ eventEditionId: editionResult.record.id, ...source });
  }
  const bundle = await getEditionBySlug(item.decision.slug);
  const existingPaths = new Set((bundle?.images ?? []).map((i) => i.urlOrPath));
  for (const image of draft.images) {
    if (existingPaths.has(image.urlOrPath)) continue;
    await attachImage({ eventEditionId: editionResult.record.id, ...image });
  }
  return { editionResult, organizerId: org.record.id };
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

  const batch = buildPhase9ExpansionBatch();
  const orgIds = new Map<string, string>();

  let created = 0;
  let updated = 0;
  let approved = 0;
  for (const item of batch) {
    const { editionResult, organizerId } = await upsertBatchItem(item);
    orgIds.set(item.decision.organizerSlug, organizerId);
    if (editionResult.created) created += 1;
    else updated += 1;
    if (item.decision.publicationStatus === "approved") approved += 1;
    console.log(
      [editionResult.created ? "created" : "updated", item.decision.publicationStatus, item.decision.slug].join(" | "),
    );
  }

  const padel = await getEditionBySlug("padeldate-3-0-sint-job-2026-10-31");
  if (padel && padel.edition.publicationStatus !== "under_review") {
    console.error("FAIL Padeldate must stay under_review");
    process.exit(1);
  }
  console.log("padeldate still under_review");

  let sourcesCreated = 0;
  for (const seed of PHASE9_SOURCE_YIELD_UPSERTS) {
    const result = await upsertCatalogSourceByUrl(seed);
    if (result?.created) sourcesCreated += 1;
    console.log(
      `${result?.created ? "source+" : "source~"} ${seed.name} [${seed.status}]`,
    );
  }

  const toPublish = await sql`
    SELECT id, slug FROM event_editions
    WHERE publication_status = 'approved'
    ORDER BY starts_at
  `;
  const now = new Date().toISOString();
  for (const row of toPublish as { id: string; slug: string }[]) {
    await updateEditionPublication({
      id: row.id,
      publicationStatus: "published",
      publishedAt: now,
      approvedAt: now,
    });
    console.log("published", row.slug);
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipAfterN = (tipAfter[0] as { n: number }).n;
  if (tipAfterN !== tipBeforeN) {
    console.error(`FAIL tip count changed ${tipBeforeN} → ${tipAfterN}`);
    process.exit(1);
  }

  const published = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const under = await sql`
    SELECT slug FROM event_editions WHERE publication_status = 'under_review' ORDER BY slug
  `;
  const sources = await sql`SELECT count(*)::int AS n FROM catalog_sources`;

  console.log(
    JSON.stringify(
      {
        tipCount: tipAfterN,
        batchCreated: created,
        batchUpdated: updated,
        batchApproved: approved,
        publishedTotal: (published[0] as { n: number }).n,
        underReviewSlugs: (under as { slug: string }[]).map((r) => r.slug),
        catalogSources: (sources[0] as { n: number }).n,
        sourcesCreated,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase9 high-yield curated event batch.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
