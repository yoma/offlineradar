import { mkdirSync, writeFileSync } from "node:fs";
import { PILOT_CANDIDATES } from "@/data/pilot/candidates";
import { CLAUDE_RESULTS } from "@/data/pilot/claude-results";
import { buildNeutralInput } from "@/lib/screening/ai/anthropic-screener";
import { runPipeline } from "@/lib/screening/pipeline";
import { DEFAULT_PILOT_WINDOW } from "@/lib/screening/screen";
import type { CapturedClaudeResult } from "@/types/screening";

/**
 * FASE 3 review builder (no API calls, no secrets).
 *
 * Assembles a human-review overview from the deterministic pipeline (rule
 * concept, occurrence, eligibility, publication) + the neutral source facts +
 * the captured Claude results. Writes empty humanConceptLabel / humanReviewNotes
 * for a reviewer to fill in later. Does NOT fill human labels itself.
 */
const PILOT_NOW = new Date("2026-09-25T08:00:00+02:00");

/** The six content differences, shown first. */
const PRIORITY = [
  "tropenrooster-wolf",
  "samen-koken-gravenhof",
  "social-run-club-confraters",
  "loopclub-orion-hoboken",
  "nou-social-running-club-heist",
  "spel-2660-gravenhof",
];

/** Factual evidence extracted from the neutral source facts (no new claims). */
const EVIDENCE: Record<string, { interaction: string; newcomer: string }> = {
  "embodied-dating-club": { interaction: "begeleide relationele oefeningen (ademhaling, beweging, oogcontact)", newcomer: "losse tickets (m/v), inloop 15 min vooraf" },
  "speeddate-antwerpen-40-50": { interaction: "korte 1-op-1 gesprekken met meerdere singles + afterdrink", newcomer: "individuele inschrijving" },
  "speeddate-hogeropgeleiden-25-35": { interaction: "vaste rondes van ~7 min, minstens 7 m / 7 v", newcomer: "individuele inschrijving" },
  "speeddate-antwerpen-53-65": { interaction: "vaste rondes met host-begeleiding", newcomer: "individuele inschrijving (vrouwenlijst vol bij controle)" },
  "mingle-night-how-to-be-single": { interaction: "mingle-opzet; op event zichtbaar wie single is", newcomer: "algemene ticketverkoop; ook niet-singles welkom" },
  "social-run-club-confraters": { interaction: "samen lopen + napraten", newcomer: "leden/niet-ledenticket; doelgroep 'confraters' (juristen)" },
  "loopclub-orion-hoboken": { interaction: "begeleide groepsloop", newcomer: "2 gratis proeflessen; aangehaalde sessie 'voorbij'" },
  "uantwerpen-running-club": { interaction: "begeleide groepsloop met coach", newcomer: "toegang enkel voor studenten" },
  "antwerp-athletics-club": { interaction: "groepstraining per niveau", newcomer: "clublidmaatschap; beginners welkom" },
  "nou-social-running-club-heist": { interaction: "samen lopen op praattempo + koffie achteraf", newcomer: "gratis meelopen (Heist-op-den-Berg)" },
  "boardnado-antwerp": { interaction: "samen bordspellen aan gedeelde tafels", newcomer: "expliciet: schuif aan aan een tafel; drop-in" },
  "spel-2660-gravenhof": { interaction: "spellen aan 3-4 tafels", newcomer: "zonder inschrijven aansluiten; gratis" },
  "antwerp-language-exchange-meetup": { interaction: "gesprekken tussen native/non-native sprekers", newcomer: "gratis, alle niveaus (geen aangekondigd event)" },
  "antwerp-social-language-exchange-eventbrite": { interaction: "social/language mixer", newcomer: "RSVP via website (bron 429; geen bevestigd event)" },
  "board-game-tavern-meetup": { interaction: "toegankelijke bordspellen samen", newcomer: "nieuwkomers expliciet welkom, RSVP (geen aangekondigd event)" },
  "samen-koken-gravenhof": { interaction: "samen een menu bereiden + samen aan tafel eten", newcomer: "individueel reserveren" },
  "concert-sixpence-de-roma": { interaction: "podiumoptreden (passief)", newcomer: "algemene ticketverkoop" },
  "concert-the-opposites-de-roma": { interaction: "podiumoptreden (passief)", newcomer: "algemene ticketverkoop" },
  "concert-alela-diane-de-roma": { interaction: "podiumoptreden (passief)", newcomer: "algemene ticketverkoop" },
  "najaarsfoor-antwerpen": { interaction: "vrij rondwandelen tussen attracties", newcomer: "vrij toegankelijk" },
  "jaarmarkt-boom": { interaction: "marktkramen bekijken", newcomer: "vrij toegankelijk (Boom)" },
  "coco-loco-halloween-rave": { interaction: "dansen op techno", newcomer: "algemene ticketverkoop" },
  "tropenrooster-wolf": { interaction: "eten/cocktails + dansvloer met dj's", newcomer: "algemeen publiek" },
  "fiesta-de-la-memoria-roularta": { interaction: "dansfeest + open bar", newcomer: "op uitnodiging (besloten)" },
  "terug-naar-toen-plein-publiek": { interaction: "dansen op 90s/00s hits", newcomer: "algemene ticketverkoop" },
};

type ReviewRow = {
  candidateId: string;
  title: string;
  sourceUrl: string;
  neutralFacts: string;
  interactionEvidence: string;
  newcomerEvidence: string;
  ruleConcept: string;
  claudeConcept: string;
  claudeReason: string | null;
  claudeUncertainties: string[] | null;
  claudeCapture: CapturedClaudeResult["capture"];
  ruleUncertainties: string[];
  occurrenceB: string;
  eligibilityC: string;
  publicationD: string;
  humanConceptLabel: string;
  humanReviewNotes: string;
};

function main() {
  const rows = runPipeline(PILOT_CANDIDATES, DEFAULT_PILOT_WINDOW, PILOT_NOW);
  const ruleById = new Map(rows.map((r) => [r.result.candidateId, r]));
  const claudeById = new Map(CLAUDE_RESULTS.map((c) => [c.candidateId, c]));

  const ordered = [
    ...PRIORITY,
    ...PILOT_CANDIDATES.map((c) => c.id).filter((id) => !PRIORITY.includes(id)),
  ];

  const review: ReviewRow[] = [];
  const missing: string[] = [];

  for (const id of ordered) {
    const raw = PILOT_CANDIDATES.find((c) => c.id === id);
    const row = ruleById.get(id);
    const claude = claudeById.get(id);
    if (!raw || !row) continue;
    const facts = buildNeutralInput(raw);
    const r = row.result;
    const ev = EVIDENCE[id] ?? { interaction: "zie neutrale bronfeiten", newcomer: "zie neutrale bronfeiten" };

    if (!claude) missing.push(`${id}: geen Claude-resultaat`);
    else if (claude.capture === "category_only") missing.push(`${id}: Claude-onderbouwing niet bewaard (enkel categorie/suitability)`);
    else if (claude.capture === "truncated") missing.push(`${id}: Claude-onderbouwing afgekapt in console-capture`);

    review.push({
      candidateId: id,
      title: raw.statedTitle,
      sourceUrl: raw.provenance.sourceUrl,
      neutralFacts: facts?.sourceFacts ?? "ONVOLDOENDE neutrale bronfeiten",
      interactionEvidence: ev.interaction,
      newcomerEvidence: ev.newcomer,
      ruleConcept: `${r.category}/${r.socialSuitability}`,
      claudeConcept: claude ? `${claude.category}/${claude.socialSuitability}` : "ONBEKEND",
      claudeReason: claude?.reason ?? null,
      claudeUncertainties: claude?.uncertainties ?? null,
      claudeCapture: claude?.capture ?? "category_only",
      ruleUncertainties: r.uncertainties,
      occurrenceB: `${r.occurrence.status}; bevestigd=${r.occurrence.confirmed}; binnen venster=${r.occurrence.withinPilotWindow}`,
      eligibilityC: `leeftijd=${r.eligibility.ageMin ?? "?"}-${r.eligibility.ageMax ?? "?"} (${r.eligibility.ageRule}); doelgroep=${r.eligibility.restrictedAudience ?? "geen"}`,
      publicationD: `${r.decision} (${r.statusReason}); publicatieklaar=${r.publicationReady}`,
      humanConceptLabel: "",
      humanReviewNotes: "",
    });
  }

  mkdirSync("review", { recursive: true });
  writeFileSync("review/pilot-review.json", JSON.stringify(review, null, 2));

  const md: string[] = [];
  md.push("# OfflineRadar - menselijk reviewoverzicht (Fase 3)\n");
  md.push("humanConceptLabel en humanReviewNotes zijn bewust leeg; in te vullen door de reviewer.\n");
  md.push("De zes inhoudelijke verschillen staan bovenaan.\n");
  for (const [i, row] of review.entries()) {
    md.push(`\n## ${i + 1}. ${row.title} (${row.candidateId})`);
    md.push(`- Bron-URL: ${row.sourceUrl}`);
    md.push(`- Neutrale bronfeiten: ${row.neutralFacts}`);
    md.push(`- Interactie-bewijs (uit bron): ${row.interactionEvidence}`);
    md.push(`- Nieuwkomer-bewijs (uit bron): ${row.newcomerEvidence}`);
    md.push(`- A. Regel-conceptbeoordeling: ${row.ruleConcept}`);
    md.push(`- A. Claude-conceptbeoordeling: ${row.claudeConcept} (capture: ${row.claudeCapture})`);
    md.push(`- Claude-onderbouwing: ${row.claudeReason ?? "NIET BEWAARD"}`);
    md.push(`- Claude-onzekerheden: ${row.claudeUncertainties ? row.claudeUncertainties.join(" | ") : "NIET BEWAARD"}`);
    md.push(`- Regel-onzekerheden: ${row.ruleUncertainties.length ? row.ruleUncertainties.join(" | ") : "geen"}`);
    md.push(`- B. Concreet toekomstig moment: ${row.occurrenceB}`);
    md.push(`- C. Deelnamevoorwaarden: ${row.eligibilityC}`);
    md.push(`- D. Publicatie (los van A): ${row.publicationD}`);
    md.push("- humanConceptLabel: ");
    md.push("- humanReviewNotes: ");
  }
  writeFileSync("review/pilot-review.md", md.join("\n"));

  console.log(`Reviewoverzicht geschreven: review/pilot-review.json en review/pilot-review.md (${review.length} kandidaten).`);
  console.log(`\nOntbrekende/onvolledige Claude-gegevens (${missing.length}):`);
  for (const m of missing) console.log(`- ${m}`);
}

main();
