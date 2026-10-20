/**
 * Phase 1C — full L1→L4 intake validation (read-only).
 *
 * Safety:
 * - Refuses to run if DATABASE_URL / POSTGRES_URL is set (no accidental prod writes).
 * - Never prints ANTHROPIC_API_KEY.
 * - HTTP GETs only via safeFetchTipSource; no Neon mutations.
 *
 * Usage:
 *   npx tsx scripts/validate-extraction-phase1c.ts
 *
 * Exit codes:
 *   0 = live AI suite completed (or offline-only mode with --offline-gates)
 *   2 = blocked: missing ANTHROPIC_API_KEY
 *   3 = blocked: database URL present (not isolated)
 *   1 = validation failures
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { evaluateIntakeApproval } from "../lib/aanvoer/approval";
import {
  UNKNOWN_START_TIME_NOTE,
  buildIntakeStartsAt,
} from "../lib/aanvoer/dates";
import {
  applyStructuredLayer,
  applyTicketFollowLayer,
  buildStructuredEvidenceDump,
  finalizeExtractionEvidence,
  formatExtractionEvidenceForAdmin,
  mergeAiGapFill,
} from "../lib/aanvoer/extraction-pipeline";
import { runAdminIntakeExtractDetailed } from "../lib/aanvoer/extract";
import { formatCardWhen } from "../lib/format";
import { extractJsonLdEventFacts } from "../lib/aanvoer/json-ld-event";
import { blankProposal, proposalToDraft } from "../lib/aanvoer/types";
import { parseHoptodateHtml } from "../lib/source-refresh/parsers/hoptodate";
import { parseSpeeddatenHtml } from "../lib/source-refresh/parsers/speeddaten";
import { parseSportieveSinglesHtml } from "../lib/source-refresh/parsers/sportieve-singles";
import { safeFetchTipSource } from "../lib/tips/safe-fetch";
import { DEFAULT_ANTHROPIC_MODEL } from "../lib/screening/ai/anthropic-screener";

const ARTIFACT_DIR = "/opt/cursor/artifacts";
const DELAY_MS = 1_200;
const offlineOnly = process.argv.includes("--offline-gates");

/** Approximate Haiku 4.5 list prices (USD / MTok) for cost estimates only. */
const HAIKU_INPUT_PER_MTOK = 1.0;
const HAIKU_OUTPUT_PER_MTOK = 5.0;

type FieldVerdict =
  | "correct"
  | "incorrect"
  | "unknown"
  | "not_independently_verifiable";

type CaseResult = {
  id: string;
  organizer: string;
  url: string;
  hasJsonLd: boolean;
  title: string | null;
  layers: string[];
  httpFetches: number;
  durationMs: number;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsdEstimate: number;
  fields: Array<{
    field: string;
    extracted: string | null;
    status: string;
    method: string | null;
    verdict: FieldVerdict;
    note?: string;
  }>;
  startTimeUnknown: boolean;
  cardWhen: string | null;
  showsNoonAsConfirmed: boolean;
  approvalCanPublish: boolean;
  approvalReview: string[];
  conflicts: string[];
  inventedFields: string[];
  adminEvidenceLines: string[];
  fetchErrors: string[];
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * HAIKU_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTOK
  );
}

function assertIsolatedEnvironment(): void {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    console.error(
      "BLOCKED: DATABASE_URL/POSTGRES_URL is set. Phase 1C requires an unset DB URL (read-only / no Neon writes).",
    );
    process.exit(3);
  }
  console.log("OK  isolation: no DATABASE_URL / POSTGRES_URL (no DB writes possible)");
}

function assertAnthropicAvailable(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.error(
      "BLOCKED: ANTHROPIC_API_KEY missing. Cannot run L3 AI gap-fill. Do not bypass — add the secret to the Cloud Agent environment.",
    );
    process.exit(2);
  }
  // Never print the key — only confirm presence + length class.
  console.log(
    `OK  Anthropic key present (len=${key.length}, prefix=${key.slice(0, 7)}…)`,
  );
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

function runOfflineGates(): void {
  // Missing price → soft gap path still may canPublish (by design); conflict must not.
  const conflictDraft = proposalToDraft(
    blankProposal({
      title: { value: "Conflict Event", status: "found", evidence: "x" },
      startDate: { value: "2026-11-15", status: "found", evidence: "x" },
      startTime: { value: "19:30", status: "found", evidence: "x" },
      city: { value: "Gent", status: "found", evidence: "x" },
      sourceUrl: {
        value: "https://example.com/e",
        status: "found",
        evidence: "x",
      },
      notes: {
        value: "extractie_conflicten=Prijsconflict: €20 vs €25",
        status: "found",
        evidence: "x",
      },
      priceNotes: {
        value: "€20",
        status: "uncertain",
        evidence: "conflict",
      },
      singlesOriented: {
        value: "true",
        status: "found",
        evidence: "x",
      },
      routeAdvice: "route_a",
      routeReason: "ok",
      needsSourceVerification: false,
    }),
  );
  const blocked = evaluateIntakeApproval(conflictDraft, {
    needsSourceVerification: false,
    routeAdvice: "route_a",
    aiFailed: false,
    deepScan: {
      triggered: true,
      reason: "conflict",
      queries: [],
      sourcesChecked: [],
      fieldsConfirmed: [],
      conflicts: ["Bronnen geven verschillende prijzen (€20 vs €25)."],
      timestamp: new Date().toISOString(),
    },
  });
  if (blocked.canPublish) {
    throw new Error("price conflict must block canPublish");
  }
  console.log("OK  price conflict → review (canPublish=false)");

  const noon = buildIntakeStartsAt({
    startDate: "2026-11-15",
    startTime: "",
  });
  if (!noon?.timeUnknown) throw new Error("expected timeUnknown");
  const when = formatCardWhen({
    startDate: "2026-11-15",
    startTime: "12:00",
    startTimeDisplayNote: UNKNOWN_START_TIME_NOTE,
  });
  if (/12:00/.test(when)) throw new Error(`noon leaked: ${when}`);
  console.log("OK  unknown start time →", when);

  // Missing price alone should NOT invent a price via blankProposal
  const missing = blankProposal({
    title: { value: "No Price", status: "found", evidence: "x" },
    startDate: { value: "2026-11-15", status: "found", evidence: "x" },
    city: { value: "Antwerpen", status: "found", evidence: "x" },
  });
  if (missing.priceNotes.value) {
    throw new Error("blank proposal must not invent price");
  }
  console.log("OK  missing price stays unknown (no invention)");

  const clientSrc = readFileSync(
    path.join(process.cwd(), "app/interne-aanvoer/aanvoer-client.tsx"),
    "utf8",
  );
  if (!clientSrc.includes("Extractiebewijs per veld")) {
    throw new Error("admin field evidence UI missing");
  }
  if (!clientSrc.includes("fieldEvidence")) {
    throw new Error("admin fieldEvidence wiring missing");
  }
  console.log("OK  admin UI contains Extractiebewijs per veld");

  const saveSrc = readFileSync(
    path.join(process.cwd(), "lib/aanvoer/save.ts"),
    "utf8",
  );
  if (!saveSrc.includes('publicationStatus: "draft"')) {
    throw new Error("save must stay draft");
  }
  console.log("OK  save path remains draft-only");
}

async function discoverDetailUrls(): Promise<
  Array<{ id: string; organizer: string; url: string }>
> {
  const out: Array<{ id: string; organizer: string; url: string }> = [];

  await sleep(DELAY_MS);
  const sd = await safeFetchTipSource(
    "https://www.speeddaten.be/nl/kalender-8.htm",
  );
  if (sd.ok) {
    for (const c of parseSpeeddatenHtml(sd.html).candidates.slice(0, 2)) {
      if (c.officialUrl) {
        out.push({
          id: `SD-${out.length + 1}`,
          organizer: "Speeddaten",
          url: c.officialUrl,
        });
      }
    }
  } else {
    console.warn("Speeddaten listing fetch failed:", sd.error);
  }

  await sleep(DELAY_MS);
  const htd = await safeFetchTipSource(
    "https://hoptodate.com/fr-be/speed-dating/",
  );
  if (htd.ok) {
    for (const c of parseHoptodateHtml(htd.html).candidates.slice(0, 2)) {
      if (c.ticketUrl) {
        out.push({
          id: `HTD-${out.length + 1}`,
          organizer: "HopToDate",
          url: c.ticketUrl,
        });
      }
    }
  } else {
    console.warn("HopToDate listing fetch failed:", htd.error);
  }

  // Sportieve listing itself is the shared calendar (often no JSON-LD).
  out.push({
    id: "SS-LISTING",
    organizer: "Sportieve Singles",
    url: "https://www.sportievesingles.be/kalender",
  });

  // Ensure uniqueness and cap
  const seen = new Set<string>();
  return out.filter((x) => {
    if (seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  }).slice(0, 6);
}

async function runFullChain(input: {
  id: string;
  organizer: string;
  url: string;
}): Promise<CaseResult> {
  const t0 = Date.now();
  let httpFetches = 0;
  const fetchErrors: string[] = [];
  const layers: string[] = [];

  await sleep(DELAY_MS);
  httpFetches += 1;
  const fetched = await safeFetchTipSource(input.url);
  if (!fetched.ok) {
    fetchErrors.push(fetched.error);
    return {
      id: input.id,
      organizer: input.organizer,
      url: input.url,
      hasJsonLd: false,
      title: null,
      layers: ["fetch_failed"],
      httpFetches,
      durationMs: Date.now() - t0,
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsdEstimate: 0,
      fields: [],
      startTimeUnknown: true,
      cardWhen: null,
      showsNoonAsConfirmed: false,
      approvalCanPublish: false,
      approvalReview: [`fetch failed: ${fetched.error}`],
      conflicts: [],
      inventedFields: [],
      adminEvidenceLines: [],
      fetchErrors,
    };
  }

  const jsonLd = extractJsonLdEventFacts(fetched.html || "");
  const hasJsonLd = Boolean(jsonLd);

  // L1
  const l1 = applyStructuredLayer({
    html: fetched.html,
    pageText: fetched.text,
    pageUrl: fetched.finalUrl,
  });
  layers.push(l1.report.note);

  // L2
  const follow = await applyTicketFollowLayer({
    proposal: l1.proposal,
    html: fetched.html,
    pageUrl: fetched.finalUrl,
    fetchEnabled: true,
  });
  httpFetches += follow.report.urlsChecked?.length ?? 0;
  layers.push(follow.report.note);
  let proposal = follow.proposal;
  const conflicts = [...follow.conflicts];

  // L3 AI
  const dump =
    l1.dump ||
    buildStructuredEvidenceDump({
      html: fetched.html,
      pageUrl: fetched.finalUrl,
      proposal,
    });
  const aiText = [
    dump
      ? `----- DETERMINISTISCHE STRUCTURELE DATA -----\n${dump}\n----- EINDE -----\n`
      : "",
    fetched.text,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await runAdminIntakeExtractDetailed({
    mode: "url",
    url: fetched.finalUrl,
    text: aiText,
  });
  const merged = mergeAiGapFill({ base: proposal, ai: ai.proposal });
  proposal = merged.proposal;
  layers.push(merged.report.note);

  // L4
  const finalized = finalizeExtractionEvidence({
    proposal,
    conflicts,
    layers: [l1.report, follow.report, merged.report],
  });
  proposal = finalized.proposal;
  layers.push(
    finalized.layers[finalized.layers.length - 1]?.note ?? "l4",
  );

  const draft = proposalToDraft(proposal);
  const gate = evaluateIntakeApproval(draft, {
    needsSourceVerification: proposal.needsSourceVerification,
    routeAdvice: draft.routeAdvice,
    aiFailed: proposal.aiFailed,
    deepScan: {
      triggered: false,
      reason: "phase1c",
      queries: [],
      sourcesChecked: [{ url: fetched.finalUrl, ok: true }],
      fieldsConfirmed: [],
      conflicts: finalized.conflicts,
      timestamp: new Date().toISOString(),
    },
  });

  const cardWhen = formatCardWhen({
    startDate: draft.startDate || "2099-01-01",
    startTime: proposal.startTimeUnknown ? null : draft.startTime || null,
    startTimeDisplayNote: proposal.startTimeUnknown
      ? UNKNOWN_START_TIME_NOTE
      : null,
  });

  const plain = fetched.text.toLowerCase();
  const evidenceByField = new Map(
    (proposal.fieldEvidence ?? []).map((e) => [e.field, e]),
  );

  function grade(
    field: string,
    extracted: string | null | undefined,
    status: string,
  ): {
    field: string;
    extracted: string | null;
    status: string;
    method: string | null;
    verdict: FieldVerdict;
    note?: string;
  } {
    const value = extracted?.trim() || null;
    const ev = evidenceByField.get(field);
    if (!value || status === "unknown") {
      return {
        field,
        extracted: null,
        status,
        method: ev?.method ?? null,
        verdict: "unknown",
      };
    }
    // Heuristic gold: value should appear in page text or JSON-LD.
    const inPlain = plain.includes(value.toLowerCase());
    const inJson =
      jsonLd &&
      JSON.stringify(jsonLd).toLowerCase().includes(value.toLowerCase());
    if (inPlain || inJson) {
      return {
        field,
        extracted: value,
        status,
        method: ev?.method ?? null,
        verdict: "correct",
      };
    }
    // AI-only values not found in source → treat as invention risk
    if (ev?.method === "ai" || (!inPlain && !inJson && !hasJsonLd)) {
      return {
        field,
        extracted: value,
        status,
        method: ev?.method ?? null,
        verdict: "not_independently_verifiable",
        note: "value not found verbatim in fetched source text/JSON-LD",
      };
    }
    return {
      field,
      extracted: value,
      status,
      method: ev?.method ?? null,
      verdict: "incorrect",
      note: "extracted value not corroborated by source",
    };
  }

  const fields = [
    grade("date", proposal.startDate.value, proposal.startDate.status),
    grade("startTime", proposal.startTime.value, proposal.startTime.status),
    grade("city", proposal.city.value, proposal.city.status),
    grade("price", proposal.priceNotes.value, proposal.priceNotes.status),
    {
      field: "priceType",
      extracted: proposal.priceNotes.value?.match(/vanaf|from|duo|pp/i)
        ? "qualified"
        : proposal.priceNotes.value
          ? "plain"
          : null,
      status: proposal.priceNotes.status,
      method: evidenceByField.get("priceNotes")?.method ?? null,
      verdict: (proposal.priceNotes.value
        ? "not_independently_verifiable"
        : "unknown") as FieldVerdict,
    },
    grade("age", proposal.ageNotes.value, proposal.ageNotes.status),
    grade(
      "ticketUrl",
      proposal.ticketUrl?.value ?? proposal.sourceUrl.value,
      proposal.ticketUrl?.status ?? proposal.sourceUrl.status,
    ),
  ];

  const inventedFields = fields
    .filter(
      (f) =>
        f.verdict === "incorrect" ||
        (f.method === "ai" &&
          f.extracted &&
          f.verdict === "not_independently_verifiable" &&
          f.status === "found"),
    )
    .map((f) => f.field);

  const tokensIn = ai.usage?.inputTokens ?? 0;
  const tokensOut = ai.usage?.outputTokens ?? 0;

  return {
    id: input.id,
    organizer: input.organizer,
    url: fetched.finalUrl,
    hasJsonLd,
    title: proposal.title.value,
    layers,
    httpFetches,
    durationMs: Date.now() - t0,
    model: ai.model,
    tokensIn,
    tokensOut,
    costUsdEstimate: estimateCostUsd(tokensIn, tokensOut),
    fields,
    startTimeUnknown: Boolean(proposal.startTimeUnknown),
    cardWhen,
    showsNoonAsConfirmed:
      Boolean(proposal.startTimeUnknown) && /12:00/.test(cardWhen),
    approvalCanPublish: gate.canPublish,
    approvalReview: gate.reviewReasons,
    conflicts: finalized.conflicts,
    inventedFields,
    adminEvidenceLines: formatExtractionEvidenceForAdmin(proposal).slice(0, 12),
    fetchErrors,
  };
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  assertIsolatedEnvironment();
  runOfflineGates();

  if (offlineOnly) {
    console.log("\n--offline-gates only; skipping live AI suite.");
    process.exit(0);
  }

  const model = assertAnthropicAvailable();
  console.log(`Model: ${model}`);

  console.log("\n--- Discover detail URLs ---");
  const targets = await discoverDetailUrls();
  if (targets.length < 5) {
    console.warn(
      `Only ${targets.length} detail URLs discovered (want ≥5). Continuing with available set.`,
    );
  }
  for (const t of targets) console.log(`  ${t.id}: ${t.url}`);

  const results: CaseResult[] = [];
  for (const t of targets) {
    console.log(`\nRun L1→L4 ${t.id}…`);
    const row = await runFullChain(t);
    results.push(row);
    console.log(
      `  title=${row.title?.slice(0, 50) ?? "?"} jsonLd=${row.hasJsonLd} tokens=${row.tokensIn}/${row.tokensOut} cost≈$${row.costUsdEstimate.toFixed(4)} noonLeak=${row.showsNoonAsConfirmed} invent=${row.inventedFields.join(",") || "none"}`,
    );
  }

  const incorrect = results.flatMap((r) =>
    r.fields
      .filter((f) => f.verdict === "incorrect")
      .map((f) => `${r.id}.${f.field}`),
  );
  const noonLeaks = results.filter((r) => r.showsNoonAsConfirmed);
  const inventRisk = results.flatMap((r) =>
    r.inventedFields.map((f) => `${r.id}.${f}`),
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "phase1c-read-only-l1l4",
    isolated: true,
    databaseUrlSet: false,
    model,
    caseCount: results.length,
    totalHttpFetches: results.reduce((s, r) => s + r.httpFetches, 0),
    totalTokensIn: results.reduce((s, r) => s + r.tokensIn, 0),
    totalTokensOut: results.reduce((s, r) => s + r.tokensOut, 0),
    totalCostUsdEstimate: results.reduce((s, r) => s + r.costUsdEstimate, 0),
    incorrect,
    noonLeaks: noonLeaks.map((r) => r.id),
    inventRisk,
    results,
  };

  writeFileSync(
    path.join(ARTIFACT_DIR, "phase1c-live-validation.json"),
    JSON.stringify(summary, null, 2),
  );

  const md: string[] = [
    "# Phase 1C live L1→L4 validation",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Isolated (no DB URL): yes`,
    `- Model: ${model}`,
    `- Cases: ${summary.caseCount}`,
    `- HTTP fetches: ${summary.totalHttpFetches}`,
    `- Tokens in/out: ${summary.totalTokensIn} / ${summary.totalTokensOut}`,
    `- Est. cost USD: $${summary.totalCostUsdEstimate.toFixed(4)}`,
    `- Incorrect confirmed fields: ${incorrect.length ? incorrect.join(", ") : "none"}`,
    `- Noon leaks: ${noonLeaks.length ? noonLeaks.map((r) => r.id).join(", ") : "none"}`,
    `- Invention-risk fields: ${inventRisk.length ? inventRisk.join(", ") : "none"}`,
    "",
    "| ID | Org | JSON-LD | Date | Time | City | Price | Ticket | Tokens | Cost$ | Noon |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    const g = (f: string) => r.fields.find((x) => x.field === f)?.verdict ?? "—";
    md.push(
      `| ${r.id} | ${r.organizer} | ${r.hasJsonLd} | ${g("date")} | ${g("startTime")} | ${g("city")} | ${g("price")} | ${g("ticketUrl")} | ${r.tokensIn}/${r.tokensOut} | ${r.costUsdEstimate.toFixed(4)} | ${r.showsNoonAsConfirmed} |`,
    );
  }
  md.push("", "## Per-case detail", "");
  for (const r of results) {
    md.push(`### ${r.id} — ${r.title ?? "(no title)"}`);
    md.push(`- URL: ${r.url}`);
    md.push(`- Layers: ${r.layers.join(" | ")}`);
    md.push(`- cardWhen: ${r.cardWhen}`);
    md.push(`- startTimeUnknown: ${r.startTimeUnknown}`);
    md.push(`- canPublish: ${r.approvalCanPublish}`);
    if (r.approvalReview.length) md.push(`- review: ${r.approvalReview.join("; ")}`);
    if (r.conflicts.length) md.push(`- conflicts: ${r.conflicts.join("; ")}`);
    if (r.adminEvidenceLines.length) {
      md.push("- Admin evidence sample:");
      for (const line of r.adminEvidenceLines) md.push(`  - ${line}`);
    }
    for (const f of r.fields) {
      md.push(
        `  - ${f.field}: ${f.extracted ?? "∅"} [${f.status}/${f.method ?? "?"}] → ${f.verdict}${f.note ? ` (${f.note})` : ""}`,
      );
    }
    md.push("");
  }
  writeFileSync(
    path.join(ARTIFACT_DIR, "phase1c-live-validation.md"),
    md.join("\n"),
  );

  console.log(
    `\nSummary: cases=${results.length} incorrect=${incorrect.length} noon=${noonLeaks.length} inventRisk=${inventRisk.length} tokens=${summary.totalTokensIn}/${summary.totalTokensOut} cost≈$${summary.totalCostUsdEstimate.toFixed(4)}`,
  );

  if (incorrect.length || noonLeaks.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
