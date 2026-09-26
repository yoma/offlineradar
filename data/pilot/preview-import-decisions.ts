/**
 * Phase 2 live re-check decisions for the 8 preview editions.
 * Controledatum: 2026-09-26 (Europe/Brussels).
 * Geen inventie: twijfel → under_review; nooit published.
 */

import type { EventPublicationStatus, EligibilityRoute } from "@/types/event-catalog";
import type { EligibilityAgeRule } from "@/types/event";
import { band } from "@/types/event";

export type PreviewImportDecision = {
  previewId: string;
  slug: string;
  organizerSlug: string;
  organizerName: string;
  organizerWebsite: string | null;
  seriesSlug: string | null;
  seriesName: string | null;
  publicationStatus: Exclude<EventPublicationStatus, "published">;
  eligibilityRoute: EligibilityRoute;
  singlesOriented: boolean | null;
  singlesOnly: boolean | null;
  singlesOnlyEvidence: string | null;
  minAge: number | null;
  maxAge: number | null;
  ageRule: EligibilityAgeRule;
  priceAmount: number | null;
  priceIsFrom: boolean;
  priceNote: string | null;
  availabilityStatus: "available" | "limited" | "almost_full" | "waitlist" | "sold_out" | "unknown" | null;
  availabilityNote: string | null;
  genderAvailability: string | null;
  startTime: string | null;
  endTime: string | null;
  startTimeDisplayNote: string | null;
  primarySourceUrl: string;
  extraSources: Array<{
    sourceType: "official_event" | "ticket" | "organizer" | "social" | "other";
    url: string;
    sourceName: string | null;
    isPrimary: boolean;
  }>;
  changesVsPreview: string[];
  conflicts: string[];
  reviewNotes: string[];
  sourceOk: "ok" | "partial" | "blocked";
};

/** Live re-check outcome keyed by preview event id. */
export const PREVIEW_IMPORT_DECISIONS: PreviewImportDecision[] = [
  {
    previewId: "preview-apero-solo-mechelen-2026-10-02",
    slug: "apero-solo-mechelen-2026-10-02",
    organizerSlug: "s-plus-vzw",
    organizerName: "S-Plus vzw",
    organizerWebsite: "https://www.s-plusvzw.be",
    seriesSlug: "apero-solo",
    seriesName: "Apero Solo",
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: false,
    singlesOnlyEvidence:
      "Bron nodigt ‘single 50-plusser’ / alleenstaanden uit; geen bewezen uitsluiting van niet-singles.",
    minAge: 50,
    maxAge: null,
    ageRule: "guideline",
    priceAmount: 15,
    priceIsFrom: false,
    priceNote: null,
    availabilityStatus: "unknown",
    availabilityNote: "Inschrijving via telefoon/mail; restcapaciteit onbekend.",
    genderAvailability: null,
    startTime: "17:30",
    endTime: "21:00",
    startTimeDisplayNote: null,
    primarySourceUrl: "https://www.s-plusvzw.be/apero-solo",
    extraSources: [],
    changesVsPreview: [],
    conflicts: [],
    reviewNotes: [
      "Bron 2026-09-26: vrijdag 2 oktober 2026, 17.30–21u, VC De Schakel Mechelen, €15 bevestigd.",
      "50+ blijft guideline (doelgroepformulering).",
    ],
    sourceOk: "ok",
  },
  {
    previewId: "preview-embodied-dating-antwerp-2026-10-07",
    slug: "embodied-dating-club-antwerp-2026-10-07",
    organizerSlug: "embodied-dating-club",
    organizerName: "Embodied Dating Club",
    organizerWebsite: "https://hipsy.eu",
    seriesSlug: null,
    seriesName: null,
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: true,
    singlesOnlyEvidence:
      "Hipsy: “A club for singles only that creates spaces for singles to meet in real life.”",
    minAge: 30,
    maxAge: 60,
    ageRule: "guideline",
    priceAmount: 62.8,
    priceIsFrom: true,
    priceNote: "Regular Bird Women/Men €62,80 (bron 2026-09-26); Early Flirt niet meer zichtbaar.",
    availabilityStatus: "waitlist",
    availabilityNote: "Regular Bird Men: waitlist (bron 2026-09-26).",
    genderAvailability: "Mannen: waitlist · vrouwen: Regular Bird zichtbaar",
    startTime: "19:00",
    endTime: "22:00",
    startTimeDisplayNote: null,
    primarySourceUrl: "https://hipsy.eu/event/241718-embodied-dating-club-antwerp",
    extraSources: [],
    changesVsPreview: [
      "Prijs was v.a. €55,80 → nu Regular Bird €62,80 (v.a.).",
      "Capaciteit: mannen waitlist i.p.v. unknown.",
    ],
    conflicts: [],
    reviewNotes: [
      "Age 30 to 60 years op organizerblok = guideline.",
      "Woensdag 7 oktober 2026 19:00–22:00 Quellinstraat 37 bevestigd.",
    ],
    sourceOk: "ok",
  },
  {
    previewId: "preview-speeddate-antwerpen-53-65-2026-10-12",
    slug: "speeddate-antwerpen-53-65-2026-10-12",
    organizerSlug: "smartvibes",
    organizerName: "SmartVibes",
    organizerWebsite: "https://www.speeddatinginantwerpen.be",
    seriesSlug: "speeddate-antwerpen",
    seriesName: "Speeddate Antwerpen",
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: true,
    singlesOnlyEvidence:
      "Speeddating-editie met expliciete leeftijdsgroep singles; deelname via speeddate-inschrijving.",
    minAge: 53,
    maxAge: 65,
    ageRule: "strict",
    priceAmount: 26,
    priceIsFrom: false,
    priceNote: null,
    availabilityStatus: "almost_full",
    availabilityNote: "Vrouwen: volzet · mannen: bijna volzet",
    genderAvailability: "Vrouwen volzet · mannen bijna volzet (2026-09-26)",
    startTime: "19:30",
    endTime: null,
    startTimeDisplayNote: null,
    primarySourceUrl:
      "https://www.speeddatinginantwerpen.be/nl/12-10-antwerpen-53-65j-12495.htm",
    extraSources: [],
    changesVsPreview: ["Beschikbaarheid opnieuw bevestigd (vrouwen nog volzet)."],
    conflicts: [],
    reviewNotes: [
      "Leeftijd mannen/vrouwen: vanaf 53j tot 65j (strict).",
      "Fidèle, Wapenstraat 18, 12/10/2026 19:30, €26.",
    ],
    sourceOk: "ok",
  },
  {
    previewId: "preview-singles-night-out-antwerp-2026-10-14",
    slug: "singles-night-out-antwerp-2026-10-14",
    organizerSlug: "expats-in-antwerp",
    organizerName: "Expats in Antwerp",
    organizerWebsite: "https://www.meetup.com/expats-in-antwerp",
    seriesSlug: "singles-night-out",
    seriesName: "Singles Night Out",
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: false,
    singlesOnlyEvidence:
      "Meetup verwelkomt ook wie social circle wil uitbreiden; geen harde singles-only voorwaarde.",
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    priceAmount: null,
    priceIsFrom: false,
    priceNote: "Prijs/consumpties onbekend.",
    availabilityStatus: "unknown",
    availabilityNote: "RSVP niet betrouwbaar afleesbaar; host niet gegarandeerd.",
    genderAvailability: null,
    startTime: "20:00",
    endTime: "22:00",
    startTimeDisplayNote: null,
    primarySourceUrl:
      "https://www.meetup.com/expats-in-antwerp/events/wmzwztyjcnbsb/",
    extraSources: [],
    changesVsPreview: [
      "Meetup via directe fetch bereikbaar (safe-fetch redirect-limiet faalde eerder).",
    ],
    conflicts: [],
    reviewNotes: [
      "Wed Oct 14 2026 20:00–22:00 CEST, Irish Times Pub bevestigd.",
      "Geen speeddating; singlesgericht maar niet singles-only.",
    ],
    sourceOk: "ok",
  },
  {
    previewId: "preview-mingle-night-how-to-be-single-2026-10-17",
    slug: "mingle-night-how-to-be-single-2026-10-17",
    organizerSlug: "how-to-be-single",
    organizerName: "How to be Single / House of Entertainment",
    organizerWebsite: "https://www.houseofentertainment.be",
    seriesSlug: null,
    seriesName: null,
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: false,
    singlesOnlyEvidence:
      "Wing(wo)man-tickets expliciet; niet alle aanwezigen zijn single.",
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    priceAmount: 36.95,
    priceIsFrom: true,
    priceNote: "Tickets v.a. €36,95 (House of Entertainment).",
    availabilityStatus: "unknown",
    availabilityNote: null,
    genderAvailability: null,
    startTime: "19:00",
    endTime: null,
    startTimeDisplayNote:
      "Deuren en aanvang 19:00 volgens officiële ticket-FAQ. Marketinglisting House of Entertainment toont 20:00.",
    primarySourceUrl: "https://minglenight.tickets.houseofentertainment.be/",
    extraSources: [
      {
        sourceType: "ticket",
        url: "https://www.houseofentertainment.be/events/mingle-night-by-how-to-be-single",
        sourceName: "House of Entertainment (listing 20:00)",
        isPrimary: false,
      },
      {
        sourceType: "ticket",
        url: "https://www.ikwileenticket.be/landing/mingle-night-by-how-to-be-single",
        sourceName: "IkWilEenTicket",
        isPrimary: false,
      },
    ],
    changesVsPreview: [
      "Fase 4: ticket-FAQ bevestigt deuren én aanvang om 19u; conflict opgelost t.v.v. ticketbron.",
      "starts_at = 19:00; HoE-listing 20:00 als secundaire marketingnotitie.",
    ],
    conflicts: [],
    reviewNotes: [
      "Ticket FAQ 2026-09-26: “Aanvang om 19u00” + “We openen de deuren om 19u”.",
      "IkWilEenTicket/programma: chill vanaf 19u, party vanaf 21u.",
      "HoE-eventpagina blijft 20:00 tonen zonder doors/start-onderscheid; ticketbron prevaleert.",
    ],
    sourceOk: "ok",
  },
  {
    previewId: "preview-speeddate-antwerpen-25-35-2026-10-21",
    slug: "speeddate-antwerpen-hogeropgeleiden-25-35-2026-10-21",
    organizerSlug: "smartvibes",
    organizerName: "SmartVibes",
    organizerWebsite: "https://www.speeddatinginantwerpen.be",
    seriesSlug: "speeddate-antwerpen",
    seriesName: "Speeddate Antwerpen",
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: true,
    singlesOnlyEvidence: "Speeddating-editie met expliciete singles-leeftijdsgroep.",
    minAge: 25,
    maxAge: 35,
    ageRule: "strict",
    priceAmount: 25,
    priceIsFrom: false,
    priceNote: null,
    availabilityStatus: "almost_full",
    availabilityNote: "Mannen: volzet · vrouwen: bijna volzet",
    genderAvailability: "Mannen volzet · vrouwen bijna volzet (2026-09-26)",
    startTime: "19:30",
    endTime: null,
    startTimeDisplayNote: null,
    primarySourceUrl:
      "https://www.speeddatinginantwerpen.be/nl/21-10-antwerpen-hogeropgeleiden-25-35j-12548.htm",
    extraSources: [],
    changesVsPreview: [],
    conflicts: [],
    reviewNotes: [
      "Leeftijd 25–35 strict bevestigd; Fidèle 21/10/2026 19:30; €25.",
    ],
    sourceOk: "ok",
  },
  {
    previewId: "preview-love-on-the-rooftop-antwerp-2026-10-21",
    slug: "love-on-the-rooftop-antwerp-2026-10-21",
    organizerSlug: "the-love-doctor",
    organizerName: "The Love Doctor",
    organizerWebsite: "https://thelovedoctorevents.eventgoose.com",
    seriesSlug: null,
    seriesName: null,
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: false,
    singlesOnlyEvidence:
      "Eventgoose: 2-ticket optie “bring your friend, wingman/woman”.",
    minAge: 21,
    maxAge: 45,
    ageRule: "guideline",
    priceAmount: 29.99,
    priceIsFrom: false,
    priceNote: "€29,99 / 2 tickets €54,99 (+ servicefee).",
    availabilityStatus: "unknown",
    availabilityNote: "Restcapaciteit niet expliciet.",
    genderAvailability: null,
    startTime: "19:00",
    endTime: "22:00",
    startTimeDisplayNote: null,
    primarySourceUrl:
      "https://thelovedoctorevents.eventgoose.com/events/8nvPJONZ5LpOYGR0/info",
    extraSources: [],
    changesVsPreview: [],
    conflicts: [],
    reviewNotes: [
      "21 Oct 2026 SKYBAR 19:00–22:00; singles 21–45 guideline; wing tickets → niet singlesOnly.",
    ],
    sourceOk: "ok",
  },
  {
    previewId: "preview-singles-bowling-antwerp-2026-10-24",
    slug: "singles-bowling-antwerpen-2026-10-24",
    organizerSlug: "will-you-date-me",
    organizerName: "Will You Date Me",
    organizerWebsite: "https://willyoudateme.be",
    seriesSlug: "singles-bowling",
    seriesName: "Singles Bowling",
    publicationStatus: "approved",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: true,
    singlesOnlyEvidence:
      "Bron: “exclusief voor vrijgezellen” / “Alle vrijgezellen (volgens leeftijdscategorie)”.",
    minAge: 25,
    maxAge: null,
    ageRule: "guideline",
    priceAmount: 29,
    priceIsFrom: false,
    priceNote: null,
    availabilityStatus: "limited",
    availabilityNote:
      "Meerdere leeftijdsgroepen open; sommige mannen-categorieën beperkt/volzet (2026-09-26).",
    genderAvailability:
      "Diverse leeftijdsgroepen: mix van VOLZET / beperkte plaatsen (hercontrole 2026-09-26).",
    startTime: "19:30",
    endTime: "22:00",
    startTimeDisplayNote: null,
    primarySourceUrl:
      "https://willyoudateme.be/singles-bowling-in-antwerpen-24-oktober-2026/",
    extraSources: [],
    changesVsPreview: [
      "Beschikbaarheidstekst ververst (meer categorieën met concrete restplaatsen).",
    ],
    conflicts: [],
    reviewNotes: [
      "24 okt 2026 19h30 AAC Blancefloerlaan; €29; exclusief vrijgezellen.",
      "25+ als ondergrens van categorielijst = guideline, geen globale harde max.",
    ],
    sourceOk: "ok",
  },
];

export function eligibilityJsonFor(decision: PreviewImportDecision) {
  if (decision.minAge == null && decision.maxAge == null) {
    return {
      default: null,
      byGender: null,
      allowedGenders: null,
    };
  }
  return {
    default: band(decision.minAge, decision.maxAge, decision.ageRule),
    byGender: null,
    allowedGenders: null,
  };
}
