/**
 * Fase 20: import non-speeddate drafts (FR dinners + Namur slow dating).
 * publication_status = draft only. No auto-publish.
 * Usage: npm run import:phase20-drafts
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  attachSource,
  upsertEditionBySlug,
  upsertOrganizerBySlug,
  upsertSeriesBySlug,
} from "../lib/events/neon-store";
import { PHASE20_DRAFTS } from "../data/pilot/phase20-discovery-gaps";

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

  const checkedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const seed of PHASE20_DRAFTS) {
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
    const endsAt = `${seed.startDate}T${seed.endTime}:00+02:00`;

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
      latitude: seed.lat,
      longitude: seed.lng,
      startsAt,
      endsAt,
      priceAmount: seed.priceAmount,
      priceIsFrom: false,
      priceNote: seed.priceNote,
      priceCurrency: "EUR",
      eligibilityRoute: "route_a",
      singlesOriented: true,
      singlesOnly: true,
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
      preferredAudienceAgeMin: seed.minAge,
      preferredAudienceAgeMax: seed.maxAge,
      audienceAgeFromSource: true,
      availabilityStatus: "unknown",
      availabilityNote: null,
      genderAvailability: null,
      startTimeDisplayNote: null,
      activities: seed.activities,
      tags: seed.tags,
      practicalInfo: [
        "Bron: publieke organizer/ticket listing.",
        "Geen auto-publish; human review required.",
      ],
      publicationStatus: "draft",
      approvedAt: null,
      publishedAt: null,
      lastCheckedAt: checkedAt,
      sourceCheckedAt: checkedAt,
      internalNotes: [`batch_id=phase20-discovery`, seed.reviewNotes].join("\n"),
    });
    if (!result) throw new Error(`edition ${seed.slug}`);
    if (result.created) created += 1;
    else updated += 1;

    await attachSource({
      eventEditionId: result.record.id,
      sourceType: "official_event",
      url: seed.officialUrl,
      normalizedUrl: seed.officialUrl.replace(/\/$/, "").toLowerCase(),
      sourceName: seed.organizerName,
      isPrimary: true,
      checkedAt,
      evidenceNote: seed.reviewNotes,
    });

    console.log(`${result.created ? "draft+" : "draft~"} ${seed.slug}`);
  }

  const publishedAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const publishedAfterN = (publishedAfter[0] as { n: number }).n;
  if (publishedAfterN !== publishedBeforeN) {
    console.error(
      `FAIL published changed ${publishedBeforeN} → ${publishedAfterN} (no auto-publish)`,
    );
    process.exit(1);
  }

  const draftPhase20 = await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE internal_notes ILIKE '%batch_id=phase20-discovery%'
      AND publication_status = 'draft'
  `;

  console.log(
    JSON.stringify(
      {
        draftsCreated: created,
        draftsUpdated: updated,
        draftsTotal: PHASE20_DRAFTS.length,
        phase20DraftsInDb: (draftPhase20[0] as { n: number }).n,
        publishedTotal: publishedAfterN,
        autoPublish: false,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase20 drafts imported (draft only).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
