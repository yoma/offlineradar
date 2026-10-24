import { createHash } from "node:crypto";
import type { InstagramFormatId } from "@/lib/instagram/constants";

/** Stable idempotency key for a concept (format + event set). */
export function buildInstagramConceptKey(
  format: InstagramFormatId,
  eventIds: readonly string[],
): string {
  const normalized = [...new Set(eventIds.map((id) => id.trim()).filter(Boolean))]
    .sort()
    .join(",");
  return createHash("sha256")
    .update(`ig3b:v1:${format}:${normalized}`)
    .digest("hex")
    .slice(0, 64);
}
