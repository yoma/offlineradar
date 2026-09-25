import type { GoldenLabel, ScreeningDecision } from "@/types/screening";

/**
 * PROVISIONAL expected outcomes for the pilot candidates.
 *
 * IMPORTANT: these labels were authored by the same AI as the screener, in the
 * same session. They are therefore test fixtures, NOT an independent accuracy
 * measurement. Labels that assumed the superseded “organic social” definition
 * are marked `outdated`. Independent human relabelling is still required.
 *
 * `expectedDecision` preserves the historical Fase 1 judgement for divergence
 * reporting. New rule outcomes are NOT presented as human approvals.
 *
 * Only `humanConceptDecision` records an independent product-owner concept
 * verdict when explicitly provided.
 */
type ProvisionalLabel = Omit<
  GoldenLabel,
  "provisional" | "needsHumanReview" | "outdated" | "outdatedReason" | "humanConceptDecision"
> & {
  outdated?: boolean;
  outdatedReason?: string;
  humanConceptDecision?: ScreeningDecision | null;
};

const BROAD_SOCIAL =
  "Voorlopig label gebaseerd op te brede ‘organic social’-definitie; herzien onder singles Route A/B.";

const PROVISIONAL_LABELS: ProvisionalLabel[] = [
  {
    candidateId: "embodied-dating-club",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Expliciet begeleide dating-avond met kennismakingsopzet (Route A).",
    labeledBy: "reviewer",
  },
  {
    candidateId: "speeddate-antwerpen-40-50",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Klassieke georganiseerde speeddate (Route A).",
    labeledBy: "reviewer",
  },
  {
    candidateId: "speeddate-hogeropgeleiden-25-35",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Georganiseerde speeddate met vaste rondes (Route A).",
    labeledBy: "reviewer",
  },
  {
    candidateId: "speeddate-antwerpen-53-65",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Georganiseerde speeddate (Route A); beschikbaarheid is een aandachtspunt, geen conceptafwijzing.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "mingle-night-how-to-be-single",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Expliciet singles-mingle-event (Route A).",
    labeledBy: "reviewer",
  },
  {
    candidateId: "social-run-club-confraters",
    expectedDecision: "REVIEW",
    expectedCategory: "meet_new_people",
    note: "Historisch: sociaal opgezet maar confraters. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "loopclub-orion-hoboken",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Historisch: inclusieve loopclub als meet_new_people. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "uantwerpen-running-club",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Historisch: studenten-only. Onder nieuwe regels ook conceptueel geen Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "antwerp-athletics-club",
    expectedDecision: "REVIEW",
    expectedCategory: "social",
    note: "Historisch: sportclub als social. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "nou-social-running-club-heist",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Buiten pilotregio (hard reject blijft). Historisch ook als sociaal geschikt gezien.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "boardnado-antwerp",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Historisch: open bordspellengemeenschap. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "spel-2660-gravenhof",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Historisch: spelavond ‘ontmoeten’. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "antwerp-language-exchange-meetup",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Historisch: taaluitwisseling. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "antwerp-social-language-exchange-eventbrite",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Historisch: social mixer / nieuwe vriendschappen. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "board-game-tavern-meetup",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Historisch: inclusieve bordspellengroep. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "samen-koken-gravenhof",
    expectedDecision: "REVIEW",
    expectedCategory: "social",
    note: "Historisch: groepskookclub als social/medium. Geen singles Route A/B.",
    labeledBy: "reviewer",
    outdated: true,
    outdatedReason: BROAD_SOCIAL,
  },
  {
    candidateId: "concert-sixpence-de-roma",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Passief concert zonder singlesformule.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "concert-the-opposites-de-roma",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Passief concert.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "concert-alela-diane-de-roma",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Passief concert.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "najaarsfoor-antwerpen",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Kermis; publieke attractie zonder singlesformule.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "jaarmarkt-boom",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Markt en buiten de pilotregio.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "terug-naar-toen-plein-publiek",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Gewone clubavond zonder singlesformule.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "coco-loco-halloween-rave",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Gewone rave/fuif zonder singlesformule.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "tropenrooster-wolf",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Gewone dans-/uitgaansavond zonder singlesformule.",
    labeledBy: "reviewer",
    humanConceptDecision: "REJECT",
  },
  {
    candidateId: "fiesta-de-la-memoria-roularta",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Besloten bedrijfsfeest op uitnodiging.",
    labeledBy: "reviewer",
  },
];

/**
 * All labels remain provisional fixtures unless `humanConceptDecision` is set.
 * Outdated labels must be independently re-reviewed under Route A/B.
 */
export const GOLDEN_LABELS: GoldenLabel[] = PROVISIONAL_LABELS.map((label) => ({
  ...label,
  provisional: true,
  needsHumanReview: label.humanConceptDecision == null,
  outdated: label.outdated === true,
  outdatedReason: label.outdatedReason,
  humanConceptDecision: label.humanConceptDecision ?? null,
}));
