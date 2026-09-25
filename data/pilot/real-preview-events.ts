import { GEO } from "@/data/places";
import { distanceKmBetween } from "@/lib/distance";
import type { Event } from "@/types/event";
import { band } from "@/types/event";
import { slugId } from "@/types/domain";

/**
 * Hand-curated real singles events for the LOCAL internal preview only.
 * Source: Fase 4B verification on 2026-09-25. Unknown facts stay unknown.
 * Images under /preview-mood/ are generated atmosphere images (not official
 * edition photos); UI marks them as “Sfeerbeeld”.
 */

const CHECKED_AT = "2026-09-25T11:47:00.000Z";
const ANTWERP = GEO.antwerpen;

function dist(lat: number, lng: number): number {
  return distanceKmBetween(ANTWERP, { lat, lng });
}

function mood(
  file: string,
  alt: string,
): Pick<Event, "imageUrl" | "imageAlt" | "imageIsAtmosphere"> {
  return {
    imageUrl: `/preview-mood/${file}`,
    imageAlt: alt,
    imageIsAtmosphere: true,
  };
}

function base(
  partial: Omit<
    Event,
    | "currency"
    | "instagramUrl"
    | "addedAt"
    | "organizerId"
    | "venueId"
    | "meetActivation"
    | "singlesFriendly"
    | "listingPath"
    | "socialSuitability"
    | "distanceKm"
    | "preferredAudienceAgeMin"
    | "preferredAudienceAgeMax"
    | "audienceAgeFromSource"
    | "knownAudienceGenders"
    | "spotsRemaining"
    | "registrationDeadline"
    | "endDate"
    | "region"
  > &
    Partial<
      Pick<
        Event,
        | "preferredAudienceAgeMin"
        | "preferredAudienceAgeMax"
        | "audienceAgeFromSource"
        | "knownAudienceGenders"
        | "spotsRemaining"
        | "registrationDeadline"
        | "endDate"
        | "singlesFriendly"
        | "region"
      >
    >,
): Event {
  const {
    region: regionOverride,
    singlesFriendly: singlesFriendlyOverride,
    preferredAudienceAgeMin,
    preferredAudienceAgeMax,
    audienceAgeFromSource,
    knownAudienceGenders,
    spotsRemaining,
    registrationDeadline,
    endDate,
    ...rest
  } = partial;

  return {
    ...rest,
    currency: "EUR",
    region: regionOverride ?? "Antwerpen",
    instagramUrl: null,
    addedAt: CHECKED_AT,
    organizerId: slugId("org", partial.organizerName),
    venueId: partial.venue ? slugId("venue", partial.venue) : null,
    meetActivation: null,
    singlesFriendly: singlesFriendlyOverride === true,
    listingPath: "organic",
    socialSuitability: "high",
    singlesOriented: true,
    distanceKm: dist(partial.latitude, partial.longitude),
    preferredAudienceAgeMin: preferredAudienceAgeMin ?? null,
    preferredAudienceAgeMax: preferredAudienceAgeMax ?? null,
    audienceAgeFromSource: audienceAgeFromSource === true,
    knownAudienceGenders: knownAudienceGenders ?? null,
    spotsRemaining: spotsRemaining ?? null,
    registrationDeadline: registrationDeadline ?? null,
    endDate: endDate ?? null,
  };
}

/** Eight Fase 4B candidates, chronological. */
export function buildRealPreviewEvents(): Event[] {
  return [
    base({
      id: "preview-apero-solo-mechelen-2026-10-02",
      title: "Apero Solo Mechelen",
      slug: "apero-solo-mechelen-2026-10-02",
      shortDescription:
        "Stadswandeling met gids gevolgd door aperitief en hapjes voor single/alleenstaande 50-plussers.",
      description:
        "S-Plus vzw nodigt single 50-plussers / alleenstaanden uit voor een ludieke stadswandeling en daarna aperitief met hapjes. Gericht op sociale verbinding tussen alleenstaanden; romantisch daten is geen vereiste van de organisator. De bron formuleert dit als doelgroep (‘single 50-plusser’), niet als bewezen harde uitsluiting van andere leeftijden.",
      category: "dating",
      subCategory: "singles bijeenkomst",
      organizerName: "S-Plus vzw",
      city: "Mechelen",
      venue: "VC De Schakel",
      latitude: GEO.mechelen.lat,
      longitude: GEO.mechelen.lng,
      startDate: "2026-10-02",
      startTime: "17:30",
      endTime: "21:00",
      price: 15,
      eligibility: {
        default: band(50, null, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
      eligibilityAgeMin: 50,
      eligibilityAgeMax: null,
      eligibilityAgeRule: "guideline",
      preferredAudienceAgeMin: 50,
      preferredAudienceAgeMax: null,
      audienceAgeFromSource: true,
      singlesOnly: false,
      genderAvailability: null,
      capacityStatus: "unknown",
      availabilityNote: null,
      sourceType: "official_website",
      sourceName: "S-Plus vzw",
      officialUrl: "https://www.s-plusvzw.be/apero-solo",
      ticketUrl: null,
      lastCheckedAt: CHECKED_AT,
      tags: ["singles", "50+", "wandeling", "apero"],
      activities: ["wandelen", "drinken"],
      practicalInfo: [
        "Inschrijven via 03 285 43 36 of antwerpen@s-plusvzw.be.",
        "Prijs €15: wandeling met stadsgids, aperitief en hapjes inbegrepen.",
        "Leeftijd 50+: richtleeftijd / doelgroepformulering, geen bewezen harde uitsluiting op de bronpagina.",
        "Doelgroep alleenstaanden/singles; formele Singles only-deurcontrole niet bewezen.",
      ],
      internalPreviewWarnings: [
        "Ticketbeschikbaarheid onbekend (telefonische/mail-inschrijving).",
        "Geen aparte editie-URL; editie staat op de S-Plus-programmapagina.",
        "Singles only niet hard bewezen: bron nodigt single 50-plussers / alleenstaanden uit, maar geen bewezen uitsluiting van niet-singles. Badge: Singlesgericht.",
        "50+ blijft guideline: bronformuleert doelgroep, geen bewezen harde leeftijdsuitsluiting.",
      ],
      ...mood(
        "mood-apero-solo.png",
        "Sfeerbeeld: volwassenen die tijdens een wandeling of aperitief met elkaar praten",
      ),
    }),

    base({
      id: "preview-embodied-dating-antwerp-2026-10-07",
      title: "Embodied Dating Club | Antwerp",
      slug: "embodied-dating-club-antwerp-2026-10-07",
      shortDescription:
        "Begeleide datingavond exclusief voor singles, met presence- en flirtoefeningen.",
      description:
        "Embodied Dating Club omschrijft dit als een avond voor singles only: kennismaken via presence, play en embodied oefeningen. Kleding blijft aan; deelname aan oefeningen is optioneel.",
      category: "dating",
      subCategory: "embodied dating",
      organizerName: "Embodied Dating Club",
      city: "Antwerpen",
      venue: "Quellinstraat 37",
      latitude: 51.2115,
      longitude: 4.4105,
      startDate: "2026-10-07",
      startTime: "19:00",
      endTime: "22:00",
      price: 55.8,
      priceIsFrom: true,
      eligibility: {
        default: band(30, 60, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
      eligibilityAgeMin: 30,
      eligibilityAgeMax: 60,
      eligibilityAgeRule: "guideline",
      preferredAudienceAgeMin: 30,
      preferredAudienceAgeMax: 60,
      audienceAgeFromSource: true,
      singlesOnly: true,
      genderAvailability: null,
      capacityStatus: "unknown",
      availabilityNote: null,
      sourceType: "ticket_platform",
      sourceName: "Hipsy",
      officialUrl: "https://hipsy.eu/event/241718-embodied-dating-club-antwerp",
      ticketUrl: "https://hipsy.eu/event/241718-embodied-dating-club-antwerp",
      lastCheckedAt: CHECKED_AT,
      tags: ["singles only", "dating", "embodied"],
      activities: ["workshop"],
      practicalInfo: [
        "Inloop 15 minuten voor aanvang.",
        "Zichtbare ticketprijzen: Early Flirt Women €55,80; Regular Bird Men €62,80 (v.a. €55,80).",
        "Exacte restplaatsen niet bevestigd.",
      ],
      internalPreviewWarnings: [
        "Restcapaciteit per ticketcategorie onbekend; alleen prijzen zichtbaar.",
      ],
      ...mood(
        "mood-embodied-dating.png",
        "Sfeerbeeld: rustige setting voor begeleide kennismaking tussen volwassenen",
      ),
    }),

    base({
      id: "preview-speeddate-antwerpen-53-65-2026-10-12",
      title: "Speeddating Antwerpen, 53–65 jaar",
      slug: "speeddate-antwerpen-53-65-2026-10-12",
      shortDescription:
        "Klassieke speeddate met moderator en online match achteraf, voor singles van 53–65 jaar.",
      description:
        "SmartVibes organiseert een speeddatingavond: korte gesprekken, moderator ter plaatse, napraten aan de bar, matches via de website nadien.",
      category: "dating",
      subCategory: "speeddating",
      organizerName: "SmartVibes",
      city: "Antwerpen",
      venue: "Fidèle",
      latitude: 51.2172,
      longitude: 4.4208,
      startDate: "2026-10-12",
      startTime: "19:30",
      endTime: null,
      price: 26,
      eligibility: {
        default: band(53, 65, "strict"),
        byGender: null,
        allowedGenders: ["man", "woman"],
      },
      eligibilityAgeMin: 53,
      eligibilityAgeMax: 65,
      eligibilityAgeRule: "strict",
      preferredAudienceAgeMin: 53,
      preferredAudienceAgeMax: 65,
      audienceAgeFromSource: true,
      knownAudienceGenders: ["man", "woman"],
      singlesOnly: true,
      genderAvailability:
        "Vrouwen: volzet. Mannen: bijna volzet / laatste plaatsen (bron 2026-09-25).",
      capacityStatus: "unknown",
      availabilityNote: "Vrouwen volzet · mannen beperkt",
      sourceType: "official_website",
      sourceName: "Speeddating in Antwerpen (SmartVibes)",
      officialUrl:
        "https://www.speeddatinginantwerpen.be/nl/12-10-antwerpen-53-65j-12495.htm",
      ticketUrl:
        "https://www.speeddatinginantwerpen.be/nl/12-10-antwerpen-53-65j-12495.htm",
      lastCheckedAt: CHECKED_AT,
      tags: ["speeddating", "singles", "53-65"],
      activities: ["drinken"],
      practicalInfo: [
        "Locatie: Fidèle, Wapenstraat 18, 2000 Antwerpen.",
        "Prijs op primaire bron: €26.",
        "Einduur niet vermeld op de bron.",
        "Niet het hele event is volzet: vrouwencategorie was volzet bij controle.",
      ],
      internalPreviewWarnings: [
        "Einduur onbekend.",
        "Beschikbaarheid per gender; geen algemeen ‘volzet’.",
      ],
      ...mood(
        "mood-speeddate-53-65.png",
        "Sfeerbeeld: twee volwassenen die tijdens een speeddate met elkaar kennismaken",
      ),
    }),

    base({
      id: "preview-singles-night-out-antwerp-2026-10-14",
      title: "Singles Night Out",
      slug: "singles-night-out-antwerp-2026-10-14",
      shortDescription:
        "Maandelijkse drinksavond voor singles in The Irish Times Pub.",
      description:
        "Expats in Antwerp organiseert een ontspannen avond waarop singles elkaar kunnen ontmoeten. Geen speeddating en geen georganiseerde matching.",
      category: "dating",
      subCategory: "singles drinks",
      organizerName: "Expats in Antwerp",
      city: "Antwerpen",
      venue: "The Irish Times Pub",
      latitude: 51.2213,
      longitude: 4.3997,
      startDate: "2026-10-14",
      startTime: "20:00",
      endTime: "22:00",
      price: null,
      eligibility: {
        default: null,
        byGender: null,
        allowedGenders: null,
      },
      eligibilityAgeMin: null,
      eligibilityAgeMax: null,
      eligibilityAgeRule: "unknown",
      singlesOnly: false,
      genderAvailability: null,
      capacityStatus: "unknown",
      availabilityNote: null,
      sourceType: "community_page",
      sourceName: "Meetup – Expats in Antwerp",
      officialUrl:
        "https://www.meetup.com/expats-in-antwerp/events/wmzwztyjcnbsb/",
      ticketUrl:
        "https://www.meetup.com/expats-in-antwerp/events/wmzwztyjcnbsb/",
      lastCheckedAt: CHECKED_AT,
      tags: ["singles", "meetup", "drinks"],
      activities: ["drinken"],
      practicalInfo: [
        "Prijs/consumpties onbekend.",
        "RSVP-aantal bij controle onbekend.",
        "Gericht op singles; formele Singles only-voorwaarde niet bewezen (social circle mag volgens broncontrole).",
      ],
      internalPreviewWarnings: [
        "Vóór publieke publicatie opnieuw actualiteit/RSVP controleren.",
        "Host niet gegarandeerd; pagina zoekt soms nog hosts.",
        "Singles only niet hard bewezen: singlesgericht, geen bewezen uitsluiting van niet-singles. Badge: Singlesgericht.",
      ],
      ...mood(
        "mood-singles-night-out.png",
        "Sfeerbeeld: volwassenen die ontspannen praten bij een drankje in een café",
      ),
    }),

    base({
      id: "preview-mingle-night-how-to-be-single-2026-10-17",
      title: "Mingle Night by How to be Single",
      slug: "mingle-night-how-to-be-single-2026-10-17",
      shortDescription:
        "Groot singlesfeest in Antwerp Expo; aparte tickets voor wing(wo)men.",
      description:
        "How to be Single / Charlotte Wilmssen organiseert een singlesfeest met mingle, entertainment en dans. Mingle Tickets zijn voor singles; Wing(wo)man Tickets voor niet-single vrienden. Gadgets maken zichtbaar wie single is.",
      category: "dating",
      subCategory: "singles party",
      organizerName: "How to be Single / House of Entertainment",
      city: "Antwerpen",
      venue: "Antwerp Expo",
      latitude: 51.231,
      longitude: 4.416,
      startDate: "2026-10-17",
      startTime: null,
      endTime: null,
      startTimeDisplayNote: "startuur nog te bevestigen",
      price: 36.95,
      priceIsFrom: true,
      eligibility: {
        default: null,
        byGender: null,
        allowedGenders: null,
      },
      eligibilityAgeMin: null,
      eligibilityAgeMax: null,
      eligibilityAgeRule: "unknown",
      singlesOnly: false,
      genderAvailability: null,
      capacityStatus: "unknown",
      availabilityNote: null,
      sourceType: "official_website",
      sourceName: "minglenight.be + House of Entertainment",
      officialUrl: "https://minglenight.be/",
      ticketUrl:
        "https://www.houseofentertainment.be/events/mingle-night-by-how-to-be-single",
      lastCheckedAt: CHECKED_AT,
      tags: ["singles", "party", "needs_review"],
      activities: ["party", "dans", "drinken"],
      practicalInfo: [
        "Datum en locatie bevestigd: zaterdag 17 oktober 2026, Antwerp Expo.",
        "Ticketprijs ‘v.a. €36,95’ op ticketplatform; actuele wave onbekend.",
        "Wing(wo)men welkom: niet claimen dat alle aanwezigen single zijn.",
      ],
      internalPreviewWarnings: [
        "needs_review: exacte starttijd nog niet vastgelegd voor de preview.",
        "Ook wing(wo)men welkom: geen Singles only-badge voor het hele event.",
      ],
      internalSourceConflicts: [
        "minglenight.be: aanvang 19:00, programma tot 03:00.",
        "houseofentertainment.be: vermeldt 20:00.",
      ],
      ...mood(
        "mood-mingle-night.png",
        "Sfeerbeeld: levendige feestsetting waar volwassenen elkaar ontmoeten",
      ),
    }),

    base({
      id: "preview-speeddate-antwerpen-25-35-2026-10-21",
      title: "Speeddate Antwerpen Hogeropgeleiden, 25–35 jaar",
      slug: "speeddate-antwerpen-hogeropgeleiden-25-35-2026-10-21",
      shortDescription:
        "Speeddate voor hogeropgeleide singles van 25–35 jaar, met moderator en online match.",
      description:
        "SmartVibes speeddatingavond voor de leeftijdsgroep 25–35 (hogeropgeleiden volgens de organisator).",
      category: "dating",
      subCategory: "speeddating",
      organizerName: "SmartVibes",
      city: "Antwerpen",
      venue: "Fidèle",
      latitude: 51.2172,
      longitude: 4.4208,
      startDate: "2026-10-21",
      startTime: "19:30",
      endTime: null,
      price: 25,
      eligibility: {
        default: band(25, 35, "strict"),
        byGender: null,
        allowedGenders: ["man", "woman"],
      },
      eligibilityAgeMin: 25,
      eligibilityAgeMax: 35,
      eligibilityAgeRule: "strict",
      preferredAudienceAgeMin: 25,
      preferredAudienceAgeMax: 35,
      audienceAgeFromSource: true,
      knownAudienceGenders: ["man", "woman"],
      singlesOnly: true,
      genderAvailability:
        "Mannen: volzet. Vrouwen: bijna volzet / laatste plaatsen (bron 2026-09-25).",
      capacityStatus: "unknown",
      availabilityNote: "Mannen volzet · vrouwen beperkt",
      sourceType: "official_website",
      sourceName: "Speeddating in Antwerpen (SmartVibes)",
      officialUrl:
        "https://www.speeddatinginantwerpen.be/nl/21-10-antwerpen-hogeropgeleiden-25-35j-12548.htm",
      ticketUrl:
        "https://www.speeddatinginantwerpen.be/nl/21-10-antwerpen-hogeropgeleiden-25-35j-12548.htm",
      lastCheckedAt: CHECKED_AT,
      tags: ["speeddating", "singles", "25-35"],
      activities: ["drinken"],
      practicalInfo: [
        "Locatie: Fidèle, Wapenstraat 18, 2000 Antwerpen.",
        "Prijs op primaire bron: €25.",
        "Einduur niet vermeld.",
      ],
      internalPreviewWarnings: [
        "Einduur onbekend.",
        "Beschikbaarheid per gender; geen algemeen ‘volzet’.",
      ],
      ...mood(
        "mood-speeddate-25-35.png",
        "Sfeerbeeld: twee jongvolwassenen die tijdens een speeddate kennismaken",
      ),
    }),

    base({
      id: "preview-love-on-the-rooftop-antwerp-2026-10-21",
      title: "Love On The Rooftop Antwerpen",
      slug: "love-on-the-rooftop-antwerp-2026-10-21",
      shortDescription:
        "Singles borrel op SKYBAR met polsen, team en match-app; voor singles van 21–45 jaar.",
      description:
        "The Love Doctor × SKYBAR: singles night met mingle, gekleurde polsen (inclusief wingman/wingwoman), live DJ en match-app. Drank en eten niet inbegrepen.",
      category: "dating",
      subCategory: "singles borrel",
      organizerName: "The Love Doctor",
      city: "Antwerpen",
      venue: "SKYBAR",
      latitude: 51.2255,
      longitude: 4.4045,
      startDate: "2026-10-21",
      startTime: "19:00",
      endTime: "22:00",
      price: 29.99,
      eligibility: {
        default: band(21, 45, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
      eligibilityAgeMin: 21,
      eligibilityAgeMax: 45,
      eligibilityAgeRule: "guideline",
      preferredAudienceAgeMin: 21,
      preferredAudienceAgeMax: 45,
      audienceAgeFromSource: true,
      singlesOnly: false,
      genderAvailability: null,
      capacityStatus: "unknown",
      availabilityNote: null,
      sourceType: "ticket_platform",
      sourceName: "Eventgoose (The Love Doctor Events)",
      officialUrl:
        "https://thelovedoctorevents.eventgoose.com/events/8nvPJONZ5LpOYGR0/info",
      ticketUrl:
        "https://thelovedoctorevents.eventgoose.com/events/8nvPJONZ5LpOYGR0/info",
      lastCheckedAt: CHECKED_AT,
      tags: ["singles", "rooftop", "borrel"],
      activities: ["drinken", "party"],
      practicalInfo: [
        "Locatie: Sint-Pietersvliet 7, 2000 Antwerpen (SKYBAR).",
        "Prijs €29,99 (1 ticket) / €54,99 (2 tickets); excl. servicefee.",
        "Blauwe polsband = wingman/wingwoman.",
      ],
      internalPreviewWarnings: [
        "Ticketrestcapaciteit onbekend.",
        "Wing-tickets: geen Singles only-badge voor het hele event.",
      ],
      ...mood(
        "mood-love-rooftop.png",
        "Sfeerbeeld: volwassenen die op een rooftopbar met een drankje praten",
      ),
    }),

    base({
      id: "preview-singles-bowling-antwerp-2026-10-24",
      title: "Singles Bowling in Antwerpen",
      slug: "singles-bowling-antwerpen-2026-10-24",
      shortDescription:
        "Bowlingavond exclusief voor vrijgezellen, met hosts en indeling per leeftijdsgroep.",
      description:
        "Will You Date Me organiseert Singles Bowling exclusief voor vrijgezellen: ontvangst door hosts, 2 uur bowlen, napraten in de bar. Inschrijving per leeftijdscategorie; LGBTQ-banen 25–40 en 40+.",
      category: "dating",
      subCategory: "singles bowling",
      organizerName: "Will You Date Me",
      city: "Antwerpen",
      venue: "Antwerp Amusement Center",
      latitude: 51.221,
      longitude: 4.379,
      startDate: "2026-10-24",
      startTime: "19:30",
      endTime: "22:00",
      price: 29,
      eligibility: {
        default: band(25, null, "guideline"),
        byGender: null,
        allowedGenders: null,
      },
      eligibilityAgeMin: 25,
      eligibilityAgeMax: null,
      eligibilityAgeRule: "guideline",
      singlesOnly: true,
      genderAvailability:
        "Groep 25–35 mannen: VOLZET. Overige leeftijdsgroepen en LGBTQ-banen: nog plaatsen (bron 2026-09-25).",
      capacityStatus: "unknown",
      availabilityNote: "25–35 mannen volzet · andere groepen open",
      sourceType: "official_website",
      sourceName: "Will You Date Me",
      officialUrl:
        "https://willyoudateme.be/singles-bowling-in-antwerpen-24-oktober-2026/",
      ticketUrl:
        "https://willyoudateme.be/singles-bowling-in-antwerpen-24-oktober-2026/",
      lastCheckedAt: CHECKED_AT,
      tags: ["singles", "bowling"],
      activities: ["sport", "drinken"],
      practicalInfo: [
        "Locatie: Blancefloerlaan 181/B, Antwerpen.",
        "Prijs €29: organisatie, hosts, welkomstdrankje, 2 uur bowling.",
      ],
      internalPreviewWarnings: [
        "Alleen categorie 25–35 mannen volzet; geen algemeen ‘volzet’.",
      ],
      ...mood(
        "mood-singles-bowling.png",
        "Sfeerbeeld: volwassenen die samen bowlen in een bowlingzaal",
      ),
    }),
  ];
}
