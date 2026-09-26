import { isActiveMeetActivation } from "@/types/domain";
import type { Event } from "@/types/event";

export type EventLabelKind =
  | "singles_only"
  | "singles_oriented"
  | "singles_friendly"
  | "meet";

export type EventLabel = {
  kind: EventLabelKind;
  text: string;
};

/**
 * Consumer-facing labels only when backing data exists.
 * Singles only ≠ singles-oriented ≠ Singles Friendly ≠ Meet.
 * Singles Friendly alone never creates listing eligibility.
 */
export function eventLabels(
  event: Pick<
    Event,
    "singlesOnly" | "singlesFriendly" | "singlesOriented" | "meetActivation"
  >,
): EventLabel[] {
  const labels: EventLabel[] = [];
  if (event.singlesOnly === true) {
    labels.push({ kind: "singles_only", text: "Singles only" });
  } else if (event.singlesOriented === true) {
    labels.push({ kind: "singles_oriented", text: "Singlesgericht" });
  }
  // Never show singlesFriendly marketing badge on consumer surfaces.
  if (isActiveMeetActivation(event.meetActivation)) {
    labels.push({ kind: "meet", text: "OfflineRadar Meet" });
  }
  return labels;
}
