import type { CapturedClaudeResult } from "@/types/screening";

/**
 * Claude concept-verdicts captured from the Fase 2 (3 candidates) and Fase 2B
 * (22 candidates) runs, model claude-sonnet-5.
 *
 * IMPORTANT: these were read from console output and were NOT persisted from the
 * API. Category + socialSuitability are reliable for all 25. Reasons and
 * uncertainties are console-TRUNCATED (they end with "…"). For the three
 * speeddates the individual rows scrolled off screen: only category/suitability
 * are known (derived from the run summary: they were not among the divergences),
 * so they are marked `category_only`. No new paid calls were made.
 */
export const CLAUDE_RESULTS: CapturedClaudeResult[] = [
  {
    candidateId: "embodied-dating-club",
    category: "dating",
    socialSuitability: "high",
    needsManualReview: false,
    reason:
      "Het format is expliciet een singles-evenement ('a club for singles only') waarbij deelnem…",
    uncertainties: [
      "Genderbalans wordt niet vooraf gedeeld door organisator, wat de daadwerkelijke interactiemogelijkheden kan be…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "speeddate-antwerpen-40-50",
    category: "dating",
    socialSuitability: "high",
    needsManualReview: null,
    reason: null,
    uncertainties: null,
    capture: "category_only",
  },
  {
    candidateId: "speeddate-hogeropgeleiden-25-35",
    category: "dating",
    socialSuitability: "high",
    needsManualReview: null,
    reason: null,
    uncertainties: null,
    capture: "category_only",
  },
  {
    candidateId: "speeddate-antwerpen-53-65",
    category: "dating",
    socialSuitability: "high",
    needsManualReview: null,
    reason: null,
    uncertainties: null,
    capture: "category_only",
  },
  {
    candidateId: "mingle-night-how-to-be-single",
    category: "dating",
    socialSuitability: "high",
    needsManualReview: false,
    reason:
      "Het event is expliciet opgezet rond singles en daten: er zijn specifieke mingle- en wing(…",
    uncertainties: [
      "Grootschaligheid (Antwerp Expo) kan de daadwerkelijke ontmoetingskans per individu verminderen; Niet-singles zijn ook w…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "social-run-club-confraters",
    category: "social",
    socialSuitability: "medium",
    needsManualReview: true,
    reason:
      "Het format van een loopclub met wisselend startpunt en napraten biedt inherent gelegenhei…",
    uncertainties: [
      "Onduidelijk of externen (niet-juristen) effectief mogen aansluiten; Officiële deelnamevoorwaarden niet vermeld; Onbeken…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "loopclub-orion-hoboken",
    category: "social",
    socialSuitability: "medium",
    needsManualReview: true,
    reason:
      "Een terugkerende loopclub met begeleide sessies waarbij nieuwe deelnemers gratis proefles…",
    uncertainties: [
      "Geen bevestigde toekomstige datum voor een loopmoment; Onduidelijk of de reeks van 12 sessies nog doorloopt of herstart…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "uantwerpen-running-club",
    category: "social",
    socialSuitability: "medium",
    needsManualReview: false,
    reason:
      "Een wekelijkse begeleide loopsessie met een coach, waarbij deelnemers met verschillende s…",
    uncertainties: [
      "Enkel toegankelijk voor studenten, wat de doelgroep beperkt (eligibility wordt elders bepaald); Geen concrete datum ver…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "antwerp-athletics-club",
    category: "social",
    socialSuitability: "medium",
    needsManualReview: true,
    reason:
      "Recreatieve groepstrainingen bij een atletiekclub waarbij zowel beginnende als ervaren lo…",
    uncertainties: [
      "Onduidelijk of er expliciete sociale/kennismakingsmomenten zijn naast de training zelf; Lidmaatschapsvereiste kan dremp…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "nou-social-running-club-heist",
    category: "social",
    socialSuitability: "high",
    needsManualReview: false,
    reason:
      "Een social running club met vaste wekelijkse momenten waarbij iedereen gratis kan aanslui…",
    uncertainties: [
      "Geen concrete datum vermeld, enkel algemeen wekelijks patroon; Deelnamevoorwaarden niet officieel vermeld; Bronfeiten n…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "boardnado-antwerp",
    category: "meet_new_people",
    socialSuitability: "high",
    needsManualReview: false,
    reason:
      "De bronfeiten beschrijven een wekelijkse bordspellenavond waarbij nieuwkomers expliciet w…",
    uncertainties: [
      "Geen concrete datum vermeld voor een specifieke editie, maar dit betreft datum/planning en niet het format zelf; Geen o…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "spel-2660-gravenhof",
    category: "social",
    socialSuitability: "high",
    needsManualReview: false,
    reason:
      "Een maandelijkse spelavond waar men zonder inschrijving kan aansluiten aan tafels met bor…",
    uncertainties: [],
    capture: "truncated",
  },
  {
    candidateId: "antwerp-language-exchange-meetup",
    category: "meet_new_people",
    socialSuitability: "high",
    needsManualReview: true,
    reason:
      "Language exchange bijeenkomsten zijn qua format inherent gericht op het ontmoeten van nie…",
    uncertainties: [
      "Geen concrete aankomende datum bevestigd; laatst zichtbare events dateren van 2025; Onduidelijk of de groep nog actief …",
    ],
    capture: "truncated",
  },
  {
    candidateId: "antwerp-social-language-exchange-eventbrite",
    category: "meet_new_people",
    socialSuitability: "high",
    needsManualReview: true,
    reason:
      "Het format is een wekelijkse social/language exchange mixer expliciet gericht op het ontm…",
    uncertainties: [
      "Bron was bij controle niet betrouwbaar op te halen (429), gegevens niet opnieuw live geverifieerd; Geen concreet aankom…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "board-game-tavern-meetup",
    category: "meet_new_people",
    socialSuitability: "high",
    needsManualReview: true,
    reason:
      "Het format is een wekelijkse bordspellenavond in een hostel, expliciet gericht op nieuwko…",
    uncertainties: [
      "Geen concrete eerstvolgende datum vermeld; Events-pagina toonde bij controle geen aangekondigd volgend event, wat kan w…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "samen-koken-gravenhof",
    category: "social",
    socialSuitability: "high",
    needsManualReview: false,
    reason:
      "Individuele reservatie is mogelijk en het format vereist actieve samenwerking (samen koke…",
    uncertainties: [
      "Mogelijk bestaat er een vaste kern van terugkerende deelnemers, wat de drempel voor nieuwkomers kan verhogen;…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "concert-sixpence-de-roma",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: false,
    reason:
      "Dit is een concert: bezoekers kopen een ticket voor een podiumoptreden en zitten/staan gr…",
    uncertainties: [
      "Onbekend of er voor/na het concert een informele foyer- of barsetting is die uitnodigt tot gesprek, maar dit is niet ve…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "concert-the-opposites-de-roma",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: false,
    reason:
      "Dit is een regulier concert (hiphopoptreden) waarbij bezoekers passief naar een podiumact…",
    uncertainties: [
      "Geen informatie over eventuele nevenactiviteiten (bv. borrel, meet & greet) die interactie zouden kunnen bevorderen",
    ],
    capture: "truncated",
  },
  {
    candidateId: "concert-alela-diane-de-roma",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: false,
    reason:
      "Dit is een regulier concert: bezoekers zitten/staan passief naar een podiumoptreden te ki…",
    uncertainties: [
      "Geen informatie over eventuele nevenactiviteiten (bijv. borrel, meet&greet) die interactie zouden kunnen bevorderen",
    ],
    capture: "truncated",
  },
  {
    candidateId: "najaarsfoor-antwerpen",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: false,
    reason:
      "Een kermis/foor is een passieve publieksactiviteit: bezoekers wandelen vrij rond tussen a…",
    uncertainties: [
      "Geen informatie over eventuele nevenactiviteiten die interactie zouden kunnen stimuleren",
    ],
    capture: "truncated",
  },
  {
    candidateId: "jaarmarkt-boom",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: false,
    reason:
      "Een jaarmarkt is een publieke marktactiviteit met kramen waarbij bezoekers voornamelijk i…",
    uncertainties: [
      "Geen informatie over eventuele nevenactiviteiten (bv. workshops, activiteiten) die interactie zouden kunnen stimuleren",
    ],
    capture: "truncated",
  },
  {
    candidateId: "coco-loco-halloween-rave",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: false,
    reason:
      "Dit is een grootschalige rave/technofeest met algemene ticketverkoop (regular/VIP). Het f…",
    uncertainties: [
      "Geen informatie over eventuele randactiviteiten, meet-ups of sociale opzet naast de muziek; Officiële deelnamevoorwaard…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "tropenrooster-wolf",
    category: "social",
    socialSuitability: "medium",
    needsManualReview: false,
    reason:
      "Het gaat om een avond met eten/cocktails gevolgd door een dansvloer met dj-muziek in een …",
    uncertainties: [
      "Geen expliciete vermelding van interactie- of kennismakingselementen; Onduidelijk of er gedeelde tafels of andere struc…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "fiesta-de-la-memoria-roularta",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: true,
    reason:
      "Dit is een besloten relatie-/bedrijfsevenement van Roularta, uitsluitend toegankelijk op …",
    uncertainties: [
      "Niet duidelijk of ook externen/nieuwe relaties zonder bestaande band met Roularta kunnen deelnemen; Bron niet opnieuw l…",
    ],
    capture: "truncated",
  },
  {
    candidateId: "terug-naar-toen-plein-publiek",
    category: "reject",
    socialSuitability: "low",
    needsManualReview: false,
    reason:
      "Dit is een reguliere clubavond/feest met dj's die 90's/00's hits draaien, met algemene ti…",
    uncertainties: [
      "Geen informatie over eventuele interactieve elementen zoals workshops, spelletjes of georganiseerde kennismak…",
    ],
    capture: "truncated",
  },
];
