/**
 * Layered extraction pipeline (Phase 1 quality).
 *
 * L1 — Deterministic: JSON-LD / structured enrich (before AI).
 * L2 — Soft-gap follow: ticket/detail pages (capped), re-run L1 per page.
 * L3 — Anthropic only for remaining gaps (caller supplies AI result).
 * L4 — Field evidence merge + conflict notes; never invent values.
 *
 * Respects existing SSRF via safeFetchTipSource. No browser render.
 */

import {
  detectHardEssentialGaps,
  detectSoftEssentialGaps,
} from "@/lib/aanvoer/deep-verify";
import {
  collectProposalFieldEvidence,
  evidenceFromField,
  formatFieldEvidenceLine,
  mergeFieldEvidence,
  type FieldEvidence,
} from "@/lib/aanvoer/field-evidence";
import { extractJsonLdEventFacts } from "@/lib/aanvoer/json-ld-event";
import { harvestIntakeEventLinks } from "@/lib/aanvoer/page-kind";
import { enrichProposalFromPage } from "@/lib/aanvoer/structured-enrich";
import type { IntakeField, IntakeProposal } from "@/lib/aanvoer/types";
import { blankProposal } from "@/lib/aanvoer/types";
import { safeFetchTipSource } from "@/lib/tips/safe-fetch";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";

/** Extra fetches per event for ticket/detail follow (soft gaps). */
export const EXTRACTION_MAX_FOLLOW_FETCHES = 3;

export type ExtractionLayerReport = {
  layer: "l1_structured" | "l2_follow" | "l3_ai" | "l4_verify";
  note: string;
  urlsChecked?: string[];
};

export type ExtractionPipelineResult = {
  proposal: IntakeProposal;
  layers: ExtractionLayerReport[];
  conflicts: string[];
  structuredDump: string | null;
};

function fieldFound(field: IntakeField<string | null> | undefined): boolean {
  return Boolean(
    field && field.status === "found" && field.value?.trim(),
  );
}

function softGapsOpen(proposal: IntakeProposal): string[] {
  return detectSoftEssentialGaps(proposal);
}

function hardGapsOpen(proposal: IntakeProposal): string[] {
  return detectHardEssentialGaps(proposal);
}

/**
 * Serialize JSON-LD (+ key proposal facts) for the AI evidence pack.
 * AI must treat this as DATA only; never invent beyond it.
 */
export function buildStructuredEvidenceDump(input: {
  html?: string | null;
  pageUrl?: string | null;
  proposal?: IntakeProposal | null;
}): string | null {
  const parts: string[] = [];
  if (input.html) {
    const facts = extractJsonLdEventFacts(input.html);
    if (facts) {
      parts.push(
        "JSON-LD Event (deterministisch, vóór AI):",
        JSON.stringify(facts, null, 2),
      );
    }
  }
  if (input.proposal) {
    const snap: Record<string, string | null> = {
      title: input.proposal.title.value,
      startDate: input.proposal.startDate.value,
      startTime: input.proposal.startTime.value,
      endTime: input.proposal.endTime.value,
      city: input.proposal.city.value,
      venue: input.proposal.venue.value,
      priceNotes: input.proposal.priceNotes.value,
      ticketUrl: input.proposal.ticketUrl?.value ?? null,
      organizer: input.proposal.organizer.value,
    };
    const filled = Object.entries(snap).filter(([, v]) => v);
    if (filled.length) {
      parts.push(
        "Al deterministisch gevonden (niet overschrijven zonder betere bron):",
        filled.map(([k, v]) => `- ${k}: ${v}`).join("\n"),
      );
    }
  }
  if (!parts.length) return null;
  if (input.pageUrl) parts.unshift(`Pagina: ${input.pageUrl}`);
  return parts.join("\n");
}

/**
 * L1: apply structured page facts before any AI call.
 */
export function applyStructuredLayer(input: {
  proposal?: IntakeProposal | null;
  html?: string | null;
  pageText?: string | null;
  pageUrl?: string | null;
}): { proposal: IntakeProposal; report: ExtractionLayerReport; dump: string | null } {
  const base = input.proposal ?? blankProposal();
  const proposal = enrichProposalFromPage({
    proposal: base,
    html: input.html,
    pageText: input.pageText,
    pageUrl: input.pageUrl,
  });
  const dump = buildStructuredEvidenceDump({
    html: input.html,
    pageUrl: input.pageUrl,
    proposal,
  });
  const found = (proposal.fieldEvidence ?? []).filter(
    (e) => e.status === "found" && e.method === "json_ld",
  ).length;
  return {
    proposal,
    dump,
    report: {
      layer: "l1_structured",
      note: found
        ? `JSON-LD/heuristiek: ${found} velden gevuld`
        : "Geen JSON-LD Event op pagina (of geen HTML)",
    },
  };
}

function looksLikeTicketUrl(url: string): boolean {
  return /ticket|billetero|eventbrite|hipsy|partyfinder|billetto|inschrijf|register|booking/i.test(
    url,
  );
}

function candidateFollowUrls(input: {
  proposal: IntakeProposal;
  html?: string | null;
  pageUrl?: string | null;
}): string[] {
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const v = validateAndNormalizeTipUrl(raw);
    if (v.ok) out.push(v.normalizedUrl);
  };

  push(input.proposal.ticketUrl?.value);
  const source = input.proposal.sourceUrl.value;
  if (source && looksLikeTicketUrl(source)) push(source);

  if (input.html && input.pageUrl) {
    for (const link of harvestIntakeEventLinks(input.html, input.pageUrl, 12)) {
      if (looksLikeTicketUrl(link)) push(link);
    }
    // Also pick explicit ticket hrefs even off-host (same SSRF gate later).
    for (const m of input.html.matchAll(/href=["'](https?:\/\/[^"'#]+)["']/gi)) {
      const href = m[1]!;
      if (looksLikeTicketUrl(href)) push(href);
    }
  }

  return [...new Set(out)].slice(0, EXTRACTION_MAX_FOLLOW_FETCHES);
}

/**
 * L2: when soft gaps remain, follow a few ticket/detail URLs and re-apply L1.
 * Skips network when no soft gaps or no candidate URLs.
 */
export async function applyTicketFollowLayer(input: {
  proposal: IntakeProposal;
  html?: string | null;
  pageUrl?: string | null;
  /** When false, only collect candidates (offline / tests). */
  fetchEnabled?: boolean;
}): Promise<{
  proposal: IntakeProposal;
  report: ExtractionLayerReport;
  conflicts: string[];
}> {
  const gaps = softGapsOpen(input.proposal);
  if (gaps.length === 0) {
    return {
      proposal: input.proposal,
      conflicts: [],
      report: {
        layer: "l2_follow",
        note: "Geen soft gaps (prijs/tijd/ticket); follow overgeslagen",
        urlsChecked: [],
      },
    };
  }

  const urls = candidateFollowUrls(input);
  if (urls.length === 0 || input.fetchEnabled === false) {
    return {
      proposal: input.proposal,
      conflicts: [],
      report: {
        layer: "l2_follow",
        note:
          urls.length === 0
            ? `Soft gaps (${gaps.join(", ")}); geen ticket/detail-URL gevonden`
            : `Soft gaps (${gaps.join(", ")}); fetch uitgeschakeld`,
        urlsChecked: [],
      },
    };
  }

  let proposal = input.proposal;
  const checked: string[] = [];
  const conflicts: string[] = [];

  for (const url of urls) {
    if (checked.length >= EXTRACTION_MAX_FOLLOW_FETCHES) break;
    const fetched = await safeFetchTipSource(url);
    if (!fetched.ok) {
      checked.push(`${url} (fail:${fetched.error})`);
      continue;
    }
    checked.push(fetched.finalUrl);
    const beforePrice = proposal.priceNotes.value;
    const beforeTime = proposal.startTime.value;
    proposal = enrichProposalFromPage({
      proposal,
      html: fetched.html || null,
      pageText: fetched.text,
      pageUrl: fetched.finalUrl,
    });

    // Mark ticket page method for newly filled soft fields.
    const extras: FieldEvidence[] = [];
    if (
      fieldFound(proposal.priceNotes) &&
      proposal.priceNotes.value !== beforePrice
    ) {
      extras.push(
        evidenceFromField({
          field: "priceNotes",
          status: "found",
          value: proposal.priceNotes.value,
          method: "ticket_page",
          sourceUrl: fetched.finalUrl,
          quote: proposal.priceNotes.evidence,
        }),
      );
    }
    if (
      fieldFound(proposal.startTime) &&
      proposal.startTime.value !== beforeTime
    ) {
      extras.push(
        evidenceFromField({
          field: "startTime",
          status: "found",
          value: proposal.startTime.value,
          method: "ticket_page",
          sourceUrl: fetched.finalUrl,
          quote: proposal.startTime.evidence,
        }),
      );
    }
    if (!fieldFound(proposal.ticketUrl)) {
      proposal = {
        ...proposal,
        ticketUrl: {
          value: fetched.finalUrl,
          status: "found",
          evidence: "Gevolgde ticket/detailpagina",
        },
      };
      extras.push(
        evidenceFromField({
          field: "ticketUrl",
          status: "found",
          value: fetched.finalUrl,
          method: "ticket_page",
          sourceUrl: fetched.finalUrl,
        }),
      );
    }
    if (extras.length) {
      proposal = {
        ...proposal,
        fieldEvidence: mergeFieldEvidence(proposal.fieldEvidence ?? [], extras),
      };
    }

    // Conflict: listing price vs ticket page price.
    if (
      beforePrice &&
      proposal.priceNotes.value &&
      beforePrice !== proposal.priceNotes.value &&
      /€|\d/.test(beforePrice) &&
      /€|\d/.test(proposal.priceNotes.value)
    ) {
      conflicts.push(
        `Prijsconflict: listing “${beforePrice}” vs ticket “${proposal.priceNotes.value}”`,
      );
      proposal = {
        ...proposal,
        priceNotes: {
          ...proposal.priceNotes,
          status: "uncertain",
          evidence: conflicts[conflicts.length - 1]!,
        },
      };
    }

    if (softGapsOpen(proposal).length === 0) break;
  }

  return {
    proposal,
    conflicts,
    report: {
      layer: "l2_follow",
      note: `Soft-gap follow (${gaps.join(", ")}): ${checked.length} URL(s)`,
      urlsChecked: checked,
    },
  };
}

/**
 * Merge AI proposal onto deterministic base without inventing over found values.
 * Records AI field evidence only for fields the AI newly filled.
 */
export function mergeAiGapFill(input: {
  base: IntakeProposal;
  ai: IntakeProposal;
}): { proposal: IntakeProposal; report: ExtractionLayerReport } {
  const base = input.base;
  const ai = input.ai;

  function preferFound(
    a: IntakeField<string | null>,
    b: IntakeField<string | null>,
  ): IntakeField<string | null> {
    if (fieldFound(a)) return a;
    if (fieldFound(b)) return b;
    if (a.status === "uncertain" && a.value) return a;
    if (b.status === "uncertain" && b.value) return b;
    return a.value ? a : b;
  }

  const merged: IntakeProposal = {
    ...ai,
    ...base,
    organizer: preferFound(base.organizer, ai.organizer),
    title: preferFound(base.title, ai.title),
    startDate: preferFound(base.startDate, ai.startDate),
    startTime: preferFound(base.startTime, ai.startTime),
    endTime: preferFound(base.endTime, ai.endTime),
    city: preferFound(base.city, ai.city),
    venue: preferFound(base.venue, ai.venue),
    location: preferFound(base.location, ai.location),
    ageNotes: preferFound(base.ageNotes, ai.ageNotes),
    priceNotes: preferFound(base.priceNotes, ai.priceNotes),
    currency: preferFound(base.currency, ai.currency),
    category: preferFound(base.category, ai.category),
    sourceUrl: preferFound(base.sourceUrl, ai.sourceUrl),
    organizerUrl: preferFound(base.organizerUrl, ai.organizerUrl),
    availability: preferFound(base.availability, ai.availability),
    notes: preferFound(base.notes, ai.notes),
    ticketUrl: preferFound(
      base.ticketUrl ?? { value: null, status: "unknown", evidence: null },
      ai.ticketUrl ?? { value: null, status: "unknown", evidence: null },
    ),
    singlesOnly:
      base.singlesOnly.value !== "unknown"
        ? base.singlesOnly
        : ai.singlesOnly,
    singlesOriented:
      base.singlesOriented.value !== "unknown"
        ? base.singlesOriented
        : ai.singlesOriented,
    visibleUrls: [
      ...new Set([
        ...(base.visibleUrls ?? []),
        ...(ai.visibleUrls ?? []),
      ]),
    ],
    sourceKindHint: ai.sourceKindHint || base.sourceKindHint,
    routeAdvice:
      base.routeAdvice !== "needs_review" ? base.routeAdvice : ai.routeAdvice,
    routeReason: ai.routeReason || base.routeReason,
    needsSourceVerification:
      base.needsSourceVerification || ai.needsSourceVerification,
    modelHint: ai.modelHint ?? base.modelHint,
    aiFailed: ai.aiFailed,
    aiError: ai.aiError,
    pageKind: base.pageKind ?? ai.pageKind,
    discoveredEventUrls: base.discoveredEventUrls ?? ai.discoveredEventUrls,
    deepScan: ai.deepScan ?? base.deepScan,
  };

  const aiEvidence = collectProposalFieldEvidence(ai, "ai", ai.sourceUrl.value);
  const onlyNew = aiEvidence.filter((row) => {
    const prev = (base.fieldEvidence ?? []).find((e) => e.field === row.field);
    if (prev && prev.status === "found") return false;
    return row.status === "found" || row.status === "uncertain";
  });

  const mergedClock = merged.startTime.value?.trim() ?? "";
  const startTimeUnknown = !(
    merged.startTime.status === "found" &&
    Boolean(mergedClock) &&
    /^\d{2}:\d{2}/.test(mergedClock)
  );

  return {
    proposal: {
      ...merged,
      startTimeUnknown,
      fieldEvidence: mergeFieldEvidence(
        mergeFieldEvidence(base.fieldEvidence ?? [], onlyNew),
        collectProposalFieldEvidence(merged, "html", merged.sourceUrl.value).filter(
          (e) => e.status === "unknown",
        ),
      ),
    },
    report: {
      layer: "l3_ai",
      note: ai.aiFailed
        ? `AI mislukt: ${ai.aiError ?? "onbekend"}`
        : `AI gap-fill: ${onlyNew.length} nieuwe/onzekere velden`,
    },
  };
}

/**
 * L4: finalize evidence + attach conflict notes for admin.
 */
export function finalizeExtractionEvidence(input: {
  proposal: IntakeProposal;
  conflicts?: string[];
  layers?: ExtractionLayerReport[];
}): ExtractionPipelineResult {
  const proposal = input.proposal;
  const clock = proposal.startTime.value?.trim() ?? "";
  const startTimeUnknown = !(
    proposal.startTime.status === "found" &&
    Boolean(clock) &&
    /^\d{2}:\d{2}/.test(clock)
  );

  let notes = proposal.notes;
  const conflicts = input.conflicts ?? [];
  if (conflicts.length) {
    notes = {
      value: [notes.value, `extractie_conflicten=${conflicts.join(" | ")}`]
        .filter(Boolean)
        .join("\n"),
      status: "found",
      evidence: notes.evidence,
    };
  }

  const soft = softGapsOpen(proposal);
  const hard = hardGapsOpen(proposal);
  const layers = [
    ...(input.layers ?? []),
    {
      layer: "l4_verify" as const,
      note: [
        hard.length ? `hard gaps: ${hard.join(", ")}` : "hard gaps: geen",
        soft.length ? `soft gaps: ${soft.join(", ")}` : "soft gaps: geen",
        startTimeUnknown ? "startTime=onbekend (geen 12:00 als feit)" : null,
      ]
        .filter(Boolean)
        .join("; "),
    },
  ];

  return {
    proposal: {
      ...proposal,
      notes,
      startTimeUnknown,
      fieldEvidence: proposal.fieldEvidence ?? [],
    },
    layers,
    conflicts,
    structuredDump: null,
  };
}

/** Admin-friendly multi-line summary of field evidence. */
export function formatExtractionEvidenceForAdmin(
  proposal: IntakeProposal,
): string[] {
  return (proposal.fieldEvidence ?? [])
    .filter((e) => e.status !== "found" || e.confidence === "low")
    .slice(0, 24)
    .map(formatFieldEvidenceLine);
}

/**
 * Offline-friendly L1 path used by corpus tests (no network).
 */
export function runDeterministicExtraction(input: {
  html?: string | null;
  pageText?: string | null;
  pageUrl?: string | null;
  proposal?: IntakeProposal | null;
}): ExtractionPipelineResult {
  const l1 = applyStructuredLayer(input);
  const finalized = finalizeExtractionEvidence({
    proposal: l1.proposal,
    layers: [l1.report],
  });
  return {
    ...finalized,
    structuredDump: l1.dump,
  };
}
