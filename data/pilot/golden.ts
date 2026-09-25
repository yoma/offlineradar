import type { GoldenLabel } from "@/types/screening";

/**
 * PROVISIONAL expected outcomes for the pilot candidates.
 *
 * IMPORTANT: these labels were authored by the same AI as the screener, in the
 * same session. They are therefore test fixtures, NOT an independent accuracy
 * measurement. Every candidate still needs independent human review
 * (`needsHumanReview: true`). Do not "fix" the screener by rewriting these to
 * force a perfect score; `scripts/verify-screening.ts` reports divergences
 * instead. A correct new decision matters more than a perfect test score.
 *
 * `expectedDecision` still reflects the original Fase 1 judgement so that Fase
 * 1.6 divergences remain visible until a human relabels them.
 */
type ProvisionalLabel = Omit<GoldenLabel, "provisional" | "needsHumanReview">;

const PROVISIONAL_LABELS: ProvisionalLabel[] = [
  {
    candidateId: "embodied-dating-club",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Expliciet begeleide dating-avond met kennismakingsopzet.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "speeddate-antwerpen-40-50",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Klassieke georganiseerde speeddate.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "speeddate-hogeropgeleiden-25-35",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Georganiseerde speeddate met vaste rondes.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "speeddate-antwerpen-53-65",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Georganiseerde speeddate; beschikbaarheid is een aandachtspunt, geen afwijzing.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "mingle-night-how-to-be-single",
    expectedDecision: "ACCEPT",
    expectedCategory: "dating",
    note: "Expliciet singles-mingle-event; opzet is gericht op ontmoeten.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "social-run-club-confraters",
    expectedDecision: "REVIEW",
    expectedCategory: "meet_new_people",
    note: "Sociaal opgezet maar gericht op confraters; openheid voor externen onbevestigd.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "loopclub-orion-hoboken",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Inclusieve loopclub, iedereen welkom, expliciet nieuwe mensen leren kennen.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "uantwerpen-running-club",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Enkel voor studenten; niet toegankelijk voor het brede publiek.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "antwerp-athletics-club",
    expectedDecision: "REVIEW",
    expectedCategory: "social",
    note: "Sportclub met lidmaatschap; sociale kennismaking naast training onduidelijk.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "nou-social-running-club-heist",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Sterk sociaal, maar buiten de pilotregio (Heist-op-den-Berg).",
    labeledBy: "reviewer",
  },
  {
    candidateId: "boardnado-antwerp",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Open bordspellengemeenschap; aansluiten aan een tafel expliciet aangemoedigd.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "spel-2660-gravenhof",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Spelavond 'ontmoeten', iedereen welkom, zonder inschrijven aansluiten.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "antwerp-language-exchange-meetup",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Taaluitwisseling om nieuwe mensen te ontmoeten; freshness ter bevestiging.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "antwerp-social-language-exchange-eventbrite",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Wekelijkse social mixer expliciet gericht op nieuwe vriendschappen.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "board-game-tavern-meetup",
    expectedDecision: "ACCEPT",
    expectedCategory: "meet_new_people",
    note: "Inclusieve bordspellengroep, expliciet welkom voor nieuwkomers.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "samen-koken-gravenhof",
    expectedDecision: "REVIEW",
    expectedCategory: "social",
    note: "Groepskookclub; instroom van nieuwe individuele deelnemers onduidelijk.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "concert-sixpence-de-roma",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Passief concert zonder kennismakingsmoment.",
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
    note: "Kermis; publieke attractie zonder ontmoetingsformule.",
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
    note: "Gewone clubavond zonder ontmoetingsopzet.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "coco-loco-halloween-rave",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Gewone rave/fuif.",
    labeledBy: "reviewer",
  },
  {
    candidateId: "tropenrooster-wolf",
    expectedDecision: "REJECT",
    expectedCategory: "reject",
    note: "Gewone dansavond zonder ontmoetingsopzet.",
    labeledBy: "reviewer",
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
 * All labels are AI-authored fixtures pending independent human review.
 * Marked provisional + needsHumanReview so no independent accuracy is claimed.
 */
export const GOLDEN_LABELS: GoldenLabel[] = PROVISIONAL_LABELS.map((label) => ({
  ...label,
  provisional: true,
  needsHumanReview: true,
}));
