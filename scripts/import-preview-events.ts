/**
 * Idempotent import of Fase 4B preview events into Neon catalog.
 * Usage: npm run import:preview-events
 * Never publishes. Never touches tips. Never changes public feed loaders.
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
  listPublishedEditions,
  upsertEditionBySlug,
  upsertOrganizerBySlug,
  upsertSeriesBySlug,
} from "../lib/events/neon-store";
import { buildRealPreviewEvents } from "../data/pilot/real-preview-events";
import {
  eligibilityJsonFor,
  PREVIEW_IMPORT_DECISIONS,
  type PreviewImportDecision,
} from "../data/pilot/preview-import-decisions";
import type { Event } from "../types/event";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

function startsAtIso(date: string, time: string | null): string {
  const t = time ?? "00:00";
  return `${date}T${t}:00+02:00`;
}

function endsAtIso(
  date: string,
  startTime: string | null,
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
    endsAt: endsAtIso(event.startDate, decision.startTime, decision.endTime),
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
      `preview_id=${decision.previewId}`,
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

  // Deduplicate by normalized URL; keep primary if conflict.
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
            ? "Sfeerbeeld uit preview; geen officiële editiefoto."
            : null,
        },
      ]
    : [];

  return { draft, checkedAt };
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
      `FAIL project must be ${expectedNeonProjectId()} (got ${projectId ?? "missing"})`,
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

  const previewEvents = buildRealPreviewEvents();
  if (previewEvents.length !== 8) {
    console.error(`FAIL expected 8 preview events, got ${previewEvents.length}`);
    process.exit(1);
  }
  if (PREVIEW_IMPORT_DECISIONS.length !== 8) {
    console.error(
      `FAIL expected 8 decisions, got ${PREVIEW_IMPORT_DECISIONS.length}`,
    );
    process.exit(1);
  }

  const byId = new Map(previewEvents.map((e) => [e.id, e]));
  const summary: Record<string, number> = {
    created: 0,
    updated: 0,
    approved: 0,
    under_review: 0,
    draft: 0,
    expired: 0,
    cancelled: 0,
    published_forbidden: 0,
  };

  for (const decision of PREVIEW_IMPORT_DECISIONS) {
    const event = byId.get(decision.previewId);
    if (!event) {
      console.error(`FAIL missing preview event ${decision.previewId}`);
      process.exit(1);
    }
    if (decision.publicationStatus === ("published" as string)) {
      console.error(`FAIL decision tried to publish ${decision.slug}`);
      process.exit(1);
    }

    const { draft } = applyDecision(event, decision);

    const org = await upsertOrganizerBySlug(draft.organizer);
    if (!org) {
      console.error(`FAIL organizer upsert ${decision.organizerSlug}`);
      process.exit(1);
    }

    let seriesId: string | null = null;
    if (decision.seriesSlug && decision.seriesName) {
      const series = await upsertSeriesBySlug({
        organizerId: org.record.id,
        slug: decision.seriesSlug,
        name: decision.seriesName,
      });
      if (!series) {
        console.error(`FAIL series upsert ${decision.seriesSlug}`);
        process.exit(1);
      }
      seriesId = series.record.id;
    }

    const editionResult = await upsertEditionBySlug({
      ...draft.edition,
      organizerId: org.record.id,
      seriesId,
      publishedAt: null,
    });
    if (!editionResult) {
      console.error(`FAIL edition upsert ${decision.slug}`);
      process.exit(1);
    }

    if (editionResult.created) summary.created += 1;
    else summary.updated += 1;

    summary[decision.publicationStatus] += 1;

    for (const source of draft.sources) {
      await attachSource({
        eventEditionId: editionResult.record.id,
        ...source,
      });
    }

    const bundle = await getEditionBySlug(decision.slug);
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

    console.log(
      [
        editionResult.created ? "created" : "updated",
        decision.publicationStatus,
        decision.slug,
        `route=${decision.eligibilityRoute}`,
        `age=${decision.ageRule}`,
        `singlesOnly=${decision.singlesOnly}`,
        `source=${decision.sourceOk}`,
      ].join(" | "),
    );
  }

  const published = await listPublishedEditions(50);
  if (published.length > 0) {
    console.error(
      `FAIL published editions present after import: ${published.length}`,
    );
    process.exit(1);
  }

  const statusRows = await sql`
    SELECT publication_status, count(*)::int AS n
    FROM event_editions
    GROUP BY publication_status
    ORDER BY publication_status
  `;
  const importedSlugs = new Set(PREVIEW_IMPORT_DECISIONS.map((d) => d.slug));
  const imported = await sql`
    SELECT slug, publication_status, published_at
    FROM event_editions
  `;
  const importedOnly = (imported as { slug: string; publication_status: string; published_at: string | null }[])
    .filter((row) => importedSlugs.has(row.slug));
  if (importedOnly.length !== 8) {
    console.error(`FAIL expected 8 imported editions, found ${importedOnly.length}`);
    process.exit(1);
  }
  if (importedOnly.some((row) => row.publication_status === "published" || row.published_at)) {
    console.error("FAIL imported edition marked published");
    process.exit(1);
  }
  console.log("status_counts_all", statusRows);
  console.log(
    "imported_statuses",
    importedOnly.map((r) => `${r.slug}:${r.publication_status}`),
  );

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
        tipCount: tipAfterN,
        publishedCount: published.length,
        summary,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: preview → catalog import complete (no published).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
