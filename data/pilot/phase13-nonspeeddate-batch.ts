/**
 * Fase 13: non-speeddate balance batch (checked 2026-09-26).
 * No classic speeddates. Dinner / party / outdoor gap-fill.
 */
import type { PreviewImportDecision } from "@/data/pilot/preview-import-decisions";
import { eligibilityJsonFor } from "@/data/pilot/preview-import-decisions";
import type { UpsertCatalogSourceInput } from "@/lib/events/catalog-sources";
import type { ActivityId, Event, EventCategory } from "@/types/event";
import { band } from "@/types/event";
import { slugId } from "@/types/domain";

export { eligibilityJsonFor };

const CHECKED_AT = "2026-09-26T22:00:00.000Z";

const GEO = {
  antwerpen: { lat: 51.2194, lng: 4.4025 },
  brussel: { lat: 50.8503, lng: 4.3517 },
  gent: { lat: 51.0543, lng: 3.7174 },
  brugge: { lat: 51.2093, lng: 3.2247 },
  ronse: { lat: 50.7458, lng: 3.6003 },
  stekene: { lat: 51.2097, lng: 4.0364 },
  namur: { lat: 50.4674, lng: 4.8719 },
} as const;

function mood(file: string, alt: string) {
  return {
    imageUrl: `/preview-mood/${file}`,
    imageAlt: alt,
    imageIsAtmosphere: true as const,
  };
}

type Spec = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  category: EventCategory;
  subCategory: string;
  organizerName: string;
  organizerSlug: string;
  organizerWebsite: string;
  seriesSlug: string;
  seriesName: string;
  city: string;
  venue: string | null;
  lat: number;
  lng: number;
  region: string;
  startDate: string;
  startTime: string;
  endTime: string | null;
  endDate?: string | null;
  price: number | null;
  minAge: number | null;
  maxAge: number | null;
  ageRule: PreviewImportDecision["ageRule"];
  singlesOnly: boolean;
  singlesOnlyEvidence: string;
  officialUrl: string;
  ticketUrl: string | null;
  tags: string[];
  activities: ActivityId[];
  practicalInfo: string[];
  moodFile: string;
  moodAlt: string;
  reviewNotes: string[];
  priceNote?: string | null;
};

export type Phase13Item = { event: Event; decision: PreviewImportDecision };

function fromSpec(s: Spec): Phase13Item {
  const event: Event = {
    id: s.id,
    title: s.title,
    slug: s.slug,
    shortDescription: s.shortDescription,
    description: s.description,
    category: s.category,
    subCategory: s.subCategory,
    organizerName: s.organizerName,
    city: s.city,
    venue: s.venue,
    latitude: s.lat,
    longitude: s.lng,
    region: s.region,
    startDate: s.startDate,
    startTime: s.startTime,
    endTime: s.endTime,
    endDate: s.endDate ?? null,
    price: s.price,
    priceIsFrom: false,
    currency: "EUR",
    eligibility: {
      default:
        s.minAge != null || s.maxAge != null
          ? band(
              s.minAge,
              s.maxAge,
              s.ageRule === "unknown" ? "guideline" : s.ageRule,
            )
          : null,
      byGender: null,
      allowedGenders: null,
    },
    eligibilityAgeMin: s.minAge,
    eligibilityAgeMax: s.maxAge,
    eligibilityAgeRule: s.ageRule,
    preferredAudienceAgeMin: s.minAge,
    preferredAudienceAgeMax: s.maxAge,
    audienceAgeFromSource: s.minAge != null || s.maxAge != null,
    singlesOnly: s.singlesOnly,
    singlesOriented: true,
    genderAvailability: null,
    capacityStatus: "unknown",
    availabilityNote: null,
    sourceType: "official_website",
    sourceName: s.organizerName,
    officialUrl: s.officialUrl,
    ticketUrl: s.ticketUrl,
    lastCheckedAt: CHECKED_AT,
    tags: s.tags,
    activities: s.activities,
    practicalInfo: s.practicalInfo,
    instagramUrl: null,
    addedAt: CHECKED_AT,
    organizerId: slugId("org", s.organizerName),
    venueId: s.venue ? slugId("venue", s.venue) : null,
    meetActivation: null,
    singlesFriendly: false,
    listingPath: "organic",
    socialSuitability: "high",
    distanceKm: 0,
    knownAudienceGenders: null,
    spotsRemaining: null,
    registrationDeadline: null,
    ...mood(s.moodFile, s.moodAlt),
  };

  const decision: PreviewImportDecision = {
    previewId: s.id,
    slug: s.slug,
    organizerSlug: s.organizerSlug,
    organizerName: s.organizerName,
    organizerWebsite: s.organizerWebsite,
    seriesSlug: s.seriesSlug,
    seriesName: s.seriesName,
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: s.singlesOnly,
    singlesOnlyEvidence: s.singlesOnlyEvidence,
    minAge: s.minAge,
    maxAge: s.maxAge,
    ageRule: s.ageRule,
    priceAmount: s.price,
    priceIsFrom: false,
    priceNote: s.priceNote ?? null,
    availabilityStatus: "unknown",
    availabilityNote: null,
    genderAvailability: null,
    startTime: s.startTime,
    endTime: s.endTime,
    startTimeDisplayNote: null,
    primarySourceUrl: s.officialUrl,
    extraSources: [],
    changesVsPreview: ["fase13 curated non-speeddate import"],
    conflicts: [],
    reviewNotes: s.reviewNotes,
    sourceOk: "ok",
  };

  return { event, decision };
}

const SPECS: Spec[] = [
  {
    id: "phase13-diner-bruxelles-55-64-2026-09-30",
    title: "Dîner Dating Bruxelles, 55–64 ans",
    slug: "diner-dating-bruxelles-55-64-2026-09-30",
    shortDescription:
      "Singles dinner dating in een Brussels restaurant; kleine tafel (6–8) met leeftijdsgroep 55–64.",
    description:
      "LeSpeedDating Dîner Dating: expliciet singles dinner (geen klassieke speeddate). Venue via SMS de avond ervoor.",
    category: "dating",
    subCategory: "singles dinner",
    organizerName: "LeSpeedDating",
    organizerSlug: "lespeeddating",
    organizerWebsite: "https://www.lespeeddating.com",
    seriesSlug: "lespeeddating-diner",
    seriesName: "LeSpeedDating Dîner Dating",
    city: "Brussel",
    venue: null,
    lat: GEO.brussel.lat,
    lng: GEO.brussel.lng,
    region: "Brussel",
    startDate: "2026-09-30",
    startTime: "19:30",
    endTime: "21:30",
    price: null,
    minAge: 55,
    maxAge: 64,
    ageRule: "guideline",
    singlesOnly: true,
    singlesOnlyEvidence:
      "LeSpeedDating: Dîner Dating voor célibataires; alternatief voor traditioneel speed dating.",
    officialUrl:
      "https://www.lespeeddating.com/160-rencontres-en-belgique-celibataires-bruxelles-namur-charleroi-liege-speeddating",
    ticketUrl: null,
    tags: ["singles", "dinner", "brussel", "55+"],
    activities: ["eten"],
    practicalInfo: [
      "Restaurantadres volgt via SMS/app de avond ervoor.",
      "Maaltijd aparte kost; service fee via LeSpeedDating.",
    ],
    moodFile: "mood-apero-solo.png",
    moodAlt: "Sfeerbeeld singles dinner",
    priceNote: "Restaurant + inschrijving; bedragen via bron.",
    reviewNotes: [
      "fase13: BE-agenda Dîner Dating 55/64 Bruxelles 30/09 19:30; non-speeddate dinner fill.",
    ],
  },
  {
    id: "phase13-diner-bruxelles-25-34-2026-10-01",
    title: "Dîner Dating Bruxelles, 25–34 ans",
    slug: "diner-dating-bruxelles-25-34-2026-10-01",
    shortDescription:
      "Singles dinner dating in Brussel voor 25–34; kleine tafel, geen timed speeddate-rondes.",
    description:
      "LeSpeedDating: Dîner Dating als alternatief voor speed dating. Expliciet célibataires. Venue via SMS.",
    category: "dating",
    subCategory: "singles dinner",
    organizerName: "LeSpeedDating",
    organizerSlug: "lespeeddating",
    organizerWebsite: "https://www.lespeeddating.com",
    seriesSlug: "lespeeddating-diner",
    seriesName: "LeSpeedDating Dîner Dating",
    city: "Brussel",
    venue: null,
    lat: GEO.brussel.lat,
    lng: GEO.brussel.lng,
    region: "Brussel",
    startDate: "2026-10-01",
    startTime: "19:30",
    endTime: "21:30",
    price: null,
    minAge: 25,
    maxAge: 34,
    ageRule: "guideline",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Pagina: Soirée célibataires; Dîner Dating als alternative au Speed Dating.",
    officialUrl:
      "https://www.lespeeddating.com/home/2262-diner-rencontres-celibs-bruxelles-celibataires-soirees-dinant-25ans-34ans.html",
    ticketUrl: null,
    tags: ["singles", "dinner", "brussel"],
    activities: ["eten"],
    practicalInfo: ["Restaurant via SMS/app de avond ervoor."],
    moodFile: "mood-apero-solo.png",
    moodAlt: "Sfeerbeeld singles dinner",
    priceNote: "Restaurant + inschrijving; bedragen via bron.",
    reviewNotes: [
      "fase13: pagina bevestigt jeudi 1 octobre 2026 19:30 Dîner Dating 25/34 Bruxelles.",
    ],
  },
  {
    id: "phase13-diner-namur-55-64-2026-10-08",
    title: "Dîner Dating Namur, 55–64 ans",
    slug: "diner-dating-namur-55-64-2026-10-08",
    shortDescription:
      "Singles dinner dating in Namur voor 55–64; kleine tafel in een partnerrestaurant.",
    description:
      "LeSpeedDating Dîner Dating Namur. Geen klassieke speeddate; maaltijd + gesprek aan tafel.",
    category: "dating",
    subCategory: "singles dinner",
    organizerName: "LeSpeedDating",
    organizerSlug: "lespeeddating",
    organizerWebsite: "https://www.lespeeddating.com",
    seriesSlug: "lespeeddating-diner",
    seriesName: "LeSpeedDating Dîner Dating",
    city: "Namur",
    venue: null,
    lat: GEO.namur.lat,
    lng: GEO.namur.lng,
    region: "Wallonië",
    startDate: "2026-10-08",
    startTime: "20:00",
    endTime: "21:30",
    price: null,
    minAge: 55,
    maxAge: 64,
    ageRule: "guideline",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Pagina: Dîner Dating 55/64 ans à Namur; célibataires; alternative au Speed Dating.",
    officialUrl:
      "https://www.lespeeddating.com/home/2748-diner-rencontres-celibs-namur-celibataires-soirees-dinant-55ans-64ans.html",
    ticketUrl: null,
    tags: ["singles", "dinner", "namur", "55+"],
    activities: ["eten"],
    practicalInfo: ["Restaurant via SMS/app de avond ervoor."],
    moodFile: "mood-apero-solo.png",
    moodAlt: "Sfeerbeeld singles dinner",
    priceNote: "Restaurant + inschrijving; bedragen via bron.",
    reviewNotes: [
      "fase13: pagina jeudi 8 octobre 2026 20:00 Dîner Dating 55/64 Namur.",
    ],
  },
  {
    id: "phase13-mndr-antwerpen-2026-10-10",
    title: "MNDR TNDR Antwerpen",
    slug: "mndr-tndr-antwerpen-2026-10-10",
    shortDescription:
      "Singles dance/party bij Plein Publiek Antwerpen: flirten, dansen en matchen offline.",
    description:
      "Lucky Lemon × MNDR TNDR: expliciet singles feest. Wing-buddy mogelijk. Geen speeddate.",
    category: "dating",
    subCategory: "singles party",
    organizerName: "Lucky Lemon",
    organizerSlug: "lucky-lemon",
    organizerWebsite: "https://www.luckylemon.be",
    seriesSlug: "mndr-tndr",
    seriesName: "MNDR TNDR",
    city: "Antwerpen",
    venue: "Plein Publiek",
    lat: GEO.antwerpen.lat,
    lng: GEO.antwerpen.lng,
    region: "Antwerpen",
    startDate: "2026-10-10",
    startTime: "22:30",
    endTime: "04:00",
    endDate: "2026-10-11",
    price: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Lucky Lemon: singles dancefloor; wing buddy voor vrienden met partner.",
    officialUrl: "https://www.luckylemon.be/mndrtndr",
    ticketUrl: null,
    tags: ["singles", "party", "antwerpen"],
    activities: ["party", "dans"],
    practicalInfo: [
      "Zonnestroomstraat 2A, 2020 Antwerpen",
      "Tickets via Lucky Lemon.",
    ],
    moodFile: "mood-mingle-night.png",
    moodAlt: "Sfeerbeeld singles party",
    priceNote: "Ticketprijs via Lucky Lemon / ticketing.",
    reviewNotes: [
      "fase13: luckylemon.be/mndrtndr 10/10 Antwerpen Plein Publiek 22:30–04:00.",
    ],
  },
  {
    id: "phase13-mndr-gent-2026-11-14",
    title: "MNDR TNDR Gent",
    slug: "mndr-tndr-gent-2026-11-14",
    shortDescription: "Singles dance/party in VIERNULVIER Gent.",
    description:
      "Lucky Lemon × MNDR TNDR Gent: singles feest met dansvloer en flirten. Geen speeddate.",
    category: "dating",
    subCategory: "singles party",
    organizerName: "Lucky Lemon",
    organizerSlug: "lucky-lemon",
    organizerWebsite: "https://www.luckylemon.be",
    seriesSlug: "mndr-tndr",
    seriesName: "MNDR TNDR",
    city: "Gent",
    venue: "VIERNULVIER",
    lat: GEO.gent.lat,
    lng: GEO.gent.lng,
    region: "Oost-Vlaanderen",
    startDate: "2026-11-14",
    startTime: "22:30",
    endTime: "04:00",
    endDate: "2026-11-15",
    price: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Lucky Lemon: singles event; flirt, dans en match in real life.",
    officialUrl: "https://www.luckylemon.be/mndrtndr",
    ticketUrl: null,
    tags: ["singles", "party", "gent"],
    activities: ["party", "dans"],
    practicalInfo: ["Sint-Pietersnieuwstraat 23, 9000 Gent"],
    moodFile: "mood-mingle-night.png",
    moodAlt: "Sfeerbeeld singles party",
    priceNote: "Ticketprijs via Lucky Lemon / ticketing.",
    reviewNotes: [
      "fase13: luckylemon.be/mndrtndr 14/11 Gent VIERNULVIER 22:30–04:00.",
    ],
  },
  {
    id: "phase13-mndr-antwerpen-2026-12-05",
    title: "MNDR TNDR Antwerpen",
    slug: "mndr-tndr-antwerpen-2026-12-05",
    shortDescription: "December-editie singles party bij Plein Publiek Antwerpen.",
    description:
      "Lucky Lemon × MNDR TNDR: singles feest Antwerpen. Geen speeddate.",
    category: "dating",
    subCategory: "singles party",
    organizerName: "Lucky Lemon",
    organizerSlug: "lucky-lemon",
    organizerWebsite: "https://www.luckylemon.be",
    seriesSlug: "mndr-tndr",
    seriesName: "MNDR TNDR",
    city: "Antwerpen",
    venue: "Plein Publiek",
    lat: GEO.antwerpen.lat,
    lng: GEO.antwerpen.lng,
    region: "Antwerpen",
    startDate: "2026-12-05",
    startTime: "23:30",
    endTime: "05:00",
    endDate: "2026-12-06",
    price: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Lucky Lemon: singles dancefloor; wing buddy mogelijk.",
    officialUrl: "https://www.luckylemon.be/mndrtndr",
    ticketUrl: null,
    tags: ["singles", "party", "antwerpen"],
    activities: ["party", "dans"],
    practicalInfo: ["Zonnestroomstraat 2A, 2020 Antwerpen"],
    moodFile: "mood-mingle-night.png",
    moodAlt: "Sfeerbeeld singles party",
    priceNote: "Ticketprijs via Lucky Lemon / ticketing.",
    reviewNotes: [
      "fase13: luckylemon.be/mndrtndr 05/12 Antwerpen 23:30–05:00.",
    ],
  },
  {
    id: "phase13-ss-stropersbos-stekene-2026-10-11",
    title: "Wandelen Stropersbos & Bedmarlinie",
    slug: "sportieve-singles-stropersbos-stekene-2026-10-11",
    shortDescription:
      "Singleswandeling 14 km door Stropersbos / Clingse bossen (grens Stekene).",
    description:
      "Sportieve Singles: grenswandeling geschiedenis + natuur. Exclusief voor singles.",
    category: "meet_new_people",
    subCategory: "singles hike",
    organizerName: "Sportieve Singles",
    organizerSlug: "sportieve-singles",
    organizerWebsite: "https://www.sportievesingles.be",
    seriesSlug: "sportieve-singles-wandelingen",
    seriesName: "Sportieve Singles wandelingen",
    city: "Stekene",
    venue: "Stekene",
    lat: GEO.stekene.lat,
    lng: GEO.stekene.lng,
    region: "Oost-Vlaanderen",
    startDate: "2026-10-11",
    startTime: "14:00",
    endTime: "18:00",
    price: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    singlesOnly: true,
    singlesOnlyEvidence: "Sportieve Singles: exclusief voor singles.",
    officialUrl: "https://www.sportievesingles.be/kalender",
    ticketUrl: null,
    tags: ["singles", "wandelen", "outdoor"],
    activities: ["wandelen", "outdoor"],
    practicalInfo: ["9190 Stekene", "Open registratie via Sportieve Singles."],
    moodFile: "mood-singles-bowling.png",
    moodAlt: "Sfeerbeeld singles outdoor",
    priceNote: "Prijs via inschrijving/kalender.",
    reviewNotes: ["fase13: kalender 11/10 Stropersbos open registratie."],
  },
  {
    id: "phase13-ss-brugse-verhalen-2026-10-17",
    title: "Brugse verhalen, sagen en legenden",
    slug: "sportieve-singles-brugse-verhalen-2026-10-17",
    shortDescription:
      "Gegidste stadswandeling voor singles in Brugge met sagen en legendes.",
    description:
      "Sportieve Singles: cultuurwandeling Brugge. Exclusief voor singles. West-Vlaanderen fill.",
    category: "meet_new_people",
    subCategory: "singles city walk",
    organizerName: "Sportieve Singles",
    organizerSlug: "sportieve-singles",
    organizerWebsite: "https://www.sportievesingles.be",
    seriesSlug: "sportieve-singles-wandelingen",
    seriesName: "Sportieve Singles wandelingen",
    city: "Brugge",
    venue: "Brugge centrum",
    lat: GEO.brugge.lat,
    lng: GEO.brugge.lng,
    region: "West-Vlaanderen",
    startDate: "2026-10-17",
    startTime: "15:00",
    endTime: "17:00",
    price: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    singlesOnly: true,
    singlesOnlyEvidence: "Sportieve Singles: exclusief voor singles.",
    officialUrl: "https://www.sportievesingles.be/kalender",
    ticketUrl: null,
    tags: ["singles", "wandelen", "brugge"],
    activities: ["wandelen"],
    practicalInfo: ["Brugge", "Open registratie."],
    moodFile: "mood-singles-bowling.png",
    moodAlt: "Sfeerbeeld singles outdoor",
    priceNote: "Prijs via inschrijving/kalender.",
    reviewNotes: ["fase13: West-VL cultuurwandeling 17/10 Brugge."],
  },
  {
    id: "phase13-ss-muziekbos-ellezelles-2026-10-18",
    title: "Van Muziekbos naar Pays des Collines",
    slug: "sportieve-singles-muziekbos-ellezelles-2026-10-18",
    shortDescription:
      "Singleswandeling 14 km van Muziekbos (Ronse) naar Ellezelles / Pays des Collines.",
    description:
      "Sportieve Singles: langere outdoorwandeling over de taalgrens. Exclusief voor singles.",
    category: "meet_new_people",
    subCategory: "singles hike",
    organizerName: "Sportieve Singles",
    organizerSlug: "sportieve-singles",
    organizerWebsite: "https://www.sportievesingles.be",
    seriesSlug: "sportieve-singles-wandelingen",
    seriesName: "Sportieve Singles wandelingen",
    city: "Ronse",
    venue: "Muziekbos",
    lat: GEO.ronse.lat,
    lng: GEO.ronse.lng,
    region: "Oost-Vlaanderen",
    startDate: "2026-10-18",
    startTime: "13:00",
    endTime: "18:00",
    price: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    singlesOnly: true,
    singlesOnlyEvidence: "Sportieve Singles: exclusief voor singles.",
    officialUrl: "https://www.sportievesingles.be/kalender",
    ticketUrl: null,
    tags: ["singles", "wandelen", "outdoor"],
    activities: ["wandelen", "outdoor"],
    practicalInfo: ["Muziekbos, 9600 Ronse"],
    moodFile: "mood-singles-bowling.png",
    moodAlt: "Sfeerbeeld singles outdoor",
    priceNote: "Prijs via inschrijving/kalender.",
    reviewNotes: ["fase13: kalender 18/10 Muziekbos–Ellezelles."],
  },
  {
    id: "phase13-ss-pleintjes-antwerpen-2026-10-18",
    title: "Pleintjeswandeling Antwerpen",
    slug: "sportieve-singles-pleintjes-antwerpen-2026-10-18",
    shortDescription:
      "Korte singles stadswandeling (~6 km) van plein tot plein in Antwerpen.",
    description:
      "Sportieve Singles: gezellige pleintjeswandeling met vrijwilliger. Exclusief voor singles.",
    category: "meet_new_people",
    subCategory: "singles city walk",
    organizerName: "Sportieve Singles",
    organizerSlug: "sportieve-singles",
    organizerWebsite: "https://www.sportievesingles.be",
    seriesSlug: "sportieve-singles-wandelingen",
    seriesName: "Sportieve Singles wandelingen",
    city: "Antwerpen",
    venue: "Steenplein",
    lat: GEO.antwerpen.lat,
    lng: GEO.antwerpen.lng,
    region: "Antwerpen",
    startDate: "2026-10-18",
    startTime: "14:00",
    endTime: "16:00",
    price: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    singlesOnly: true,
    singlesOnlyEvidence: "Sportieve Singles: exclusief voor singles.",
    officialUrl: "https://www.sportievesingles.be/kalender",
    ticketUrl: null,
    tags: ["singles", "wandelen", "antwerpen"],
    activities: ["wandelen"],
    practicalInfo: ["Steenplein 1, 2000 Antwerpen"],
    moodFile: "mood-singles-bowling.png",
    moodAlt: "Sfeerbeeld singles outdoor",
    priceNote: "Prijs via inschrijving/kalender.",
    reviewNotes: ["fase13: kalender 18/10 Pleintjeswandeling Antwerpen."],
  },
];

export function buildPhase13ExpansionBatch(): Phase13Item[] {
  return SPECS.map(fromSpec);
}

export const PHASE13_SOURCE_YIELD_UPSERTS: UpsertCatalogSourceInput[] = [
  {
    name: "LeSpeedDating",
    officialUrl: "https://www.lespeeddating.com",
    status: "active",
    regions: ["Brussel", "Wallonië"],
    formats: ["dinner", "speeddate"],
    notes:
      "[fase13] channel=organizer langs=FR yield=medium effort=medium | Dîner Dating bewezen non-speeddate (venue via SMS). 3 dinners published (BXL 30/09+01/10, Namur 08/10). Speeddate-agenda apart houden.",
    lastCheckedAt: CHECKED_AT,
  },
  {
    name: "Lucky Lemon",
    officialUrl: "https://www.luckylemon.be",
    status: "active",
    regions: ["Gent", "Antwerpen"],
    formats: ["party"],
    notes:
      "[fase13] channel=organizer langs=NL yield=medium effort=low | MNDR TNDR 3 edities (10/10, 14/11, 05/12). Sterke party-bron; ticketing via partners.",
    lastCheckedAt: CHECKED_AT,
  },
  {
    name: "Sportieve Singles",
    officialUrl: "https://www.sportievesingles.be/kalender",
    status: "active",
    regions: ["Vlaanderen", "Limburg", "West-Vlaanderen"],
    formats: ["outdoor", "weekend"],
    notes:
      "[fase13] channel=organizer langs=NL yield=high effort=medium | +4 wandelingen published (Stropersbos/Brugge/Muziekbos/Pleintjes). Parser blijft noisy; manuele curatie werkt.",
    lastCheckedAt: CHECKED_AT,
  },
  {
    name: "SoloTogether",
    officialUrl: "https://www.solotogether.be",
    status: "promising",
    regions: ["Antwerpen"],
    formats: ["activity", "food", "sport"],
    notes:
      "[fase13] channel=organizer langs=NL yield=low effort=high | Activity dating (wijn/boulder/minigolf) sterk concept; geen betrouwbare toekomstige 2026-data op site. Monitor.",
    lastCheckedAt: CHECKED_AT,
  },
  {
    name: "Will You Date Me",
    officialUrl: "https://willyoudateme.be/activiteiten/",
    status: "active",
    regions: ["Vlaanderen", "West-Vlaanderen"],
    formats: ["activity", "dinner", "bowling"],
    notes:
      "[fase13] channel=organizer langs=NL yield=medium effort=medium | Bowling al in catalogus. Dinner Roeselare 25/09 verlopen. Agenda-HTML beperkt; follow event-URLs.",
    lastCheckedAt: CHECKED_AT,
  },
];
