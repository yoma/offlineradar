/**
 * Fase 24: import Vlaamse non-speeddate drafts only.
 * No auto-publish. No FR/Wallonië expansion. No Party4singles parser.
 * Usage: npm run import:phase24-drafts
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  attachSource,
  getEditionBySlug,
  upsertEditionBySlug,
  upsertOrganizerBySlug,
  upsertSeriesBySlug,
} from "../lib/events/neon-store";
import {
  PHASE24_CHECKED_AT,
  PHASE24_DRAFTS,
  type Phase24EditionSeed,
} from "../data/pilot/phase24-vlaamse-discovery";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

async function upsertEdition(seed: Phase24EditionSeed, checkedAt: string) {
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
    audienceAgeFromSource:
      seed.preferredAudienceAgeMin != null || seed.minAge != null,
    availabilityStatus: "unknown",
    availabilityNote: null,
    genderAvailability: null,
    startTimeDisplayNote: null,
    activities: seed.activities,
    tags: seed.tags,
    practicalInfo: [
      "Bron: publieke organizer listing.",
      "Geen auto-publish; human review required (fase24).",
    ],
    publicationStatus: "draft",
    approvedAt: null,
    publishedAt: null,
    lastCheckedAt: checkedAt,
    sourceCheckedAt: checkedAt,
    internalNotes: [`batch_id=phase24-discovery`, seed.reviewNotes].join("\n"),
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

  const frBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE internal_notes ILIKE '%batch_id=phase20-discovery%'
      AND publication_status = 'draft'
  `;
  const frBeforeN = (frBefore[0] as { n: number }).n;

  let created = 0;
  let updated = 0;
  for (const seed of PHASE24_DRAFTS) {
    if (seed.publicationIntent !== "draft") {
      console.error(`FAIL non-draft intent ${seed.slug}`);
      process.exit(1);
    }
    const result = await upsertEdition(seed, PHASE24_CHECKED_AT);
    if (result.created) created += 1;
    else updated += 1;
    console.log(`${result.created ? "draft+" : "draft~"} ${seed.slug}`);
  }

  for (const draft of PHASE24_DRAFTS) {
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
  if (publishedAfterN !== publishedBeforeN) {
    console.error(
      `FAIL published changed ${publishedBeforeN} → ${publishedAfterN}`,
    );
    process.exit(1);
  }

  const frAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE internal_notes ILIKE '%batch_id=phase20-discovery%'
      AND publication_status = 'draft'
  `;
  const frAfterN = (frAfter[0] as { n: number }).n;
  if (frAfterN !== frBeforeN) {
    console.error(`FAIL FR phase20 drafts changed ${frBeforeN} → ${frAfterN}`);
    process.exit(1);
  }

  const walloonNew = await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE internal_notes ILIKE '%batch_id=phase24-discovery%'
      AND (
        region ILIKE ANY(ARRAY['%Wallon%','%Hainaut%','%Namur%','%Liège%','%Luik%','%Luxembourg%','%Henegouwen%'])
        OR city ILIKE ANY(ARRAY['Liège','Namur','Charleroi','Mons','Arlon','Wavre','Louvain-la-Neuve'])
      )
  `;
  if ((walloonNew[0] as { n: number }).n > 0) {
    console.error("FAIL Wallonië editions in phase24 batch");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        publishedTotal: publishedAfterN,
        draftsCreated: created,
        draftsUpdated: updated,
        draftsTotal: PHASE24_DRAFTS.length,
        frPhase20Drafts: frAfterN,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase24 drafts imported (draft only, no publish).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
