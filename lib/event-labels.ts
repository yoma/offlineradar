import { isActiveMeetActivation } from "@/types/domain";
import type { Event } from "@/types/event";

export type EventLabelKind = "singles_only" | "singles_friendly" | "meet";

export type EventLabel = {
  kind: EventLabelKind;
  text: string;
};

/**
 * Consumer-facing labels only when backing data exists.
 * No fake buttons; no empty placeholders.
 */
export function eventLabels(
  event: Pick<Event, "singlesOnly" | "singlesFriendly" | "meetActivation">,
): EventLabel[] {
  const labels: EventLabel[] = [];
  if (event.singlesOnly === true) {
    labels.push({ kind: "singles_only", text: "Singles only" });
  } else if (event.singlesFriendly) {
    labels.push({ kind: "singles_friendly", text: "Singles Friendly" });
  }
  if (isActiveMeetActivation(event.meetActivation)) {
    labels.push({ kind: "meet", text: "OfflineRadar Meet" });
  }
  return labels;
}
