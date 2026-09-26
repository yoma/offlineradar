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

export type EventLabelSurface = "public" | "review";

/**
 * Consumer-facing labels only when backing data exists.
 * Singles only ≠ singles-oriented ≠ Singles Friendly ≠ Meet.
 *
 * Public surface: the whole catalog is singles-oriented by product rule,
 * so "Singlesgericht" is omitted. Only hard "Singles only" (and Meet) show.
 * Review surface keeps Singlesgericht for internal quality checks.
 */
export function eventLabels(
  event: Pick<
    Event,
    "singlesOnly" | "singlesFriendly" | "singlesOriented" | "meetActivation"
  >,
  surface: EventLabelSurface = "public",
): EventLabel[] {
  const labels: EventLabel[] = [];
  if (event.singlesOnly === true) {
    labels.push({ kind: "singles_only", text: "Singles only" });
  } else if (surface === "review" && event.singlesOriented === true) {
    labels.push({ kind: "singles_oriented", text: "Singlesgericht" });
  }
  if (isActiveMeetActivation(event.meetActivation)) {
    labels.push({ kind: "meet", text: "OfflineRadar Meet" });
  }
  return labels;
}
