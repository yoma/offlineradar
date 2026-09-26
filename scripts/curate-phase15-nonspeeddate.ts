/**
 * Fase 15: review Tomeeto drafts → publish; curate Juntas travel; yield notes.
 * No auto-publish outside this explicit script. No speeddate bulk.
 * Usage: npm run curate:phase15-nonspeeddate
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import {
  attachImage,
  attachSource,
  getEditionBySlug,
  updateEditionPublication,
  upsertEditionBySlug,
  upsertOrganizerBySlug,
  upsertSeriesBySlug,
} from "../lib/events/neon-store";
import { CATEGORY_MOOD_URLS } from "../lib/image-compatibility";
import { withUserSuppliedProvenance } from "../lib/discovery/user-supplied";

const CHECKED_AT = new Date().toISOString();
const TRAVEL_MOOD = CATEGORY_MOOD_URLS.travel;

const GEO = {
  herve: { lat: 50.6408, lng: 5.7936 },
  liege: { lat: 50.6326, lng: 5.5797 },
  kronplatz: { lat: 46.738, lng: 11.958 },
  granCanaria: { lat: 27.92, lng: -15.55 },
  ibiza: { lat: 38.9067, lng: 1.4206 },
  algarve: { lat: 37.1028, lng: -8.6742 },
  costaLuz: { lat: 36.38, lng: -6.15 },
  egypt: { lat: 27.2579, lng: 33.8116 },
  cyprus: { lat: 34.7071, lng: 33.0225 },
  tenerife: { lat: 28.2916, lng: -16.6291 },
} as const;

type TomeetoPublish = {
  slug: string;
  title: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  destinationNote: string;
  officialUrl: string;
  priceAmount: number | null;
  priceIsFrom: boolean;
  priceNote: string | null;
  availabilityStatus: "available" | "limited" | "unknown" | null;
  availabilityNote: string | null;
};

/** Publish these 10 (padel trips already started → stay draft). */
const TOMEETO_PUBLISH: TomeetoPublish[] = [
  {
    slug: "tomeeto-heerlijk-herve-40-55-2026-11-20",
    title: "Tomeeto — Heerlijk Herve weekend (40–55)",
    city: "Herve",
    region: "Wallonië",
    lat: GEO.herve.lat,
    lng: GEO.herve.lng,
    destinationNote: "Weekend Herve (BE).",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-heerlijk-herve-25-39-2026-11-27",
    title: "Tomeeto — Heerlijk Herve weekend (25–39)",
    city: "Herve",
    region: "Wallonië",
    lat: GEO.herve.lat,
    lng: GEO.herve.lng,
    destinationNote: "Weekend Herve (BE).",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-heerlijk-herve-35-49-2026-12-04",
    title: "Tomeeto — Heerlijk Herve weekend (35–49)",
    city: "Herve",
    region: "Wallonië",
    lat: GEO.herve.lat,
    lng: GEO.herve.lng,
    destinationNote: "Weekend Herve (BE).",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-vurig-luik-50-65-2026-12-04",
    title: "Tomeeto — Vurig Luik weekend (50–65)",
    city: "Liège",
    region: "Wallonië",
    lat: GEO.liege.lat,
    lng: GEO.liege.lng,
    destinationNote: "Weekend Luik/Liège (BE).",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-fiesta-gran-canaria-35-49-2026-12-29",
    title: "Tomeeto — Fiesta Gran Canaria (35–49)",
    city: "Gran Canaria",
    region: "internationaal",
    lat: GEO.granCanaria.lat,
    lng: GEO.granCanaria.lng,
    destinationNote: "Vertrek vanuit België (Tomeeto Mechelen).",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-fiesta-gran-canaria-50-65-2026-12-29",
    title: "Tomeeto — Fiesta Gran Canaria (50–65)",
    city: "Gran Canaria",
    region: "internationaal",
    lat: GEO.granCanaria.lat,
    lng: GEO.granCanaria.lng,
    destinationNote: "Vertrek vanuit België (Tomeeto Mechelen).",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-shortski-35-49-2027-01-17",
    title: "Tomeeto — Shortski (35–49)",
    city: "Oostenrijk",
    region: "internationaal",
    lat: GEO.kronplatz.lat,
    lng: GEO.kronplatz.lng,
    destinationNote: "Shortski; bus vanuit BE (Gent/Kontich/Lummen).",
    officialUrl: "https://tomeeto.be/vakanties/shortski-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-shortski-50-66-2027-01-17",
    title: "Tomeeto — Shortski (50–66)",
    city: "Oostenrijk",
    region: "internationaal",
    lat: GEO.kronplatz.lat,
    lng: GEO.kronplatz.lng,
    destinationNote: "Shortski; bus vanuit BE.",
    officialUrl: "https://tomeeto.be/vakanties/shortski-voor-singles/",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via Tomeeto boeking.",
    availabilityStatus: "unknown",
    availabilityNote: null,
  },
  {
    slug: "tomeeto-skiweek-25-39-2027-03-21",
    title: "Tomeeto — Skiweek Kronplatz (25–39)",
    city: "Kronplatz",
    region: "internationaal",
    lat: GEO.kronplatz.lat,
    lng: GEO.kronplatz.lng,
    destinationNote: "Kronplatz, Italië; bus BE 20/03 → terug 28/03.",
    officialUrl: "https://tomeeto.be/vakanties/skiweek-voor-singles/",
    priceAmount: 1499,
    priceIsFrom: false,
    priceNote: "€1499 p.p. incl. bus, hotel, halfpension, skipas; −€50 vroegboek tem 31/10/2026.",
    availabilityStatus: "available",
    availabilityNote: "Nog plaats (bron 2026-09-26); boeken tem 10/01/2027.",
  },
  {
    slug: "tomeeto-skiweek-40-55-2027-03-21",
    title: "Tomeeto — Skiweek Kronplatz (40–55)",
    city: "Kronplatz",
    region: "internationaal",
    lat: GEO.kronplatz.lat,
    lng: GEO.kronplatz.lng,
    destinationNote: "Kronplatz, Italië; bus BE.",
    officialUrl: "https://tomeeto.be/vakanties/skiweek-voor-singles/",
    priceAmount: 1499,
    priceIsFrom: false,
    priceNote: "€1499 p.p. incl. bus, hotel, halfpension, skipas; −€50 vroegboek tem 31/10/2026.",
    availabilityStatus: "available",
    availabilityNote: "Nog plaats (bron 2026-09-26); boeken tem 10/01/2027.",
  },
];

const TOMEETO_HOLD_DRAFT = [
  "tomeeto-padelvakantie-30-45-2026-09-23",
  "tomeeto-padelvakantie-45-60-2026-09-23",
];

type JuntasItem = {
  slug: string;
  title: string;
  startDate: string;
  endDate: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  officialUrl: string;
  priceAmount: number | null;
  priceIsFrom: boolean;
  priceNote: string | null;
  availabilityStatus: "available" | "limited" | "sold_out" | "unknown";
  availabilityNote: string | null;
  reviewNote: string;
};

const JUNTAS_PUBLISH: JuntasItem[] = [
  {
    slug: "juntas-ibiza-singles-45plus-2026-10-08",
    title: "Juntas — Singlereis Ibiza (45+)",
    startDate: "2026-10-08",
    endDate: "2026-10-15",
    city: "Ibiza",
    region: "internationaal",
    lat: GEO.ibiza.lat,
    lng: GEO.ibiza.lng,
    officialUrl: "https://juntas.be/groepsreis/europa/spanje/ibiza/",
    priceAmount: 1870,
    priceIsFrom: true,
    priceNote: "Vanaf €1870 (tweepersoons); singlekamer op aanvraag.",
    availabilityStatus: "limited",
    availabilityNote: "Bron: ‘Laatste kans’ (2026-09-26).",
    reviewNote: "fase15: exclusief singles/alleenreizenden 45+; vertrek Brussel.",
  },
  {
    slug: "juntas-costa-de-la-luz-singles-45plus-2026-10-15",
    title: "Juntas — Singlereis Costa de la Luz (45+)",
    startDate: "2026-10-15",
    endDate: "2026-10-22",
    city: "Costa de la Luz",
    region: "internationaal",
    lat: GEO.costaLuz.lat,
    lng: GEO.costaLuz.lng,
    officialUrl: "https://juntas.be/groepsreis/europa/spanje/costa-de-la-luz/",
    priceAmount: 1895,
    priceIsFrom: true,
    priceNote: "Vanaf €1895 (listing); kamerkeuze via Juntas.",
    availabilityStatus: "available",
    availabilityNote: null,
    reviewNote: "fase15: exclusief alleenreizenden; vlucht 15/10 BXL–Malaga.",
  },
  {
    slug: "juntas-algarve-singles-45plus-2026-10-31",
    title: "Juntas — Singlereis Algarve (45+)",
    startDate: "2026-10-31",
    endDate: "2026-11-07",
    city: "Lagos",
    region: "internationaal",
    lat: GEO.algarve.lat,
    lng: GEO.algarve.lng,
    officialUrl: "https://juntas.be/groepsreis/europa/portugal/algarve/",
    priceAmount: 1860,
    priceIsFrom: true,
    priceNote: "Vanaf €1860 tweepersoons; eenpersoons hoger.",
    availabilityStatus: "available",
    availabilityNote: "Herfstvakantie 31/10–07/11/2026 (bron).",
    reviewNote: "fase15: exclusief singles & alleenreizenden; BXL–Faro.",
  },
  {
    slug: "juntas-egypte-singles-45plus-2026-11-20",
    title: "Juntas — Singlereis Egypte strand (45+)",
    startDate: "2026-11-20",
    endDate: "2026-11-27",
    city: "Egypte",
    region: "internationaal",
    lat: GEO.egypt.lat,
    lng: GEO.egypt.lng,
    officialUrl: "https://juntas.be/?reis_label=single-only",
    priceAmount: 1995,
    priceIsFrom: true,
    priceNote: "Vanaf €1995 (single-only listing).",
    availabilityStatus: "available",
    availabilityNote: null,
    reviewNote: "fase15: single-only hub listing 20/11; detailpagina via Juntas kalender.",
  },
  {
    slug: "juntas-cyprus-nieuwjaar-singles-45plus-2026-12-28",
    title: "Juntas — Nieuwjaarsreis Cyprus (45+)",
    startDate: "2026-12-28",
    endDate: "2027-01-04",
    city: "Cyprus",
    region: "internationaal",
    lat: GEO.cyprus.lat,
    lng: GEO.cyprus.lng,
    officialUrl: "https://juntas.be/?reis_label=single-only",
    priceAmount: 2245,
    priceIsFrom: true,
    priceNote: "Vanaf €2245 (listing).",
    availabilityStatus: "limited",
    availabilityNote: "Bron: ‘Laatste kans’.",
    reviewNote: "fase15: single-only nieuwjaarsreis; 8 dagen.",
  },
  {
    slug: "juntas-tenerife-nieuwjaar-singles-45plus-2026-12-29",
    title: "Juntas — Nieuwjaarsreis Tenerife (45+)",
    startDate: "2026-12-29",
    endDate: "2027-01-05",
    city: "Tenerife",
    region: "internationaal",
    lat: GEO.tenerife.lat,
    lng: GEO.tenerife.lng,
    officialUrl: "https://juntas.be/?reis_label=single-only",
    priceAmount: 2895,
    priceIsFrom: true,
    priceNote: "Vanaf €2895 (listing).",
    availabilityStatus: "available",
    availabilityNote: null,
    reviewNote: "fase15: single-only Tenerife nieuwjaar.",
  },
];

const JUNTAS_REJECTED = [
  { name: "Sicilië noordkust 27/09/2026", reason: "Volzet op single-only hub." },
  { name: "Corfu 04/10/2026", reason: "Volzet." },
  { name: "Marrakech 10/12/2026", reason: "Volzet." },
];

async function publishSlug(slug: string) {
  const bundle = await getEditionBySlug(slug);
  if (!bundle) throw new Error(`missing ${slug}`);
  const now = new Date().toISOString();
  await updateEditionPublication({
    id: bundle.edition.id,
    publicationStatus: "published",
    publishedAt: now,
    approvedAt: now,
  });
  console.log("published", slug);
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

  const tipBefore = (await sql`SELECT count(*)::int AS n FROM tips`)[0] as {
    n: number;
  };
  const speedBefore = (await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE publication_status = 'published'
      AND (activities @> '["speeddate"]'::jsonb
        OR lower(coalesce(sub_category,'')) IN ('speeddate','speeddating'))
  `)[0] as { n: number };

  // ——— Tomeeto review + publish ———
  let tomeetoPublished = 0;
  for (const item of TOMEETO_PUBLISH) {
    const existing = await getEditionBySlug(item.slug);
    if (!existing) {
      console.error("FAIL missing draft", item.slug);
      process.exit(1);
    }
    const ed = existing.edition;
    const result = await upsertEditionBySlug({
      organizerId: ed.organizerId,
      seriesId: ed.seriesId,
      slug: item.slug,
      title: item.title,
      shortDescription: existing.edition.shortDescription,
      description: `${existing.edition.description ?? ""}\n${item.destinationNote}`.trim(),
      category: "meet_new_people",
      subCategory: ed.subCategory,
      city: item.city,
      region: item.region,
      latitude: item.lat,
      longitude: item.lng,
      startsAt: ed.startsAt,
      endsAt: ed.endsAt,
      priceAmount: item.priceAmount,
      priceIsFrom: item.priceIsFrom,
      priceNote: item.priceNote,
      priceCurrency: "EUR",
      eligibilityRoute: "route_a",
      singlesOriented: true,
      singlesOnly: true,
      singlesOnlyEvidence:
        "Tomeeto: exclusief singlesvakanties; enkel leeftijdsgroep toegelaten; m/v max 60/40.",
      minAge: ed.minAge,
      maxAge: ed.maxAge,
      ageRule: "strict",
      eligibilityJson: {
        default: {
          ageMin: ed.minAge,
          ageMax: ed.maxAge,
          ageRule: "strict",
        },
        byGender: null,
        allowedGenders: null,
      },
      preferredAudienceAgeMin: ed.minAge,
      preferredAudienceAgeMax: ed.maxAge,
      audienceAgeFromSource: true,
      availabilityStatus: item.availabilityStatus,
      availabilityNote: item.availabilityNote,
      activities: ed.activities,
      tags: ed.tags,
      practicalInfo: [
        ...(ed.practicalInfo ?? []),
        item.destinationNote,
        "Leeftijdsgroep: enkel wie binnen de band valt wordt toegelaten (Tomeeto).",
      ],
      publicationStatus: "approved",
      approvedAt: CHECKED_AT,
      publishedAt: null,
      lastCheckedAt: CHECKED_AT,
      sourceCheckedAt: CHECKED_AT,
      internalNotes: [
        ed.internalNotes,
        "fase15 human review: publish OK; age_rule→strict (toelatingsregel bron).",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (!result) throw new Error(item.slug);
    await attachSource({
      eventEditionId: result.record.id,
      sourceType: "official_event",
      url: item.officialUrl,
      normalizedUrl: item.officialUrl.replace(/\/$/, "").toLowerCase(),
      sourceName: "Tomeeto",
      isPrimary: true,
      checkedAt: CHECKED_AT,
      evidenceNote: "fase15 re-check aanbod/skiweek hub",
    });
    const hasTravelImage = (existing.images ?? []).some(
      (img) => img.urlOrPath.includes("1501785888041") || img.urlOrPath.includes("travel"),
    );
    if (!hasTravelImage) {
      await attachImage({
        eventEditionId: result.record.id,
        urlOrPath: TRAVEL_MOOD,
        imageType: "mood",
        isPrimary: true,
        altText: "Sfeerbeeld singlesreis / weekend",
        rightsNote: "Category travel mood; geen officiële reisfoto.",
      });
    }
    await publishSlug(item.slug);
    tomeetoPublished += 1;
  }

  for (const slug of TOMEETO_HOLD_DRAFT) {
    await sql`
      UPDATE event_editions SET
        internal_notes = coalesce(internal_notes,'') || ${"\nfase15: gehouden als draft — trip al gestart (23/09); niet nieuw toekomstig."},
        last_checked_at = ${CHECKED_AT},
        updated_at = now()
      WHERE slug = ${slug}
    `;
    console.log("held draft", slug);
  }

  // ——— Juntas ———
  const juntasOrg = await upsertOrganizerBySlug({
    slug: "juntas",
    name: "Juntas",
    websiteUrl: "https://juntas.be",
  });
  if (!juntasOrg) throw new Error("juntas org");
  const juntasSeries = await upsertSeriesBySlug({
    organizerId: juntasOrg.record.id,
    slug: "juntas-singles-reizen",
    name: "Juntas singlereizen 45+",
  });
  if (!juntasSeries) throw new Error("juntas series");

  let juntasPublished = 0;
  for (const item of JUNTAS_PUBLISH) {
    const existing = await getEditionBySlug(item.slug);
    if (existing?.edition.publicationStatus === "published") {
      console.log("skip already published", item.slug);
      continue;
    }
    const startsAt = `${item.startDate}T09:00:00+02:00`;
    const endsAt = `${item.endDate}T18:00:00+01:00`;
    const result = await upsertEditionBySlug({
      organizerId: juntasOrg.record.id,
      seriesId: juntasSeries.record.id,
      slug: item.slug,
      title: item.title,
      shortDescription: `Exclusieve groepsreis voor alleenreizenden 45+ naar ${item.city}. Nederlandstalige begeleiding vanaf Brussel.`,
      description:
        "Juntas: exclusief voor singles & alleenreizenden (45+). Vertrek vanuit België met Nederlandstalige begeleiding. Route A.",
      category: "meet_new_people",
      subCategory: "singles travel",
      city: item.city,
      region: item.region,
      latitude: item.lat,
      longitude: item.lng,
      startsAt,
      endsAt,
      priceAmount: item.priceAmount,
      priceIsFrom: item.priceIsFrom,
      priceNote: item.priceNote,
      priceCurrency: "EUR",
      eligibilityRoute: "route_a",
      singlesOriented: true,
      singlesOnly: true,
      singlesOnlyEvidence:
        "Juntas: ‘Exclusief voor singles & alleenreizenden’ / single-only label.",
      minAge: 45,
      maxAge: null,
      ageRule: "guideline",
      eligibilityJson: {
        default: { ageMin: 45, ageMax: null, ageRule: "guideline" },
        byGender: null,
        allowedGenders: null,
      },
      preferredAudienceAgeMin: 45,
      preferredAudienceAgeMax: null,
      audienceAgeFromSource: true,
      availabilityStatus: item.availabilityStatus,
      availabilityNote: item.availabilityNote,
      activities: ["reizen", "weekend"],
      tags: ["singles", "travel", "juntas", "45+"],
      practicalInfo: [
        "Vertrek typisch Zaventem (Brussel); optionele transfer Juntas regio Lochristi.",
        "Boeken via juntas.be",
      ],
      publicationStatus: "approved",
      approvedAt: CHECKED_AT,
      publishedAt: null,
      lastCheckedAt: CHECKED_AT,
      sourceCheckedAt: CHECKED_AT,
      internalNotes: `batch_id=phase15-juntas\n${item.reviewNote}`,
    });
    if (!result) throw new Error(item.slug);
    await attachSource({
      eventEditionId: result.record.id,
      sourceType: "official_event",
      url: item.officialUrl,
      normalizedUrl: item.officialUrl.replace(/\/$/, "").toLowerCase(),
      sourceName: "Juntas",
      isPrimary: true,
      checkedAt: CHECKED_AT,
      evidenceNote: item.reviewNote,
    });
    await attachImage({
      eventEditionId: result.record.id,
      urlOrPath: TRAVEL_MOOD,
      imageType: "mood",
      isPrimary: true,
      altText: "Sfeerbeeld singlesreis",
      rightsNote: "Category travel mood; geen officiële reisfoto.",
    });
    await publishSlug(item.slug);
    juntasPublished += 1;
  }

  // ——— Source yield ———
  await upsertCatalogSourceByUrl({
    name: "Tomeeto",
    officialUrl: "https://tomeeto.be",
    status: "active",
    regions: ["België", "Mechelen", "Vlaanderen", "nationaal"],
    formats: ["travel", "weekend", "sport", "ski"],
    notes: withUserSuppliedProvenance(
      `[fase15] channel=organizer langs=NL yield=high effort=low | reviewed=12 published=${tomeetoPublished} draft_hold=2 (padel gestart) rejected=0 | age strict (toelating). refresh=good parser candidate (product pages).`,
    ),
    lastCheckedAt: CHECKED_AT,
  });
  await upsertCatalogSourceByUrl({
    name: "Juntas",
    officialUrl: "https://juntas.be/groepsreizen-voor-singles/",
    status: "active",
    regions: ["België", "Oost-Vlaanderen", "nationaal"],
    formats: ["travel", "weekend"],
    notes: `[fase15] channel=organizer langs=NL yield=high effort=medium | candidates≈15 open single-only | published=${juntasPublished} rejected_volzet=${JUNTAS_REJECTED.length} | 45+ guideline | refresh=medium (WP listings).`,
    lastCheckedAt: CHECKED_AT,
  });
  await upsertCatalogSourceByUrl({
    name: "Date-Love",
    officialUrl: "https://www.date-love.be",
    status: "promising",
    regions: ["Brussel", "Liège", "Namur", "Wallonië"],
    formats: ["speeddate"],
    notes:
      "[fase15] channel=organizer langs=FR yield=low (deze fase) | Alleen speeddate-agenda 2027; geen non-speeddate editions. Niet gepubliceerd (fase15 non-speeddate focus).",
    lastCheckedAt: CHECKED_AT,
  });
  await upsertCatalogSourceByUrl({
    name: "Full of Wonder",
    officialUrl: "https://fullofwonder.be",
    status: "promising",
    regions: ["Wallonië", "Ardennen"],
    formats: ["workshop", "wellness", "weekend"],
    notes:
      "[fase15] channel=organizer langs=NL yield=low | 2026 singles retreats (apr + 18–20/09) beide voorbij. Geen toekomstige editie. Monitor 2027.",
    lastCheckedAt: CHECKED_AT,
  });
  await upsertCatalogSourceByUrl({
    name: "Funky Fish / SingleCamps (Ardennen outdoor)",
    officialUrl:
      "https://www.funkyfish.nl/reis/2663/outdoorweekend-ardennen-25-28-september-2026.html",
    status: "low_yield",
    regions: ["Wallonië", "Ardennen"],
    formats: ["outdoor", "weekend"],
    notes:
      "[fase15] channel=organizer langs=NL yield=low | Outdoorweekend 25–28/09/2026 al bezig/voorbij bij review. NL christelijke niche; geen nieuwe future editie gevonden.",
    lastCheckedAt: CHECKED_AT,
  });

  const tipAfter = (await sql`SELECT count(*)::int AS n FROM tips`)[0] as {
    n: number;
  };
  if (tipAfter.n !== tipBefore.n) {
    console.error("FAIL tips changed");
    process.exit(1);
  }

  const padel = await getEditionBySlug("padeldate-3-0-sint-job-2026-10-31");
  if (padel && padel.edition.publicationStatus !== "under_review") {
    console.error("FAIL padeldate");
    process.exit(1);
  }

  const published = (await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `)[0] as { n: number };
  const speedAfter = (await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE publication_status = 'published'
      AND (activities @> '["speeddate"]'::jsonb
        OR lower(coalesce(sub_category,'')) IN ('speeddate','speeddating'))
  `)[0] as { n: number };
  if (speedAfter.n !== speedBefore.n) {
    console.error(`FAIL speeddate count changed ${speedBefore.n}→${speedAfter.n}`);
    process.exit(1);
  }

  const travel = (await sql`
    SELECT count(*)::int AS n FROM event_editions
    WHERE publication_status = 'published'
      AND (activities @> '["reizen"]'::jsonb OR activities @> '["weekend"]'::jsonb)
  `)[0] as { n: number };

  console.log(
    JSON.stringify(
      {
        tipCount: tipAfter.n,
        tomeetoPublished,
        tomeetoHeldDraft: TOMEETO_HOLD_DRAFT.length,
        juntasPublished,
        juntasRejectedVolzet: JUNTAS_REJECTED.length,
        publishedTotal: published.n,
        speeddatePublished: speedAfter.n,
        speeddatePct: Math.round((speedAfter.n / published.n) * 1000) / 10,
        travelWeekendPublished: travel.n,
        padelUnderReview: true,
        noSpeeddateBulk: true,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase15 non-speeddate backlog curated + published.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
