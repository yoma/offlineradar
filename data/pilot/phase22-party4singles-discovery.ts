/**
 * Fase 22: Party4singles (user lead) + Vlaamse non-speeddate discovery sprint.
 * Checked 2026-09-28. No crawler. No cron. No FR publish. No Wallonië growth.
 */
import type { UpsertCatalogSourceInput } from "@/lib/events/catalog-sources";
import { withUserSuppliedProvenance } from "@/lib/discovery/user-supplied";

export const PHASE22_CHECKED_AT = "2026-09-28T10:00:00.000Z";

export type Phase22Rejected = {
  name: string;
  url: string;
  reason: string;
};

export const PHASE22_REJECTED: Phase22Rejected[] = [
  {
    name: "Tour d'amour Mechelen (publieke wandeltour)",
    url: "https://app.advcollective.com/local-experts/tour-damour-publieke-wandeltour-evening-love-walk-at-fonteinbrug-mechelen",
    reason:
      "Toeristische love walk voor singles én koppels/reizigers; geen exclusieve singlesformule (Route A/B fail).",
  },
  {
    name: "Contact Beyond Contact R7 Gent (Hipsy)",
    url: "https://hipsy.be/event/245099-contact-beyond-contact-r7-gent",
    reason:
      "Somatische dans/connectie-workshop; geen singlesgate (Route A/B fail).",
  },
  {
    name: "Party4singles Facebook group",
    url: "https://www.facebook.com/groups/party4singles/",
    reason:
      "Private/login-gated group; geen discovery source. Publieke website + ticketpagina volstaan.",
  },
  {
    name: "Party4singles 1 november 2026",
    url: "https://party4singles.be/agenda/",
    reason: "Agenda toont '??? / ???'; geen concrete datum/locatie → niet importeren.",
  },
  {
    name: "Sportieve Singles wandelweekend La Roche-en-Ardenne",
    url: "https://www.sportievesingles.be/reizenvoorsingles",
    reason:
      "Wallonië/Ardennen; productstrategie = geen actieve Wallonië-groei in deze fase (niet verder uitdiepen).",
  },
  {
    name: "dare Museumdate Hasselt (Modemuseum)",
    url: "https://modemuseumhasselt.be/",
    reason: "Speeddate-format + editie 12/07/2026 past; lagere prioriteit deze non-speeddate sprint.",
  },
];

export const PHASE22_RESEARCHED = [
  "Party4singles.be home + agenda + party detail (THE NEXT CHAPTER)",
  "p4s.be ticket hub (alias Party4singles)",
  "Party CTRL BV concepts (Party4singles, Jive Nation, Soirée Dorée, SNOB, Vrijgezellig)",
  "HLN + Lier Belicht coverage La Vida Events opening",
  "How to be Single events hub (Mingle Night already published)",
  "House of Entertainment / IkWilEenTicket Mingle Night",
  "Will You Date Me Oct bowling/wandeling (already published)",
  "Sportieve Singles kalender Oct–Nov (many walks already published)",
  "SS Leuven Halloween griezelwandeling 23/10 (gap → draft)",
  "SS Kapellen Klein Schietveld 18/10 (Antwerpen-provincie gap → draft)",
  "Conscious Dating Gent (already published)",
  "Singles.be activiteiten hub (membership; sparse public detail)",
  "Club Compagnon Leuven recheck (geen nieuwe Single & Thriving future)",
  "Hipsy Gent connection events (CBC rejected)",
  "Tour d'amour Mechelen (rejected)",
] as const;

export type Phase22EditionSeed = {
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
  activities: Array<"party" | "wandelen" | "sport" | "outdoor">;
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
  /** draft | approved → approved becomes published via explicit updateEditionPublication */
  publicationIntent: "draft" | "approved";
};

const GEO = {
  lier: { lat: 51.1311, lng: 4.5704 },
  leuven: { lat: 50.8798, lng: 4.7005 },
  kapellen: { lat: 51.3131, lng: 4.4355 },
} as const;

/** Fully verified user-lead edition (publish). */
export const PHASE22_PUBLISH: Phase22EditionSeed = {
  slug: "party4singles-the-next-chapter-lier-2026-10-04",
  title: "Party4singles & Friends – The Next Chapter",
  organizerSlug: "party4singles",
  organizerName: "Party4singles",
  organizerWebsite: "https://party4singles.be",
  seriesSlug: "party4singles-friends-2-0",
  seriesName: "Party4singles & Friends 2.0",
  city: "Lier",
  region: "Antwerpen",
  lat: GEO.lier.lat,
  lng: GEO.lier.lng,
  address: "Mechelsesteenweg 380/4, 2500 Lier",
  venueName: "La Vida Events",
  startDate: "2026-10-04",
  startTime: "18:00",
  endDate: "2026-10-05",
  endTime: "00:00",
  minAge: 25,
  maxAge: null,
  preferredAudienceAgeMin: 40,
  preferredAudienceAgeMax: null,
  activities: ["party"],
  tags: ["singles", "party", "lier", "antwerpen", "40+", "friends-welcome"],
  shortDescription:
    "Stijlvolle party bij La Vida Events in Lier (40+ sfeer, min. 25). Dansen, sfeer en nieuwe mensen ontmoeten.",
  description:
    "Party4singles & Friends 2.0 – The Next Chapter op zondag 4 oktober 2026 vanaf 18u bij La Vida Events in Lier. DJ Jan Voermans met party music, ambiance, classics, jive en slows. Doelgroep vooral 40+; minimumleeftijd 25. Dresscode casual chic. Vrienden zijn welkom (geen singles-only avond), maar de brand en community blijven singlesgericht.",
  singlesOnly: false,
  singlesOnlyEvidence:
    "Route A singlesgericht (brand Party4singles, singlescommunity). Expliciet '& Friends' + site: niet-singles/dansliefhebbers welkom → singlesOnly=false.",
  officialUrl: "https://party4singles.be/party/",
  extraSourceUrls: [
    { url: "https://party4singles.be/agenda/", sourceName: "Party4singles agenda" },
    { url: "https://www.p4s.be/", sourceName: "p4s.be ticket hub" },
  ],
  priceAmount: 13.5,
  priceIsFrom: true,
  priceNote: "Kassa vóór 21u €13,50; na 21u €15; online Early Bird goedkoper (bedrag niet vast op listing).",
  subCategory: "singles party",
  reviewNotes:
    "fase22 publish | user lead Youri (FB-advertentie) onafhankelijk geverifieerd via party4singles.be + agenda + p4s.be. Datum/tijd/adres/prijskassa hard. Availability unknown.",
  publicationIntent: "approved",
};

/**
 * Strong Vlaamse non-speeddate drafts (gap fills). Max quality; not padded to 25.
 * Listing evidence via Sportieve Singles kalender (organizer).
 */
export const PHASE22_DRAFTS: Phase22EditionSeed[] = [
  {
    slug: "sportieve-singles-leuven-griezel-2026-10-23",
    title: "Waargebeurde Leuvense griezel- en gruwelverhalen",
    organizerSlug: "sportieve-singles",
    organizerName: "Sportieve Singles",
    organizerWebsite: "https://www.sportievesingles.be",
    seriesSlug: "sportieve-singles-wandelingen",
    seriesName: "Sportieve Singles wandelingen",
    city: "Leuven",
    region: "Vlaams-Brabant",
    lat: GEO.leuven.lat,
    lng: GEO.leuven.lng,
    address: null,
    venueName: null,
    startDate: "2026-10-23",
    startTime: "19:00",
    endDate: null,
    endTime: "21:00",
    minAge: null,
    maxAge: null,
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    activities: ["wandelen", "outdoor"],
    tags: ["singles", "wandelen", "leuven", "vlaams-brabant", "culture"],
    shortDescription:
      "Halloween-thema stadswandeling met gids in Leuven voor singles (Sportieve Singles).",
    description:
      "Sportieve Singles: waargebeurde Leuvense griezel- en gruwelverhalen. Wandeling met gids in Leuven, vrijdag 23 oktober 2026 19:00–21:00. Expliciet singlesactiviteit.",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Sportieve Singles = singlesorganisatie; kalenderlisting exclusief voor singles.",
    officialUrl: "https://www.sportievesingles.be/kalender",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via online registratie op SS-kalender (bedrag niet in listingstekst).",
    subCategory: "singles walk",
    reviewNotes:
      "fase22 draft | Leuven city non-speeddate gap fill. Evidence: SS kalender 23/10/2026. Draft tot detailpagina/prijs hard bevestigd.",
    publicationIntent: "draft",
  },
  {
    slug: "sportieve-singles-klein-schietveld-kapellen-2026-10-18",
    title: "Wandeling Klein Schietveld (bossen, heide & villa-spotting)",
    organizerSlug: "sportieve-singles",
    organizerName: "Sportieve Singles",
    organizerWebsite: "https://www.sportievesingles.be",
    seriesSlug: "sportieve-singles-wandelingen",
    seriesName: "Sportieve Singles wandelingen",
    city: "Kapellen",
    region: "Antwerpen",
    lat: GEO.kapellen.lat,
    lng: GEO.kapellen.lng,
    address: null,
    venueName: "Klein Schietveld",
    startDate: "2026-10-18",
    startTime: "14:00",
    endDate: null,
    endTime: "18:00",
    minAge: null,
    maxAge: null,
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    activities: ["wandelen", "outdoor", "sport"],
    tags: ["singles", "wandelen", "kapellen", "brasschaat", "antwerpen-provincie"],
    shortDescription:
      "14 km singleswandeling door Klein Schietveld (Kapellen/Brasschaat) via Sportieve Singles.",
    description:
      "Sportieve Singles: mix van bossen, heide en villa-spotting (±14 km) in Klein Schietveld, Kapellen. Zondag 18 oktober 2026 14:00–18:00. Antwerpen-provincie buiten centrum.",
    singlesOnly: true,
    singlesOnlyEvidence:
      "Sportieve Singles = singlesorganisatie; kalenderlisting exclusief voor singles.",
    officialUrl: "https://www.sportievesingles.be/kalender",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs via online registratie op SS-kalender.",
    subCategory: "singles walk",
    reviewNotes:
      "fase22 draft | Antwerpen-provincie (Kapellen) gap. Evidence: SS kalender 18/10/2026. Draft tot prijs hard.",
    publicationIntent: "draft",
  },
];

export const PHASE22_ALL_EDITIONS: Phase22EditionSeed[] = [
  PHASE22_PUBLISH,
  ...PHASE22_DRAFTS,
];

export const PHASE22_SOURCE_UPSERTS: UpsertCatalogSourceInput[] = [
  {
    name: "Party4singles",
    officialUrl: "https://party4singles.be",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Lier", "Antwerpen", "Willebroek", "Vlaanderen"],
    formats: ["party"],
    status: "active",
    lastCheckedAt: PHASE22_CHECKED_AT,
    notes: withUserSuppliedProvenance(
      "[fase22] channel=organizer+facebook_ad discovery_channel=facebook langs=NL yield=high effort=low | Structurele maandelijkse party (20+ jaar). Thuisbasis La Vida Events Lier; ook Strantwerpen + Willy's Moustache Willebroek op agenda. Instagram signal @party4singles.be. Parser: medium (agenda HTML) / manual for tickets. Ticket hub p4s.be.",
      "Manuele lead Youri (publieke FB-advertentie The Next Chapter).",
    ),
  },
  {
    name: "Party4singles agenda",
    officialUrl: "https://party4singles.be/agenda/",
    sourceKind: "organizer_source",
    sourceType: "event_series",
    regions: ["Lier", "Antwerpen", "Vlaanderen"],
    formats: ["party"],
    status: "active",
    lastCheckedAt: PHASE22_CHECKED_AT,
    notes: withUserSuppliedProvenance(
      "[fase22] channel=organizer langs=NL yield=medium effort=low | Canonical future-date listing. 04/10 The Next Chapter; 01/11 TBD. Parser: medium.",
    ),
  },
  {
    name: "Party CTRL BV",
    officialUrl: "https://www.partyctrl.be",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Antwerpen", "Vlaanderen"],
    formats: ["party"],
    status: "promising",
    lastCheckedAt: PHASE22_CHECKED_AT,
    notes:
      "[fase22] channel=organizer langs=NL yield=low effort=medium | Holding voor Party4singles / Jive Nation / Soirée Dorée / SNOB / Vrijgezellig. Geen aparte future listings in sweep buiten Party4singles. Parser: manual only.",
  },
  {
    name: "How to be Single / House of Entertainment",
    officialUrl: "https://howtobesingle.be",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Antwerpen", "Vlaanderen"],
    formats: ["party"],
    status: "active",
    lastCheckedAt: PHASE22_CHECKED_AT,
    notes:
      "[fase22] channel=organizer+ticket langs=NL yield=high effort=low | Mingle Night 17/10 Antwerp Expo already published. Events hub: next public party = Mingle Night; Girlstrip 2027. Parser: medium (ticket platforms).",
  },
  {
    name: "Will You Date Me",
    officialUrl: "https://willyoudateme.be",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Vlaanderen", "Antwerpen", "West-Vlaanderen", "Vlaams-Brabant"],
    formats: ["bowling", "wandelen", "apero", "dinner", "party"],
    status: "active",
    lastCheckedAt: PHASE22_CHECKED_AT,
    notes:
      "[fase22] channel=organizer langs=NL yield=medium effort=medium | Oct: Kortrijk bowling 02/10 + Antwerpen bowling 24/10 + Tremelo wandeling 04/10 already published. Geen nieuwe Leuven-city dinner/party in sweep. Parser: good.",
  },
  {
    name: "Sportieve Singles",
    officialUrl: "https://www.sportievesingles.be/kalender",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Vlaanderen", "Limburg", "Antwerpen", "Oost-Vlaanderen", "West-Vlaanderen", "Vlaams-Brabant"],
    formats: ["wandelen", "outdoor", "weekend"],
    status: "active",
    lastCheckedAt: PHASE22_CHECKED_AT,
    notes:
      "[fase22] channel=organizer langs=NL yield=high effort=low | Sterke walk coverage; Leuven city gap deels gedicht via 23/10 griezel draft. Kapellen 18/10 draft. Limburg: Bolderberg published; weinig non-walk formats. Parser: good (refresh pilot).",
  },
  {
    name: "Singles.be",
    officialUrl: "https://singles.be",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Vlaanderen", "België"],
    formats: ["wandelen", "culture", "dinner", "outdoor"],
    status: "active",
    lastCheckedAt: PHASE22_CHECKED_AT,
    notes:
      "[fase22] channel=organizer langs=NL yield=medium effort=high | Membership agenda; publieke detailpagina's beperkt/HTML zwaar. Monitor voor Leuven/Limburg culture/dinner. Parser: medium/manual.",
  },
];
