import { PILOT_CANDIDATES } from "@/data/pilot/candidates";
import {
  AiScreenerError,
  DEFAULT_ANTHROPIC_MODEL,
  buildNeutralInput,
  createAnthropicScreener,
  validateVerdict,
} from "@/lib/screening/ai/anthropic-screener";
import { loadLocalEnv } from "@/lib/screening/ai/load-env";
import { runPipeline } from "@/lib/screening/pipeline";
import { DEFAULT_PILOT_WINDOW } from "@/lib/screening/screen";
import type { AiConceptVerdict, RawCandidate } from "@/types/screening";

/**
 * Local dev comparison: rule-based CONCEPT assessment vs Claude CONCEPT
 * assessment, on the SAME dimension only. Never compares the publication
 * decision against Claude. No publication, no feed changes.
 *
 * FASE 2B: screens the remaining candidates once (the first three were already
 * screened in the previous run and are skipped here to respect the max cap).
 */
loadLocalEnv();

const PILOT_NOW = new Date("2026-09-25T08:00:00+02:00");
const MAX_ADDITIONAL = 22;

/** Screened in the previous run; excluded to avoid repeat calls. */
const ALREADY_SCREENED = new Set([
  "embodied-dating-club",
  "samen-koken-gravenhof",
  "terug-naar-toen-plein-publiek",
]);

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function validatorSelfTest(): boolean {
  let okValid = false;
  try {
    validateVerdict({
      category: "social",
      socialSuitability: "medium",
      reason: "test",
      usedFacts: ["a"],
      uncertainties: [],
      needsManualReview: false,
    });
    okValid = true;
  } catch {
    okValid = false;
  }
  let rejectsInvalid = false;
  try {
    validateVerdict({ category: "banana" });
  } catch {
    rejectsInvalid = true;
  }
  return okValid && rejectsInvalid;
}

async function main() {
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

  const rows = runPipeline(PILOT_CANDIDATES, DEFAULT_PILOT_WINDOW, PILOT_NOW);
  const ruleById = new Map(rows.map((r) => [r.result.candidateId, r.result]));

  const withFacts: RawCandidate[] = [];
  const skipped: string[] = [];
  for (const c of PILOT_CANDIDATES) {
    if (buildNeutralInput(c)) withFacts.push(c);
    else skipped.push(c.id);
  }
  const toRun = withFacts.filter((c) => !ALREADY_SCREENED.has(c.id));

  console.log("# OfflineRadar AI-screening vergelijking (concept-dimensie)\n");
  console.log(`Model: ${model}`);
  console.log(`ANTHROPIC_API_KEY aanwezig: ${hasKey ? "ja" : "nee"}`);
  console.log(`Validator self-test: ${validatorSelfTest() ? "ok" : "FAIL"}`);
  console.log(
    `Kandidaten met neutrale feiten: ${withFacts.length}; reeds beoordeeld: ${ALREADY_SCREENED.size}; nu te beoordelen: ${toRun.length}; overgeslagen (geen feiten): ${skipped.length}`,
  );
  if (skipped.length > 0) console.log(`Overgeslagen ids: ${skipped.join(", ")}`);
  console.log("");

  if (!hasKey) {
    console.log("DRY-RUN: geen ANTHROPIC_API_KEY, dus GEEN echte Claude-aanroepen.");
    process.exit(0);
  }

  if (toRun.length > MAX_ADDITIONAL) {
    console.error(`STOP: ${toRun.length} > max ${MAX_ADDITIONAL} aanvullende aanroepen.`);
    process.exit(1);
  }

  const screener = createAnthropicScreener({ model });

  let agreeCategory = 0;
  let agreeSuitability = 0;
  let diffs = 0;
  let needsReview = 0;
  let totalIn = 0;
  let totalOut = 0;
  let errors = 0;

  console.log("| Kandidaat | Regel-concept | Claude-concept | Cat-diff | Suit-diff | Review | Claude-onderbouwing |");
  console.log("|---|---|---|---|---|---|---|");

  for (const raw of toRun) {
    const rule = ruleById.get(raw.id);
    const facts = buildNeutralInput(raw);
    if (!rule || !facts) {
      console.log(`| ${raw.id} | ? | (geen input) | - | - | ja | onvoldoende neutrale broninformatie |`);
      continue;
    }
    let ai: AiConceptVerdict;
    try {
      const res = await screener.screen(facts);
      ai = res.verdict;
      if (res.usage) {
        totalIn += res.usage.inputTokens;
        totalOut += res.usage.outputTokens;
      }
    } catch (err) {
      errors += 1;
      const kind = err instanceof AiScreenerError ? err.kind : "onbekend";
      console.log(`| ${raw.id} | ${rule.category}/${rule.socialSuitability} | FOUT (${kind}) | - | - | ja | - |`);
      continue;
    }
    const catDiff = rule.category !== ai.category;
    const suitDiff = rule.socialSuitability !== ai.socialSuitability;
    if (!catDiff) agreeCategory += 1;
    if (!suitDiff) agreeSuitability += 1;
    if (catDiff || suitDiff) diffs += 1;
    if (ai.needsManualReview) needsReview += 1;
    console.log(
      `| ${truncate(raw.id, 32)} | ${rule.category}/${rule.socialSuitability} | ${ai.category}/${ai.socialSuitability} | ${catDiff ? "ja" : "-"} | ${suitDiff ? "ja" : "-"} | ${ai.needsManualReview ? "ja" : "-"} | ${truncate(ai.reason, 90)} |`,
    );
    if (ai.uncertainties.length > 0) {
      console.log(`|  ↳ onzekerheden: ${truncate(ai.uncertainties.join("; "), 120)} |`);
    }
  }

  console.log("\n## Samenvatting (enkel deze run)");
  console.log(`- Beoordeeld: ${toRun.length - errors} (fouten: ${errors})`);
  console.log(`- Zelfde categorie: ${agreeCategory}`);
  console.log(`- Zelfde social suitability: ${agreeSuitability}`);
  console.log(`- Met inhoudelijk verschil (cat en/of suit): ${diffs}`);
  console.log(`- Claude vraagt manuele review: ${needsReview}`);
  console.log(`- API-tokens: input ${totalIn}, output ${totalOut}, totaal ${totalIn + totalOut}`);
}

main().catch((err) => {
  const kind = err instanceof AiScreenerError ? err.kind : "onbekend";
  console.error(`Fout tijdens AI-vergelijking: ${kind}`);
  process.exit(1);
});
