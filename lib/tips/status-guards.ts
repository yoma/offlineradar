/**
 * Tip status transition guards.
 * Existing naming is authoritative (received ≠ "new", needs_info ≠ "extra_info_needed").
 */
import type { TipStatus } from "@/types/tips";

const ALLOWED: Record<TipStatus, readonly TipStatus[]> = {
  received: [
    "duplicate",
    "in_review",
    "needs_info",
    "rejected",
    "approved_for_publication",
    "expired_or_cancelled",
  ],
  duplicate: [
    "in_review",
    "needs_info",
    "rejected",
    "approved_for_publication",
    "expired_or_cancelled",
  ],
  in_review: [
    "needs_info",
    "rejected",
    "approved_for_publication",
    "duplicate",
    "expired_or_cancelled",
  ],
  needs_info: [
    "in_review",
    "rejected",
    "approved_for_publication",
    "expired_or_cancelled",
  ],
  rejected: ["in_review", "expired_or_cancelled"],
  approved_for_publication: [
    "published",
    "in_review",
    "needs_info",
    "rejected",
    "expired_or_cancelled",
  ],
  published: ["expired_or_cancelled"],
  expired_or_cancelled: ["in_review"],
};

export function canTransitionTipStatus(
  from: TipStatus,
  to: TipStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

export function tipStatusTransitionError(
  from: TipStatus,
  to: TipStatus,
): string | null {
  if (canTransitionTipStatus(from, to)) return null;
  return `Statusovergang ${from} → ${to} is niet toegestaan.`;
}

/** Concept-event may only be created from approved tips (or override after re-approve). */
export function canCreateConceptFromTipStatus(status: TipStatus): boolean {
  return status === "approved_for_publication";
}
