/**
 * Fase 14: import Tomeeto travel drafts only (no publish).
 * Usage: npm run import:phase14-tomeeto-drafts
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
import { PHASE14_TOMEETO_DRAFTS } from "../data/pilot/phase14-discovery-sources";

const GEO = {
  herve: { lat: 50.6408, lng: 5.7936 },
  liege: { lat: 50.6326, lng: 5.5797 },
  mechelen: { lat: 51.0257, lng: 4.4776 },
} as const;

function coords(city: string) {
  if (city === "Herve") return GEO.herve;
  if (city === "Liège") return GEO.liege;
  return GEO.mechelen;
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

  const org = await upsertOrganizerBySlug({
    slug: "tomeeto",
    name: "Tomeeto",
    websiteUrl: "https://tomeeto.be",
  });
  if (!org) throw new Error("organizer tomeeto");

  const series = await upsertSeriesBySlug({
    organizerId: org.record.id,
    slug: "tomeeto-singles-reizen",
    name: "Tomeeto singlesreizen",
  });
  if (!series) throw new Error("series tomeeto");

  const checkedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const seed of PHASE14_TOMEETO_DRAFTS) {
    const { lat, lng } = coords(seed.city);
    const startsAt = `${seed.startDate}T09:00:00+02:00`;
    const endsAt = `${seed.endDate}T18:00:00+02:00`;
    const result = await upsertEditionBySlug({
      organizerId: org.record.id,
      seriesId: series.record.id,
      slug: seed.slug,
      title: seed.title,
      shortDescription: `${seed.title}. Expliciete singlesreis van Tomeeto met leeftijdsgroep en m/v-evenwicht.`,
      description:
        "Tomeeto: Vlaamse groepsreizen voor singles. Leeftijdsgroep + gegarandeerd m/v-evenwicht (max 60/40). Route A.",
      category: "meet_new_people",
      subCategory: seed.subCategory,
      city: seed.city,
      region: seed.region,
      venueName: null,
      latitude: lat,
      longitude: lng,
      startsAt,
      endsAt,
      priceAmount: null,
      priceIsFrom: false,
      priceNote: "Prijs via Tomeeto boekingspagina.",
      priceCurrency: "EUR",
      eligibilityRoute: "route_a",
      singlesOriented: true,
      singlesOnly: true,
      singlesOnlyEvidence:
        "Tomeeto: exclusief singlesvakanties met leeftijdsgroep en m/v-balans.",
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
      startTimeDisplayNote: "Exacte vertrektijd via Tomeeto.",
      activities: seed.activities,
      tags: ["singles", "travel", "tomeeto"],
      practicalInfo: [
        "Inschrijving via tomeeto.be",
        "Leeftijdsgroep + m/v-evenwicht gegarandeerd door organisator.",
      ],
      publicationStatus: "draft",
      approvedAt: null,
      publishedAt: null,
      lastCheckedAt: checkedAt,
      sourceCheckedAt: checkedAt,
      internalNotes: [
        `batch_id=phase14-tomeeto`,
        seed.reviewNotes,
        "NO auto-publish; human review required.",
      ].join("\n"),
    });
    if (!result) throw new Error(`edition ${seed.slug}`);
    if (result.created) created += 1;
    else updated += 1;

    await attachSource({
      eventEditionId: result.record.id,
      sourceType: "official_event",
      url: seed.officialUrl,
      normalizedUrl: seed.officialUrl.replace(/\/$/, "").toLowerCase(),
      sourceName: "Tomeeto",
      isPrimary: true,
      checkedAt,
      evidenceNote: seed.reviewNotes,
    });

    const existing = await getEditionBySlug(seed.slug);
    if (existing?.edition.publicationStatus === "published") {
      console.error("FAIL draft became published", seed.slug);
      process.exit(1);
    }
    console.log(
      `${result.created ? "created" : "updated"} | draft | ${seed.slug}`,
    );
  }

  const padel = await getEditionBySlug("padeldate-3-0-sint-job-2026-10-31");
  if (padel && padel.edition.publicationStatus !== "under_review") {
    console.error("FAIL Padeldate must stay under_review");
    process.exit(1);
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

  console.log(
    JSON.stringify(
      {
        draftsCreated: created,
        draftsUpdated: updated,
        publishedUnchanged: publishedAfterN,
        padelUnderReview: true,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase14 Tomeeto drafts only (no publish).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
