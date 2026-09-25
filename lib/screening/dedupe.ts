import type { NormalizedCandidate } from "@/types/screening";

function keyPart(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Duplicate key: normalized title + start date + venue/city. */
export function duplicateKey(candidate: NormalizedCandidate): string {
  return [
    keyPart(candidate.title),
    candidate.startDate ?? "recurring",
    keyPart(candidate.venue ?? candidate.city),
  ].join("|");
}

/**
 * Maps each candidate id to the id of the first candidate that shares its key.
 * A candidate that is the first occurrence maps to null (not a duplicate).
 */
export function findDuplicates(
  candidates: NormalizedCandidate[],
): Map<string, string | null> {
  const seen = new Map<string, string>();
  const result = new Map<string, string | null>();
  for (const candidate of candidates) {
    const key = duplicateKey(candidate);
    const existing = seen.get(key);
    if (existing) {
      result.set(candidate.id, existing);
    } else {
      seen.set(key, candidate.id);
      result.set(candidate.id, null);
    }
  }
  return result;
}
