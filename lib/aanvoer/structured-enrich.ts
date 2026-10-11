/**
 * Fill intake proposal gaps from deterministic page facts (JSON-LD, city map).
 * Never overwrites a field that AI already marked as found with a value.
 */

import type { StructuredEventFacts } from "@/lib/aanvoer/json-ld-event";
import { extractJsonLdEventFacts } from "@/lib/aanvoer/json-ld-event";
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

function cityFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname.replace(/[-_]+/g, " ");
    return inferKnownCityLabel(path);
  } catch {
    return inferKnownCityLabel(url);
  }
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

  if (jsonLd) {
    proposal = {
      ...proposal,
      title: fillEmpty(proposal.title, jsonLd.title, evidence),
      startDate: fillEmpty(proposal.startDate, jsonLd.startDate, evidence),
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
    };
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

  return proposal;
}
