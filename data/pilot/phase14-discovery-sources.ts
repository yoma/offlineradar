/**
 * Fase 14 discovery sweep results (2026-09-26).
 * Source Map upserts + user-supplied provenance + rejected candidates.
 * No crawler. No auto-publish.
 */
import type { UpsertCatalogSourceInput } from "@/lib/events/catalog-sources";
import {
  USER_SUPPLIED_TAG,
  withUserSuppliedProvenance,
} from "@/lib/discovery/user-supplied";

export const PHASE14_CHECKED_AT = "2026-09-26T22:30:00.000Z";

/** Explicit user-supplied / product-owner finds (Youri). */
export const PHASE14_USER_SUPPLIED_AUDIT = [
  {
    name: "Tomeeto",
    url: "https://tomeeto.be",
    wasInMap: false,
    eventsProcessed: false,
    missed: true,
    action: "Add as active travel organizer; draft future trips; tag discovered_by=user",
  },
  {
    name: "The Sircle",
    url: "https://thesircle.be/events/",
    wasInMap: true,
    eventsProcessed: true,
    missed: false,
    action: "Tag user-supplied; Padeldate remains under_review (date conflict)",
  },
  {
    name: "Farm Date / AgriMatching",
    url: "https://www.agrimatching.com/en",
    wasInMap: true,
    eventsProcessed: false,
    missed: false,
    action: "Tag user-supplied; keep low_yield (app-first, no concrete BE Farm Date edition)",
  },
] as const;

export type Phase14Rejected = {
  name: string;
  url: string;
  reason: string;
};

export const PHASE14_REJECTED: Phase14Rejected[] = [
  {
    name: "PadelMax",
    url: "https://www.padel-max.be",
    reason: "Corporate/social padel; geen expliciete singlesformule (Route A/B fail).",
  },
  {
    name: "Playtomic",
    url: "https://playtomic.io",
    reason: "Sportapp; geen singles offline agenda.",
  },
  {
    name: "AgriMatching app-only (no Farm Date edition)",
    url: "https://www.agrimatching.com/en",
    reason:
      "App/dating platform; geen bewezen toekomstige BE Farm Date editie met datum+locatie.",
  },
  {
    name: "Generic Meetup social Brussels",
    url: "https://www.meetup.com/find/?keywords=social&location=be--brussels",
    reason: "Friendship/expat noise; anti-pattern.",
  },
  {
    name: "DTNG Padel (NL)",
    url: "https://www.eventbrite.nl",
    reason: "Nederlandse padel singles; buiten BE-focus.",
  },
];

/** Researched candidates this sweep (beyond upserts). For eindrapport count. */
export const PHASE14_RESEARCHED_CANDIDATE_NAMES = [
  "Tomeeto",
  "Juntas",
  "Date-Love",
  "Full of Wonder",
  "Funky Fish / SingleCamps",
  "PadelMax",
  "Playtomic",
  "Speed Dating Bruxelles (recheck)",
  "Club Compagnon / KRUUL (recheck)",
  "The Love Doctor (recheck non-speeddate)",
  "Hellotravel (recheck)",
  "VillaVibes (recheck)",
  "Anders Reizen (recheck)",
  "noSun Reizen (recheck)",
  "Looking4Love (recheck)",
  "Sacred Healing Arts (recheck)",
  "dare Events (recheck)",
  "Out.be (recheck)",
  "StayHappening (recheck)",
  "Eventbrite singles-party (recheck)",
  "Instagram #singlesbelgium (signal)",
  "Facebook Events singles BE (signal)",
  "Billetweb célibataires BE",
  "SingleCamps outdoor Ardennen",
  "Joker singles groepsreizen",
  "Alleenreizenden 50plus (legacy → Juntas)",
  "Mangia's / Juntas partners",
  "surf & turf Tomeeto series",
  "padelvakantie Tomeeto series",
  "Herve weekend Tomeeto",
  "Vurig Luik Tomeeto",
  "Kosy Greece Tomeeto",
  "Hola Mallorca Tomeeto",
  "Fiesta Gran Canaria Tomeeto",
  "Shortski Tomeeto",
  "Skiweek Tomeeto",
  "Winterwonder Tirol Tomeeto",
  "Winterzonvakantie Tomeeto",
  "Juntas Sicilië singles-only",
  "Juntas Algarve singles-only",
  "Full of Wonder Autumn of Awakening",
  "Date-Love Liège/Namur/Bruxelles 2027",
  "LeSpeedDating dinner track (known)",
  "Lucky Lemon party track (known)",
  "SoloTogether activity dating (known gap)",
  "The Mixer Brussels (known)",
  "Cœur à Cœur (known)",
] as const;

export const PHASE14_SOURCE_UPSERTS: UpsertCatalogSourceInput[] = [
  {
    name: "Tomeeto",
    officialUrl: "https://tomeeto.be",
    status: "active",
    sourceType: "organizer",
    regions: ["België", "Mechelen", "Vlaanderen", "nationaal"],
    formats: ["travel", "weekend", "sport", "ski", "outdoor"],
    notes: withUserSuppliedProvenance(
      `[fase14] channel=organizer langs=NL yield=high effort=medium | Vlaamse singlesreisorganisator (Mechelen). Leeftijdsgroepen + m/v 60/40. Rijke 2026–2027 agenda (Herve weekends, ski, padel, Mallorca, Gran Canaria, surf). newsletter_available=true (via site). Parser: medium (HTML product pages). ${USER_SUPPLIED_TAG} was volledig gemist vóór fase14.`,
    ),
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Tomeeto singles aanbod hub",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    status: "active",
    sourceType: "organizer",
    regions: ["België", "nationaal"],
    formats: ["travel", "weekend"],
    notes: withUserSuppliedProvenance(
      "[fase14] channel=organizer langs=NL yield=high | Canonical trip list hub voor Tomeeto singlesvakanties.",
    ),
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "The Sircle",
    officialUrl: "https://thesircle.be/events/",
    status: "promising",
    sourceType: "organizer",
    regions: ["Antwerpen"],
    formats: ["sport", "apero", "outdoor"],
    notes: withUserSuppliedProvenance(
      "[fase14] channel=organizer langs=NL yield=medium | Padeldate 3.0 listing 13/10 vs detail 31/10 → under_review. Willy's Moustache 27/06 (verleden). Activity dating potentieel.",
    ),
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Farm Date / AgriMatching",
    officialUrl: "https://www.agrimatching.com/en",
    status: "low_yield",
    sourceType: "other",
    regions: ["Vlaanderen", "België"],
    formats: ["outdoor", "meetup"],
    notes: withUserSuppliedProvenance(
      "[fase14] channel=app+events langs=EN,NL yield=low | App-first rural dating; geen concrete BE Farm Date editie met datum+venue na hercontrole. Monitor offline events feed.",
    ),
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Juntas",
    officialUrl: "https://juntas.be/groepsreizen-voor-singles/",
    status: "active",
    sourceType: "organizer",
    regions: ["België", "Oost-Vlaanderen", "nationaal"],
    formats: ["travel", "weekend"],
    notes:
      "[fase14] channel=organizer langs=NL yield=high effort=medium | Groepsreizen singles/alleenreizenden 45+. Exclusief single-only label + 25% single garantie op mixed trips. Vertrek BE. Blind travel query hit.",
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Juntas exclusief singles",
    officialUrl: "https://juntas.be/?reis_label=single-only",
    status: "active",
    sourceType: "organizer",
    regions: ["België", "nationaal"],
    formats: ["travel"],
    notes:
      "[fase14] channel=organizer langs=NL yield=high | Filter hub single-only trips (Sicilië/Algarve e.a.).",
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Date-Love",
    officialUrl: "https://www.date-love.be",
    status: "promising",
    sourceType: "organizer",
    regions: ["Brussel", "Liège", "Namur", "Wallonië"],
    formats: ["speeddate"],
    notes:
      "[fase14] channel=organizer langs=FR yield=medium effort=low | FR speeddate Brussel/Liège/Namur; agenda toont vooral 2027. Regionale FR-uitbreiding naast HopToDate/LeSpeedDating.",
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Full of Wonder",
    officialUrl: "https://fullofwonder.be",
    status: "promising",
    sourceType: "organizer",
    regions: ["Wallonië", "Ardennen", "België"],
    formats: ["workshop", "wellness", "weekend"],
    notes:
      "[fase14] channel=organizer langs=NL yield=medium effort=medium | Singles retreats (geen klassieke dating). Autumn of Awakening 18–20/09/2026 Orval was net gepasseerd bij sweep; monitor volgende. Route A: expliciet singles.",
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Funky Fish / SingleCamps (Ardennen outdoor)",
    officialUrl:
      "https://www.funkyfish.nl/reis/2663/outdoorweekend-ardennen-25-28-september-2026.html",
    status: "promising",
    sourceType: "organizer",
    regions: ["Wallonië", "Ardennen"],
    formats: ["outdoor", "weekend", "sport"],
    notes:
      "[fase14] channel=organizer langs=NL yield=low effort=medium | NL christelijke singles outdoorweekend Ardennen 25–28/09/2026 (26–40). BE locatie; primary via SingleCamps. Niche.",
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
  {
    name: "Club Compagnon / KRUUL",
    officialUrl: "https://www.kruul.be/eigen-events/singlediner",
    status: "promising",
    sourceType: "venue_with_singles_program",
    regions: ["Leuven", "Vlaams-Brabant"],
    formats: ["dinner"],
    notes:
      "[fase14] channel=venue langs=NL yield=low | Single & Thriving diner 18/09/2026 Leuven (verleden bij sweep). Monitor volgende Club Compagnon edities. Leuven food gap.",
    lastCheckedAt: PHASE14_CHECKED_AT,
  },
];

export type TomeetoDraftSeed = {
  slug: string;
  title: string;
  startDate: string;
  endDate: string;
  minAge: number;
  maxAge: number;
  subCategory: string;
  officialUrl: string;
  city: string;
  region: string;
  activities: Array<"reizen" | "weekend" | "sport" | "outdoor">;
  reviewNotes: string;
};

/** Strong future Tomeeto editions → draft only (human review). */
export const PHASE14_TOMEETO_DRAFTS: TomeetoDraftSeed[] = [
  {
    slug: "tomeeto-heerlijk-herve-40-55-2026-11-20",
    title: "Tomeeto — Heerlijk Herve weekend (40–55)",
    startDate: "2026-11-20",
    endDate: "2026-11-22",
    minAge: 40,
    maxAge: 55,
    subCategory: "singles weekend",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Herve",
    region: "Wallonië",
    activities: ["weekend", "reizen"],
    reviewNotes: "fase14 draft: Tomeeto aanbod hub 20–22/11/2026 40–55.",
  },
  {
    slug: "tomeeto-heerlijk-herve-25-39-2026-11-27",
    title: "Tomeeto — Heerlijk Herve weekend (25–39)",
    startDate: "2026-11-27",
    endDate: "2026-11-29",
    minAge: 25,
    maxAge: 39,
    subCategory: "singles weekend",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Herve",
    region: "Wallonië",
    activities: ["weekend", "reizen"],
    reviewNotes: "fase14 draft: Tomeeto 27–29/11/2026 25–39.",
  },
  {
    slug: "tomeeto-heerlijk-herve-35-49-2026-12-04",
    title: "Tomeeto — Heerlijk Herve weekend (35–49)",
    startDate: "2026-12-04",
    endDate: "2026-12-06",
    minAge: 35,
    maxAge: 49,
    subCategory: "singles weekend",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Herve",
    region: "Wallonië",
    activities: ["weekend", "reizen"],
    reviewNotes: "fase14 draft: Tomeeto 04–06/12/2026 35–49.",
  },
  {
    slug: "tomeeto-vurig-luik-50-65-2026-12-04",
    title: "Tomeeto — Vurig Luik weekend (50–65)",
    startDate: "2026-12-04",
    endDate: "2026-12-06",
    minAge: 50,
    maxAge: 65,
    subCategory: "singles weekend",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Liège",
    region: "Wallonië",
    activities: ["weekend", "reizen"],
    reviewNotes: "fase14 draft: Tomeeto Vurig Luik 04–06/12/2026 50–65.",
  },
  {
    slug: "tomeeto-padelvakantie-30-45-2026-09-23",
    title: "Tomeeto — Padelvakantie (30–45)",
    startDate: "2026-09-23",
    endDate: "2026-09-30",
    minAge: 30,
    maxAge: 45,
    subCategory: "singles travel sport",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen", "sport"],
    reviewNotes:
      "fase14 draft: Tomeeto padelvakantie 23–30/09/2026 30–45; vertrek BE (Mechelen org).",
  },
  {
    slug: "tomeeto-padelvakantie-45-60-2026-09-23",
    title: "Tomeeto — Padelvakantie (45–60)",
    startDate: "2026-09-23",
    endDate: "2026-09-30",
    minAge: 45,
    maxAge: 60,
    subCategory: "singles travel sport",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen", "sport"],
    reviewNotes: "fase14 draft: Tomeeto padelvakantie 23–30/09/2026 45–60.",
  },
  {
    slug: "tomeeto-fiesta-gran-canaria-35-49-2026-12-29",
    title: "Tomeeto — Fiesta Gran Canaria (35–49)",
    startDate: "2026-12-29",
    endDate: "2027-01-05",
    minAge: 35,
    maxAge: 49,
    subCategory: "singles travel",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen"],
    reviewNotes: "fase14 draft: Tomeeto Gran Canaria 29/12/2026–05/01/2027 35–49.",
  },
  {
    slug: "tomeeto-fiesta-gran-canaria-50-65-2026-12-29",
    title: "Tomeeto — Fiesta Gran Canaria (50–65)",
    startDate: "2026-12-29",
    endDate: "2027-01-05",
    minAge: 50,
    maxAge: 65,
    subCategory: "singles travel",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen"],
    reviewNotes: "fase14 draft: Tomeeto Gran Canaria 29/12/2026–05/01/2027 50–65.",
  },
  {
    slug: "tomeeto-shortski-35-49-2027-01-17",
    title: "Tomeeto — Shortski (35–49)",
    startDate: "2027-01-17",
    endDate: "2027-01-20",
    minAge: 35,
    maxAge: 49,
    subCategory: "singles ski",
    officialUrl: "https://tomeeto.be/vakanties/shortski-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen", "sport"],
    reviewNotes: "fase14 draft: Tomeeto Shortski 17–20/01/2027 35–49.",
  },
  {
    slug: "tomeeto-shortski-50-66-2027-01-17",
    title: "Tomeeto — Shortski (50–66)",
    startDate: "2027-01-17",
    endDate: "2027-01-20",
    minAge: 50,
    maxAge: 66,
    subCategory: "singles ski",
    officialUrl: "https://tomeeto.be/vakanties/shortski-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen", "sport"],
    reviewNotes: "fase14 draft: Tomeeto Shortski 17–20/01/2027 50–66.",
  },
  {
    slug: "tomeeto-skiweek-25-39-2027-03-21",
    title: "Tomeeto — Skiweek (25–39)",
    startDate: "2027-03-21",
    endDate: "2027-03-27",
    minAge: 25,
    maxAge: 39,
    subCategory: "singles ski",
    officialUrl: "https://tomeeto.be/vakanties/skiweek-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen", "sport"],
    reviewNotes: "fase14 draft: Tomeeto Skiweek 21–27/03/2027 25–39.",
  },
  {
    slug: "tomeeto-skiweek-40-55-2027-03-21",
    title: "Tomeeto — Skiweek (40–55)",
    startDate: "2027-03-21",
    endDate: "2027-03-27",
    minAge: 40,
    maxAge: 55,
    subCategory: "singles ski",
    officialUrl: "https://tomeeto.be/vakanties/skiweek-voor-singles/",
    city: "Mechelen",
    region: "Vlaanderen",
    activities: ["reizen", "sport"],
    reviewNotes: "fase14 draft: Tomeeto Skiweek 21–27/03/2027 40–55.",
  },
];
