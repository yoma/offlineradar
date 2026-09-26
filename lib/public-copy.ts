/**
 * Public consumer-facing copy for cards and detail soft warnings.
 * Internal review notes / evidence never pass through here unchanged.
 */

import { capacityLabel } from "@/lib/format";
import type { CapacityStatus, EligibilityAgeRule } from "@/types/event";

const TECHNICAL_NOTE_MARKERS = [
  "rsvp",
  "host niet",
  "niet betrouwbaar",
  "afleesbaar",
  "niet bevestigd",
  "bron 2026",
  "hercontrole",
  "conflict",
  "needs_review",
  "evidence",
  "internal",
];

export function formatPublicAvailabilityStatus(
  status: CapacityStatus | null | undefined,
): string {
  switch (status) {
    case "available":
      return "Beschikbaar";
    case "limited":
      return "Beperkte plaatsen";
    case "almost_full":
      return "Bijna vol";
    case "waitlist":
      return "Wachtlijst";
    case "sold_out":
      return "Volzet";
    case "unknown":
    case null:
    case undefined:
      return "Beschikbaarheid onbekend";
    default:
      return "Beschikbaarheid onbekend";
  }
}

/** Short badge for cards (max one capacity badge). */
export function publicCapacityBadge(
  status: CapacityStatus | null | undefined,
): string | null {
  if (status === "almost_full") return "Bijna vol";
  if (status === "waitlist") return "Wachtlijst";
  if (status === "sold_out") return "Volzet";
  if (status === "limited") return "Beperkte plaatsen";
  return null;
}

export function formatCardAgeLine(
  rule: EligibilityAgeRule,
  formattedRange: string | null,
): string {
  if (!formattedRange) return "Leeftijd niet vermeld";
  if (rule === "guideline") return `Richtleeftijd ${formattedRange}`;
  return formattedRange;
}

/**
 * Detail-only soft note. Never dump raw internal review text.
 */
export function formatConsumerAvailabilityDetail(
  status: CapacityStatus | null | undefined,
  note: string | null | undefined,
): string | null {
  const trimmed = note?.trim() || "";
  if (!trimmed) {
    if (status === "unknown" || status == null) {
      return "Beschikbaarheid onbekend — controleer bij de organisator.";
    }
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (TECHNICAL_NOTE_MARKERS.some((marker) => lower.includes(marker))) {
    if (status === "waitlist") {
      return "Er is een wachtlijst. Controleer actuele plaatsen bij de organisator.";
    }
    if (status === "almost_full" || status === "limited") {
      return "Nog beperkte plaatsen. Controleer bij de organisator.";
    }
    return "Beschikbaarheid onbekend — controleer bij de organisator.";
  }
  return trimmed;
}

export function formatGuidelineOutsideHint(): string {
  return "Controleer bij de organisator als je buiten deze richtleeftijd valt.";
}

/** Legacy capacityLabel still used elsewhere; keep in sync for open states. */
export function formatCapacityForUi(status: CapacityStatus): string {
  if (status === "available") return "Beschikbaar";
  if (status === "limited") return "Beperkte plaatsen";
  return capacityLabel(status);
}
