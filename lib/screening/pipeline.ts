import { findDuplicates } from "@/lib/screening/dedupe";
import { normalizeAll } from "@/lib/screening/normalize";
import { DEFAULT_PILOT_WINDOW, screenCandidate } from "@/lib/screening/screen";
import type {
  NormalizedCandidate,
  PilotWindow,
  RawCandidate,
  ScreeningResult,
} from "@/types/screening";

export type PipelineRow = {
  normalized: NormalizedCandidate;
  result: ScreeningResult;
};

/** Raw candidates -> normalized -> dedupe -> screening decisions. */
export function runPipeline(
  raws: RawCandidate[],
  window: PilotWindow = DEFAULT_PILOT_WINDOW,
  now = new Date(),
): PipelineRow[] {
  const normalized = normalizeAll(raws);
  const duplicates = findDuplicates(normalized);
  return normalized.map((candidate) => ({
    normalized: candidate,
    result: screenCandidate(
      candidate,
      duplicates.get(candidate.id) ?? null,
      window,
      now,
    ),
  }));
}
