/**
 * Fill intake proposal gaps from deterministic page facts (JSON-LD, city map).
 * Never overwrites a field that AI already marked as found with a value.
 */

import type { StructuredEventFacts } from "@/lib/aanvoer/json-ld-event";
import { extractJsonLdEventFacts } from "@/lib/aanvoer/json-ld-event";
import { isIsoYmd } from "@/lib/aanvoer/dates";
import {
  collectProposalFieldEvidence,
  evidenceFromField,
  mergeFieldEvidence,
  type FieldEvidence,
} from "@/lib/aanvoer/field-evidence";
import type { IntakeField, IntakeProposal } from "@/lib/aanvoer/types";
import { inferKnownCityLabel } from "@/lib/geo-cities";

function fillEmpty<T>(
  field: IntakeField<T | null>,
  value: T | null | undefined,
  evidence: string,
): IntakeField<T | null> {
  if (value == null || value === "") return field;
  if (field.status === "found" && field.value != null && field.value !== "") {
    return field;
  }
  return {
    value,
    status: "found",
    evidence,
  };
}

/** Prefer JSON-LD ISO dates over AI free-text like "31 Oktober 2026". */
function preferIsoDate(
  field: IntakeField<string | null>,
  isoDate: string | null | undefined,
  evidence: string,
): IntakeField<string | null> {
  if (!isoDate || !isIsoYmd(isoDate)) return field;
  if (field.status === "found" && isIsoYmd(field.value)) return field;
  return {
    value: isoDate,
    status: "found",
    evidence,
  };
}

function cityFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname.replace(/[-_]+/g, " ");
    return inferKnownCityLabel(path);
  } catch {
    return inferKnownCityLabel(url);
  }
}

function jsonLdEvidenceRows(
  jsonLd: StructuredEventFacts,
  pageUrl: string | null | undefined,
): FieldEvidence[] {
  const src = jsonLd.sourceUrl ?? pageUrl ?? null;
  const pairs: Array<[string, string | null]> = [
    ["title", jsonLd.title],
    ["startDate", jsonLd.startDate],
    ["startTime", jsonLd.startTime],
    ["endTime", jsonLd.endTime],
    ["city", jsonLd.city],
    ["venue", jsonLd.venue],
    ["priceNotes", jsonLd.priceNotes],
    ["organizer", jsonLd.organizer],
    ["sourceUrl", jsonLd.sourceUrl ?? pageUrl ?? null],
    ["ticketUrl", jsonLd.ticketUrl],
  ];
  return pairs.map(([field, value]) =>
    evidenceFromField({
      field,
      status: value ? "found" : "unknown",
      value,
      method: "json_ld",
      sourceUrl: src,
      quote: value ? `JSON-LD ${field}` : null,
    }),
  );
}

/**
 * Apply JSON-LD + city heuristics onto a proposal (in place style: returns new).
 */
export function enrichProposalFromPage(input: {
  proposal: IntakeProposal;
  html?: string | null;
  pageText?: string | null;
  pageUrl?: string | null;
}): IntakeProposal {
  const jsonLd: StructuredEventFacts | null = input.html
    ? extractJsonLdEventFacts(input.html)
    : null;
  let proposal = { ...input.proposal };
  const evidence = "Gestructureerde gegevens (JSON-LD) op de pagina";
  let layerEvidence: FieldEvidence[] = [];

  if (jsonLd) {
    proposal = {
      ...proposal,
      title: fillEmpty(proposal.title, jsonLd.title, evidence),
      startDate: preferIsoDate(proposal.startDate, jsonLd.startDate, evidence),
      startTime: fillEmpty(proposal.startTime, jsonLd.startTime, evidence),
      endTime: fillEmpty(proposal.endTime, jsonLd.endTime, evidence),
      city: fillEmpty(proposal.city, jsonLd.city, evidence),
      venue: fillEmpty(proposal.venue, jsonLd.venue, evidence),
      location: fillEmpty(
        proposal.location,
        jsonLd.locationText,
        evidence,
      ),
      priceNotes: fillEmpty(proposal.priceNotes, jsonLd.priceNotes, evidence),
      organizer: fillEmpty(proposal.organizer, jsonLd.organizer, evidence),
      sourceUrl: fillEmpty(
        proposal.sourceUrl,
        jsonLd.sourceUrl ?? input.pageUrl ?? null,
        evidence,
      ),
      ticketUrl: fillEmpty(
        proposal.ticketUrl ?? {
          value: null,
          status: "unknown",
          evidence: null,
        },
        jsonLd.ticketUrl,
        evidence,
      ),
    };
    layerEvidence = jsonLdEvidenceRows(jsonLd, input.pageUrl);
  }

  // Infer mappable city from venue / location / URL / page text when still empty.
  if (!proposal.city.value || proposal.city.status !== "found") {
    const inferred =
      inferKnownCityLabel(proposal.city.value) ||
      inferKnownCityLabel(proposal.venue.value) ||
      inferKnownCityLabel(proposal.location.value) ||
      cityFromUrl(proposal.sourceUrl.value ?? input.pageUrl) ||
      inferKnownCityLabel(input.pageText?.slice(0, 8_000) ?? null);
    if (inferred) {
      proposal = {
        ...proposal,
        city: {
          value: inferred,
          status: "found",
          evidence: "Plaats herkend uit pagina/locatie",
        },
      };
      layerEvidence = mergeFieldEvidence(layerEvidence, [
        evidenceFromField({
          field: "city",
          status: "found",
          value: inferred,
          method: "html",
          sourceUrl: input.pageUrl,
        }),
      ]);
    }
  } else {
    // Normalize spelling to a known label when possible (Ghent → Gent).
    const normalized = inferKnownCityLabel(proposal.city.value);
    if (normalized && normalized !== proposal.city.value) {
      proposal = {
        ...proposal,
        city: {
          ...proposal.city,
          value: normalized,
          evidence:
            proposal.city.evidence ??
            "Plaats genormaliseerd naar bekende gemeente",
        },
      };
    }
  }

  const startClock = proposal.startTime.value?.trim() ?? "";
  const startTimeUnknown = !(
    proposal.startTime.status === "found" &&
    Boolean(startClock) &&
    /^\d{2}:\d{2}/.test(startClock)
  );

  const fieldEvidence = mergeFieldEvidence(
    proposal.fieldEvidence ?? [],
    layerEvidence.length
      ? layerEvidence
      : collectProposalFieldEvidence(proposal, "html", input.pageUrl),
  );

  return {
    ...proposal,
    startTimeUnknown,
    fieldEvidence,
  };
}
