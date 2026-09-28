/**
 * Fase 24: Vlaamse discovery gaps — non-speeddate density.
 * Checked 2026-09-28. No Party4singles parser. No FR/Wallonië growth. No NL import.
 * Draft/review only — never auto-publish.
 */
import type { UpsertCatalogSourceInput } from "@/lib/events/catalog-sources";

export const PHASE24_CHECKED_AT = "2026-09-28T18:00:00.000Z";

export type Phase24Rejected = {
  name: string;
  url: string;
  reason: string;
};

export const PHASE24_REJECTED: Phase24Rejected[] = [
  {
    name: "Girls Leuven It Up — Pasta & Spritz Night (KRUUL)",
    url: "https://somo.social/e/pasta-spritz-night-3-oktober-2026",
    reason:
      "Vrouwen-socialclub (vriendschap 20s/30s); geen singlesgate. Route A/B fail.",
  },
  {
    name: "Club Compagnon Pizza x Leaders / Pizza x Entrepreneurs",
    url: "https://clubcompagnon.be/",
    reason:
      "Netwerk-/entrepreneur-avonden; geen singlesformule. Single & Thriving Dinner 18/09 is voorbij.",
  },
  {
    name: "Ontvlam meets Ritual Dance Gent 10/10",
    url: "https://hipsy.be/event/227048-ontvlam-meets-ritual-dance",
    reason:
      "Authentiek daten + dans voor singles én niet-singles (diepere vriendschap). Geen exclusieve singlesformule.",
  },
  {
    name: "Taste of Tantra Antwerpen (Hipsy)",
    url: "https://hipsy.be/events?query=singles",
    reason: "Tantra voor singles én mensen die alleen komen; geen Route A singles-event.",
  },
  {
    name: "Single Bells XXL Mechelen 2026",
    url: "https://billetto.be/en/e/single-bells-xxl-kerstfeest-voor-singles-friends-Tickets-1736685",
    reason:
      "Enkele bevestigde editie = 28/12/2025. Geen publieke 2026-datum/ticket → niet importeren.",
  },
  {
    name: "Looking4Love / Agape Haacht",
    url: "https://linktr.ee/lookingforlovebyagape",
    reason:
      "Laatste BE-editie Haacht 22/11/2025; geen toekomstige Vlaamse listing in sweep. NL-first.",
  },
  {
    name: "Bornedries lifestyle / retro Sint-Truiden",
    url: "https://erotischeparties.nl/agenda/limo-nights/",
    reason: "Adult lifestyle club — irrelevant voor OfflineRadar singles catalogus.",
  },
  {
    name: "Will You Date Me Singles Dinner Roeselare 25/09",
    url: "https://willyoudateme.be/singles-dinner-in-roeselare-25-september-2026/",
    reason: "Datum voorbij (25/09). Oct–Dec dinner/apero-kalender leeg op activiteiten-hub.",
  },
  {
    name: "S-Plus Apero Solo Diegem 28/09",
    url: "https://www.s-plusvzw.be/apero-solo",
    reason: "Datum vandaag namiddag voorbij op discovery-moment (28/09 avond).",
  },
  {
    name: "Hipsy NL Singles Dating Night Amsterdam",
    url: "https://hipsy.be/events?query=singles",
    reason: "Nederland — geen actieve NL-import deze fase.",
  },
];

export const PHASE24_RESEARCHED = [
  "Neon baseline: Leuven/VB, Limburg, Oost-Vl, West-Vl, Antwerpen-prov published/draft buckets",
  "Sportieve Singles kalender Oct (walk-heavy; synagoge Antwerpen missing)",
  "Will You Date Me activiteiten hub + bowling Antwerpen/Kortrijk (already published)",
  "S-Plus vzw Apero Solo / Foodies / West-Vl soep (Limburg dinner gap)",
  "Club Compagnon Leuven (geen future singles dinner)",
  "Party4singles niet opnieuw technisch uitgewerkt (brief)",
  "HopToDate Vlaanderen single-events (speeddate-dominant; lagere prioriteit)",
  "Hipsy singles query (veel NL/tantra/mixed → rejected)",
  "Single Events 2800 / Single Bells (geen 2026 datum)",
  "Singles.be homepage (membership; publieke future sparse)",
  "Looking4Love Agape (NL + oude Haacht)",
] as const;

export type Phase24EditionSeed = {
  slug: string;
  title: string;
  organizerSlug: string;
  organizerName: string;
  organizerWebsite: string;
  seriesSlug: string;
  seriesName: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  address: string | null;
  venueName: string | null;
  startDate: string;
  startTime: string;
  endDate: string | null;
  endTime: string;
  minAge: number | null;
  maxAge: number | null;
  preferredAudienceAgeMin: number | null;
  preferredAudienceAgeMax: number | null;
  activities: Array<
    | "party"
    | "wandelen"
    | "sport"
    | "outdoor"
    | "eten"
    | "drinken"
    | "workshop"
    | "dans"
  >;
  tags: string[];
  shortDescription: string;
  description: string;
  singlesOnly: boolean;
  singlesOnlyEvidence: string;
  officialUrl: string;
  extraSourceUrls?: Array<{ url: string; sourceName: string }>;
  priceAmount: number | null;
  priceIsFrom: boolean;
  priceNote: string | null;
  subCategory: string;
  reviewNotes: string;
  publicationIntent: "draft";
};

const GEO = {
  antwerpen: { lat: 51.2194, lng: 4.4025 },
  kuringen: { lat: 50.958, lng: 5.309 },
  lauwe: { lat: 50.7906, lng: 3.1814 },
  brugge: { lat: 51.2093, lng: 3.2247 },
} as const;

/**
 * Strong verified future non-speeddate drafts (quality > volume).
 * Limburg dinner + West-Vl food/drinks + Antwerpen culture.
 */
export const PHASE24_DRAFTS: Phase24EditionSeed[] = [
  {
    slug: "sportieve-singles-synagoge-antwerpen-2026-10-11",
    title: "Culturele wandeling met synagogebezoek Antwerpen",
    organizerSlug: "sportieve-singles",
    organizerName: "Sportieve Singles",
    organizerWebsite: "https://www.sportievesingles.be",
    seriesSlug: "sportieve-singles-wandelingen",
    seriesName: "Sportieve Singles wandelingen",
    city: "Antwerpen",
    region: "Antwerpen",
    lat: GEO.antwerpen.lat,
    lng: GEO.antwerpen.lng,
    address: null,
    venueName: null,
    startDate: "2026-10-11",
    startTime: "13:30",
    endDate: null,
    endTime: "15:30",
    minAge: null,
    maxAge: null,
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    activities: ["wandelen", "workshop"],
    tags: ["singles", "cultuur", "antwerpen", "wandelen"],
    shortDescription:
      "Singles culturele wandeling met synagogebezoek en joodse buurt in Antwerpen (Sportieve Singles).",
    description:
      "Sportieve Singles: culturele wandeling met synagogebezoek in Antwerpen op zondag 11 oktober 2026, 13:30–15:30. Ontvangst door moderne orthodoxe gids (±30 min), daarna wandeling door de joodse buurt. Afsluiten met een drankje. Synagogebezoek: €5 cash extra.",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Sportieve Singles = singlesorganisatie; eventlisting exclusief voor singles.",
    officialUrl:
      "https://www.sportievesingles.be/events/een-culturele-wandeling-met-synagogebezoek-met-gids-in-antwerpen",
    extraSourceUrls: [
      {
        url: "https://www.sportievesingles.be/kalender",
        sourceName: "Sportieve Singles kalender",
      },
    ],
    priceAmount: 16,
    priceIsFrom: false,
    priceNote: "Ticket €16 + €5 synagogebezoek (cash, gids).",
    subCategory: "singles culture walk",
    reviewNotes:
      "fase24 draft | Antwerpen culture/social gap (non-speeddate). Evidence: SS event page 11/10/2026. Draft; human review.",
    publicationIntent: "draft",
  },
  {
    slug: "s-plus-foodies-kuringen-2026-10-19",
    title: "S-Plus Gezellige foodies — samen koken Kuringen",
    organizerSlug: "s-plus",
    organizerName: "S-Plus vzw",
    organizerWebsite: "https://www.s-plusvzw.be",
    seriesSlug: "s-plus-foodies-limburg",
    seriesName: "S-Plus Gezellige foodies Limburg",
    city: "Kuringen",
    region: "Limburg",
    lat: GEO.kuringen.lat,
    lng: GEO.kuringen.lng,
    address: "Joris van Oostenrijkstraat 65, 3511 Kuringen",
    venueName: "Gildezaal (keuken)",
    startDate: "2026-10-19",
    startTime: "15:00",
    endDate: null,
    endTime: "18:00",
    minAge: 50,
    maxAge: null,
    preferredAudienceAgeMin: 50,
    preferredAudienceAgeMax: null,
    activities: ["eten", "workshop"],
    tags: ["singles", "alleenstaanden", "eten", "limburg", "hasselt", "50+"],
    shortDescription:
      "Alleenstaanden koken en tafelen samen in Kuringen (Hasselt) via S-Plus Foodies — 50+.",
    description:
      "S-Plus Limburg: Gezellige foodies voor alleenstaanden. Samen koken, tafelen en recepten delen in de Gildezaal-keuken, Kuringen (Hasselt). Maandag 19 oktober 2026, 15:00–18:00. Basisprijs €20 / S-Plus leden €15. Route A: expliciet alleenstaanden-programma.",
    singlesOnly: true,
    singlesOnlyEvidence:
      "S-Plus Apero Solo / Foodies = programma voor alleenstaanden (singles 50+).",
    officialUrl: "https://www.s-plusvzw.be/apero-solo",
    priceAmount: 20,
    priceIsFrom: false,
    priceNote: "Basisprijs €20; S-Plus leden €15. Inschrijven limburg@s-plusvzw.be.",
    subCategory: "singles dinner / cooking",
    reviewNotes:
      "fase24 draft | Limburg non-speeddate dinner/food gap. Evidence: s-plusvzw.be/apero-solo Foodies data 19/10 + 30/11. Draft.",
    publicationIntent: "draft",
  },
  {
    slug: "s-plus-foodies-kuringen-2026-11-30",
    title: "S-Plus Gezellige foodies — samen koken Kuringen",
    organizerSlug: "s-plus",
    organizerName: "S-Plus vzw",
    organizerWebsite: "https://www.s-plusvzw.be",
    seriesSlug: "s-plus-foodies-limburg",
    seriesName: "S-Plus Gezellige foodies Limburg",
    city: "Kuringen",
    region: "Limburg",
    lat: GEO.kuringen.lat,
    lng: GEO.kuringen.lng,
    address: "Joris van Oostenrijkstraat 65, 3511 Kuringen",
    venueName: "Gildezaal (keuken)",
    startDate: "2026-11-30",
    startTime: "15:00",
    endDate: null,
    endTime: "18:00",
    minAge: 50,
    maxAge: null,
    preferredAudienceAgeMin: 50,
    preferredAudienceAgeMax: null,
    activities: ["eten", "workshop"],
    tags: ["singles", "alleenstaanden", "eten", "limburg", "hasselt", "50+"],
    shortDescription:
      "Tweede Foodies-editie voor alleenstaanden in Kuringen (Hasselt) — 30 november.",
    description:
      "S-Plus Limburg: Gezellige foodies voor alleenstaanden. Samen koken en tafelen, Gildezaal Kuringen. Maandag 30 november 2026, 15:00–18:00. Basisprijs €20 / leden €15.",
    singlesOnly: true,
    singlesOnlyEvidence:
      "S-Plus Foodies = alleenstaanden-programma Limburg.",
    officialUrl: "https://www.s-plusvzw.be/apero-solo",
    priceAmount: 20,
    priceIsFrom: false,
    priceNote: "Basisprijs €20; S-Plus leden €15.",
    subCategory: "singles dinner / cooking",
    reviewNotes:
      "fase24 draft | Tweede Limburg Foodies-editie. Evidence: zelfde S-Plus listing (30/11).",
    publicationIntent: "draft",
  },
  {
    slug: "s-plus-soep-lauwe-2026-10-01",
    title: "S-Plus Soep soep-eren — samen soep maken Lauwe",
    organizerSlug: "s-plus",
    organizerName: "S-Plus vzw",
    organizerWebsite: "https://www.s-plusvzw.be",
    seriesSlug: "s-plus-west-vlaanderen-alleenstaanden",
    seriesName: "S-Plus West-Vlaanderen alleenstaanden",
    city: "Lauwe",
    region: "West-Vlaanderen",
    lat: GEO.lauwe.lat,
    lng: GEO.lauwe.lng,
    address: null,
    venueName: "Het Applauwe (Lauwe / LDC Menen)",
    startDate: "2026-10-01",
    startTime: "16:00",
    endDate: null,
    endTime: "18:00",
    minAge: 50,
    maxAge: null,
    preferredAudienceAgeMin: 50,
    preferredAudienceAgeMax: null,
    activities: ["eten", "workshop"],
    tags: ["singles", "alleenstaanden", "eten", "west-vlaanderen", "menen", "50+"],
    shortDescription:
      "Alleenstaanden maken samen verse soep in Lauwe (West-Vlaanderen) — S-Plus.",
    description:
      "S-Plus West-Vlaanderen: Soep soep-eren. Samen verse soep maken en opeten met stokbrood. Woensdag 1 oktober 2026 om 16:00 bij Het Applauwe in Lauwe (samenwerking LDC Menen). €4 per namiddag.",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Onder S-Plus alleenstaanden-aanbod (Apero Solo-pagina).",
    officialUrl: "https://www.s-plusvzw.be/apero-solo",
    priceAmount: 4,
    priceIsFrom: false,
    priceNote: "€4 (soep, brood, water).",
    subCategory: "singles food workshop",
    reviewNotes:
      "fase24 draft | West-Vl food/workshop gap (non-speeddate). Evidence: S-Plus Apero Solo West-Vl block. Draft.",
    publicationIntent: "draft",
  },
  {
    slug: "s-plus-aperitieven-brugge-2026-10-01",
    title: "S-Plus Gezellig aperitieven Brugge",
    organizerSlug: "s-plus",
    organizerName: "S-Plus vzw",
    organizerWebsite: "https://www.s-plusvzw.be",
    seriesSlug: "s-plus-brugge-aperitieven",
    seriesName: "S-Plus Gezellig aperitieven Brugge",
    city: "Brugge",
    region: "West-Vlaanderen",
    lat: GEO.brugge.lat,
    lng: GEO.brugge.lng,
    address: null,
    venueName: null,
    startDate: "2026-10-01",
    startTime: "14:00",
    endDate: null,
    endTime: "16:00",
    minAge: 50,
    maxAge: null,
    preferredAudienceAgeMin: 50,
    preferredAudienceAgeMax: null,
    activities: ["drinken"],
    tags: ["singles", "alleenstaanden", "apero", "brugge", "west-vlaanderen", "50+"],
    shortDescription:
      "Maandelijks gratis aperitief voor alleenstaanden in Brugge (S-Plus, 1e donderdag).",
    description:
      "S-Plus West-Vlaanderen: Gezellig aperitieven — elke 1e donderdag van de maand in Brugge. Volgende concrete editie: donderdag 1 oktober 2026 (1e donderdag). Gratis; inschrijven via 050 44 79 52. Exacte locatie/tijd via S-Plus West-Vl (unknown → unknown gelaten).",
    singlesOnly: true,
    singlesOnlyEvidence:
      "S-Plus alleenstaanden-aanbod West-Vlaanderen.",
    officialUrl: "https://www.s-plusvzw.be/apero-solo",
    priceAmount: 0,
    priceIsFrom: false,
    priceNote: "Gratis. Exacte locatie via S-Plus West-Vl.",
    subCategory: "singles apero",
    reviewNotes:
      "fase24 draft | West-Vl drinks/apero gap. Recurring 1e donderdag → Oct 1 hard als next occurrence. Tijd/locatie unknown (niet gokken). Draft tot admin bevestigt locatie.",
    publicationIntent: "draft",
  },
];

export const PHASE24_SOURCE_UPSERTS: UpsertCatalogSourceInput[] = [
  {
    name: "S-Plus vzw (alleenstaanden / Apero Solo)",
    officialUrl: "https://www.s-plusvzw.be/apero-solo",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: [
      "Limburg",
      "West-Vlaanderen",
      "Vlaams-Brabant",
      "Oost-Vlaanderen",
      "Antwerpen",
      "Mechelen",
    ],
    formats: ["apero", "dinner", "workshop", "wandelen"],
    status: "active",
    lastCheckedAt: PHASE24_CHECKED_AT,
    notes:
      "[fase24] channel=organizer langs=NL yield=high effort=low | Senioren/alleenstaanden 50+. Limburg Foodies 19/10+30/11 = zeldzame non-speeddate dinner in Hasselt-regio. West-Vl soep Lauwe 01/10 + Brugge aperitieven. Mechelen Apero Solo 02/10 already published. Parser: manual only (statische pagina, geen machine-agenda).",
  },
  {
    name: "S-Plus vzw",
    officialUrl: "https://www.s-plusvzw.be",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Vlaanderen"],
    formats: ["apero", "dinner", "workshop", "wandelen", "culture"],
    status: "active",
    lastCheckedAt: PHASE24_CHECKED_AT,
    notes:
      "[fase24] channel=organizer langs=NL yield=medium effort=medium | Koepel seniorenvereniging; alleenstaanden-track via /apero-solo. Geen crawler. Parser: manual only.",
  },
  {
    name: "Single Events 2800 / Single Bells XXL",
    officialUrl:
      "https://billetto.be/en/e/single-bells-xxl-kerstfeest-voor-singles-friends-Tickets-1736685",
    sourceKind: "organizer_source",
    sourceType: "community",
    regions: ["Mechelen", "Antwerpen"],
    formats: ["party", "workshop", "wandelen"],
    status: "promising",
    lastCheckedAt: PHASE24_CHECKED_AT,
    notes:
      "[fase24] channel=instagram_first+ticket langs=NL yield=medium effort=high | Single Bells XXL Mechelen 28/12/2025 bewezen (Billetto/VRT/HLN). Geen publieke 2026-datum → monitor; niet importeren zonder concrete edition. Parser: manual only.",
  },
  {
    name: "Club Compagnon",
    officialUrl: "https://clubcompagnon.be/",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Leuven", "Vlaams-Brabant", "Genk", "Limburg"],
    formats: ["dinner"],
    status: "promising",
    lastCheckedAt: PHASE24_CHECKED_AT,
    notes:
      "[fase24] channel=organizer+IG langs=NL yield=low effort=medium | Single & Thriving Dinner 18/09 Leuven (voorbij). Nov = Pizza networking (geen singlesgate). Leuven-city dinner/party blijft gap. Parser: manual only.",
  },
  {
    name: "Will You Date Me",
    officialUrl: "https://willyoudateme.be",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Vlaanderen", "Antwerpen", "West-Vlaanderen", "Vlaams-Brabant", "Oost-Vlaanderen"],
    formats: ["bowling", "wandelen", "apero", "dinner", "party"],
    status: "active",
    lastCheckedAt: PHASE24_CHECKED_AT,
    notes:
      "[fase24] channel=organizer langs=NL yield=medium effort=medium | Oct–Dec: bowling Kortrijk/Antwerpen/Ieper/Aalst already published; wandeling Tremelo published. Dinner/apero-kalender leeg na zomer. Geen Leuven-city party/dinner. Parser: good.",
  },
  {
    name: "Sportieve Singles",
    officialUrl: "https://www.sportievesingles.be/kalender",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: [
      "Vlaanderen",
      "Limburg",
      "Antwerpen",
      "Oost-Vlaanderen",
      "West-Vlaanderen",
      "Vlaams-Brabant",
    ],
    formats: ["wandelen", "outdoor", "weekend", "culture"],
    status: "active",
    lastCheckedAt: PHASE24_CHECKED_AT,
    notes:
      "[fase24] channel=organizer langs=NL yield=high effort=low | Walk-dominant. Synagoge Antwerpen 11/10 → draft. Leuven griezel + Kapellen blijven fase22 drafts. Limburg non-walk formats blijven schaars. Parser: good (scheduled refresh).",
  },
  {
    name: "Looking4Love / Agape",
    officialUrl: "https://linktr.ee/lookingforlovebyagape",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Vlaanderen", "Nederland", "Haacht"],
    formats: ["party", "drinks"],
    status: "low_yield",
    lastCheckedAt: PHASE24_CHECKED_AT,
    notes:
      "[fase24] channel=linktree+IG langs=NL yield=low effort=high | Christelijke singlesavonden; BE Haacht historisch; actueel NL-zwaartepunt. Geen future BE edition. Later NL-expansie relevant. Parser: manual only.",
  },
];

/** Organizers that also operate in NL — for later expansion notes only (no import). */
export const PHASE24_NL_EXPANSION_NOTES = [
  "Looking4Love / Agape — NL primary + occasional BE",
  "The Love Doctor — Gent/Antwerpen + NL signals",
  "Hipsy — strong NL singles/tantra inventory (not imported)",
  "Eventgoose / Hipsy ticket platforms — BE+NL discovery",
] as const;
