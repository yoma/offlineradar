/**
 * Central publication decision for aanvoer / tips / discovery.
 * AI output is never trusted; callers must pass server-validated fields.
 */
import {
  classifyAdminStatus,
  type AdminStatusInput,
  type AdminStatusResult,
} from "@/lib/aanvoer/admin-status";

export type PublicationDecision =
  | { decision: "publish"; reason: null; classified: AdminStatusResult }
  | {
      decision: "needs_attention";
      reason: string;
      classified: AdminStatusResult;
    }
  | {
      decision: "reject";
      reason: string;
      classified: AdminStatusResult;
    };

export function evaluateEventForPublication(
  input: AdminStatusInput,
): PublicationDecision {
  const classified = classifyAdminStatus(input);

  if (classified.status === "toegevoegd") {
    return { decision: "publish", reason: null, classified };
  }

  if (classified.status === "niet_toegevoegd") {
    return {
      decision: "reject",
      reason: classified.reason ?? "Niet toegevoegd",
      classified,
    };
  }

  if (classified.readyToPublish) {
    return { decision: "publish", reason: null, classified };
  }

  return {
    decision: "needs_attention",
    reason: classified.reason ?? "Jouw aandacht nodig",
    classified,
  };
}
