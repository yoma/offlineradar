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
  // Speeddaten parser dumps img paths into availabilityNote — never show raw.
  "/site/img/",
  "speeddatenbe/table",
  "ja.png",
  "nee.png",
  "bijna.png",
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

/**
 * When the source splits availability by gender, a merged waitlist/sold_out
 * status must not claim "nobody can book" if one gender still has places.
 * Gender line stays authoritative; this only softens the general badge.
 */
export function effectivePublicCapacity(
  status: CapacityStatus | null | undefined,
  genderAvailability?: string | null,
): CapacityStatus | null | undefined {
  if (status == null || status === "unknown") return status;
  if (status !== "waitlist" && status !== "sold_out") return status;
  const gender = genderAvailability?.trim() ?? "";
  if (!gender) return status;
  const hasOpenGender =
    /nog plaats/i.test(gender) ||
    /laatste plaatsen/i.test(gender) ||
    /bijna vol/i.test(gender);
  if (!hasOpenGender) return status;
  if (/laatste plaatsen|bijna vol/i.test(gender)) return "limited";
  return "available";
}

/** Short badge for cards (max one capacity badge). */
export function publicCapacityBadge(
  status: CapacityStatus | null | undefined,
  genderAvailability?: string | null,
): string | null {
  const effective = effectivePublicCapacity(status, genderAvailability);
  if (effective === "almost_full") return "Bijna vol";
  if (effective === "waitlist") return "Wachtlijst";
  if (effective === "sold_out") return "Volzet";
  if (effective === "limited") return "Beperkte plaatsen";
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
    // available / sold_out / unknown: leave room for CapacityStatus + gender line
    if (status === "available" || status === "sold_out") return null;
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
