import { createHash } from "node:crypto";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import type { InstagramRenderKind } from "@/lib/instagram/render";
import {
  canonicalizeEventSnapshots,
  type InstagramEventSnapshot,
} from "@/lib/instagram/event-snapshot";

/** Idempotency key for publish slot (format + event *set*). Separate from approval. */
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

export type InstagramSlideApproval = {
  kind: InstagramRenderKind;
  label: string;
  query: Record<string, string>;
};

/** Stable slide payload for approval binding (ordered, sorted query keys). */
export function canonicalizeSlidesForApproval(
  slides: readonly InstagramSlideApproval[],
): InstagramSlideApproval[] {
  return slides.map((slide) => {
    const queryEntries = Object.entries(slide.query ?? {})
      .filter(([, v]) => typeof v === "string" && v.length > 0)
      .map(([k, v]) => [k, String(v).slice(0, 500)] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    const query: Record<string, string> = {};
    for (const [k, v] of queryEntries) query[k] = v;
    return {
      kind: slide.kind,
      label: String(slide.label ?? "").slice(0, 200),
      query,
    };
  });
}

/**
 * Approval identity: caption + ordered event ids + slides + event field snapshots.
 * Changing title/date/city/venue/etc. requires a new approval.
 */
export function buildInstagramContentFingerprint(input: {
  format: InstagramFormatId;
  eventIds: readonly string[];
  caption: string;
  slides: readonly InstagramSlideApproval[];
  eventSnapshots: readonly InstagramEventSnapshot[];
}): string {
  const orderedIds = input.eventIds.map((id) => id.trim()).filter(Boolean);
  const payload = {
    format: input.format,
    eventIds: orderedIds,
    caption: input.caption.trim(),
    slides: canonicalizeSlidesForApproval(input.slides),
    eventSnapshots: canonicalizeEventSnapshots(input.eventSnapshots),
  };
  return createHash("sha256")
    .update(`ig3b-content:v3:${JSON.stringify(payload)}`)
    .digest("hex")
    .slice(0, 64);
}

/** Slide event ids (from query.id / query.ids) must match the concept event list. */
export function slideEventIdsMatchConcept(
  eventIds: readonly string[],
  slides: readonly InstagramSlideApproval[],
): boolean {
  const allowed = new Set(eventIds.map((id) => id.trim()).filter(Boolean));
  for (const slide of slides) {
    const single = slide.query.id?.trim();
    if (single && !allowed.has(single)) return false;
    const ids = slide.query.ids;
    if (ids) {
      for (const part of ids.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!allowed.has(part)) return false;
      }
    }
  }
  return true;
}
