/**
 * Fase 22: import Party4singles (publish) + Vlaamse gap drafts.
 * No FR auto-publish. No global auto-publish of drafts.
 * Usage: npm run import:phase22-events
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  attachSource,
  getEditionBySlug,
  updateEditionPublication,
  upsertEditionBySlug,
  upsertOrganizerBySlug,
  upsertSeriesBySlug,
} from "../lib/events/neon-store";
import {
  PHASE22_ALL_EDITIONS,
  PHASE22_DRAFTS,
  PHASE22_PUBLISH,
  type Phase22EditionSeed,
} from "../data/pilot/phase22-party4singles-discovery";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

async function upsertEdition(seed: Phase22EditionSeed, checkedAt: string) {
  const org = await upsertOrganizerBySlug({
    slug: seed.organizerSlug,
    name: seed.organizerName,
    websiteUrl: seed.organizerWebsite,
  });
  if (!org) throw new Error(`organizer ${seed.organizerSlug}`);

  const series = await upsertSeriesBySlug({
    organizerId: org.record.id,
    slug: seed.seriesSlug,
    name: seed.seriesName,
  });
  if (!series) throw new Error(`series ${seed.seriesSlug}`);

  const startsAt = `${seed.startDate}T${seed.startTime}:00+02:00`;
  const endDate = seed.endDate ?? seed.startDate;
  const endsAt = `${endDate}T${seed.endTime}:00+02:00`;

  const result = await upsertEditionBySlug({
    organizerId: org.record.id,
    seriesId: series.record.id,
    slug: seed.slug,
    title: seed.title,
    shortDescription: seed.shortDescription,
    description: seed.description,
    category: "dating",
    subCategory: seed.subCategory,
    city: seed.city,
    region: seed.region,
    venueName: seed.venueName,
    address: seed.address,
    latitude: seed.lat,
    longitude: seed.lng,
    startsAt,
    endsAt,
    priceAmount: seed.priceAmount,
    priceIsFrom: seed.priceIsFrom,
    priceNote: seed.priceNote,
    priceCurrency: "EUR",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: seed.singlesOnly,
    singlesOnlyEvidence: seed.singlesOnlyEvidence,
    minAge: seed.minAge,
    maxAge: seed.maxAge,
    ageRule: "guideline",
    eligibilityJson: {
      default: {
        ageMin: seed.minAge,
        ageMax: seed.maxAge,
        ageRule: "guideline",
      },
      byGender: null,
      allowedGenders: null,
    },
    preferredAudienceAgeMin: seed.preferredAudienceAgeMin,
    preferredAudienceAgeMax: seed.preferredAudienceAgeMax,
    audienceAgeFromSource: seed.preferredAudienceAgeMin != null || seed.minAge != null,
    availabilityStatus: "unknown",
    availabilityNote: null,
    genderAvailability: null,
    startTimeDisplayNote: null,
    activities: seed.activities,
    tags: seed.tags,
    practicalInfo: [
      "Bron: publieke organizer listing.",
      seed.publicationIntent === "approved"
        ? "Menselijk gepubliceerd na verificatie (fase22)."
        : "Geen auto-publish; human review required.",
    ],
    publicationStatus: "draft",
    approvedAt: null,
    publishedAt: null,
    lastCheckedAt: checkedAt,
    sourceCheckedAt: checkedAt,
    internalNotes: [`batch_id=phase22-discovery`, seed.reviewNotes].join("\n"),
  });
  if (!result) throw new Error(`edition ${seed.slug}`);

  await attachSource({
    eventEditionId: result.record.id,
    sourceType: "official_event",
    url: seed.officialUrl,
    normalizedUrl: normalizeUrl(seed.officialUrl),
    sourceName: seed.organizerName,
    isPrimary: true,
    checkedAt,
    evidenceNote: seed.reviewNotes,
  });

  for (const extra of seed.extraSourceUrls ?? []) {
    await attachSource({
      eventEditionId: result.record.id,
      sourceType: "official_event",
      url: extra.url,
      normalizedUrl: normalizeUrl(extra.url),
      sourceName: extra.sourceName,
      isPrimary: false,
      checkedAt,
      evidenceNote: seed.reviewNotes,
    });
  }

  return result;
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

  const publishedBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const publishedBeforeN = (publishedBefore[0] as { n: number }).n;

  const frDraftsBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE internal_notes ILIKE '%batch_id=phase20-discovery%'
      AND publication_status = 'draft'
  `;
  const frDraftsBeforeN = (frDraftsBefore[0] as { n: number }).n;

  const checkedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const seed of PHASE22_ALL_EDITIONS) {
    const result = await upsertEdition(seed, checkedAt);
    if (result.created) created += 1;
    else updated += 1;
    console.log(
      `${result.created ? "+" : "~"} ${seed.publicationIntent} ${seed.slug}`,
    );
  }

  // Explicit human publish path for verified Party4singles only.
  const publishBundle = await getEditionBySlug(PHASE22_PUBLISH.slug);
  if (!publishBundle) throw new Error("publish target missing");
  const now = new Date().toISOString();
  await updateEditionPublication({
    id: publishBundle.edition.id,
    publicationStatus: "published",
    approvedAt: now,
    publishedAt: now,
  });
  console.log(`published | ${PHASE22_PUBLISH.slug}`);

  for (const draft of PHASE22_DRAFTS) {
    const bundle = await getEditionBySlug(draft.slug);
    if (!bundle) throw new Error(`draft missing ${draft.slug}`);
    if (bundle.edition.publicationStatus !== "draft") {
      console.error(`FAIL draft must stay draft: ${draft.slug}`);
      process.exit(1);
    }
  }

  const publishedAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const publishedAfterN = (publishedAfter[0] as { n: number }).n;
  const expectedPublished = publishedBeforeN + 1;
  if (publishedAfterN !== expectedPublished) {
    console.error(
      `FAIL published ${publishedBeforeN} → ${publishedAfterN} (expected ${expectedPublished})`,
    );
    process.exit(1);
  }

  const frDraftsAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE internal_notes ILIKE '%batch_id=phase20-discovery%'
      AND publication_status = 'draft'
  `;
  const frDraftsAfterN = (frDraftsAfter[0] as { n: number }).n;
  if (frDraftsAfterN !== frDraftsBeforeN) {
    console.error(
      `FAIL FR phase20 drafts changed ${frDraftsBeforeN} → ${frDraftsAfterN}`,
    );
    process.exit(1);
  }

  const party = await getEditionBySlug(PHASE22_PUBLISH.slug);
  if (party?.edition.publicationStatus !== "published") {
    console.error("FAIL Party4singles not published");
    process.exit(1);
  }
  if (party.edition.singlesOnly !== false) {
    console.error("FAIL Party4singles must be singlesOnly=false");
    process.exit(1);
  }
  if (party.edition.city !== "Lier") {
    console.error("FAIL city must be Lier");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        editionsCreated: created,
        editionsUpdated: updated,
        draftsKept: PHASE22_DRAFTS.length,
        publishedDelta: publishedAfterN - publishedBeforeN,
        publishedTotal: publishedAfterN,
        frPhase20Drafts: frDraftsAfterN,
        party4singlesSlug: PHASE22_PUBLISH.slug,
        party4singlesSinglesOnly: party.edition.singlesOnly,
        autoPublishDrafts: false,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase22 events imported (1 published + drafts).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
