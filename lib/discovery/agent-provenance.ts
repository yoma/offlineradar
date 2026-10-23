/**
 * Agent discovery provenance for Source Map notes.
 * Convention: tag `discovered_by=agent` so admin can filter Autopilot finds.
 * Never invent `discovered_by=user`. Agent finds stay refresh_enabled=false
 * until a human enables follow in Bronnen.
 */

import { isUserSuppliedNotes } from "@/lib/discovery/user-supplied";

export const AGENT_DISCOVERED_TAG = "discovered_by=agent";

export function isAgentDiscoveredNotes(notes: string | null | undefined): boolean {
  if (!notes) return false;
  return notes.includes(AGENT_DISCOVERED_TAG);
}

/**
 * Ensure notes carry agent provenance without duplicating the tag.
 * Refuses to attach agent tag when notes already carry user-supplied provenance
 * (user tag wins; never rewrite handmatige productvondst).
 */
export function withAgentDiscoveredProvenance(
  notes: string | null | undefined,
  extra?: string,
): string | null {
  const base = (notes ?? "").trim();
  if (isUserSuppliedNotes(base)) {
    return base || null;
  }
  const parts: string[] = [];
  if (base) parts.push(base);
  if (!isAgentDiscoveredNotes(base)) {
    parts.push(
      `${AGENT_DISCOVERED_TAG} | Autopilot discovery (mens enable follow vóór refresh).`,
    );
  }
  if (extra?.trim()) parts.push(extra.trim());
  return parts.filter(Boolean).join(" ") || null;
}
