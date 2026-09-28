"use client";

import {
  formatFreshness,
  formatFreshnessDetail,
  type FreshnessTone,
} from "@/lib/freshness";
import { cn } from "@/lib/utils";

const toneClass: Record<FreshnessTone, string> = {
  fresh: "bg-emerald-500",
  recent: "bg-amber-400",
  stale: "bg-stone-300",
  unknown: "bg-stone-200",
};

export function FreshnessLabel({
  lastCheckedAt,
  compact = false,
}: {
  lastCheckedAt: string | null | undefined;
  compact?: boolean;
}) {
  const freshness = compact
    ? formatFreshness(lastCheckedAt)
    : formatFreshnessDetail(lastCheckedAt);

  if (compact && !freshness.cardLabel) {
    return null;
  }

  const text = compact ? freshness.cardLabel! : freshness.label;

  return (
    <div className="space-y-1">
      <p
        className={cn(
          "flex items-center gap-2",
          compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground",
        )}
      >
        <span
          className={cn("size-1.5 shrink-0 rounded-full", toneClass[freshness.tone])}
          aria-hidden
        />
        <span>{text}</span>
      </p>
      {!compact ? (
        <p className="text-xs leading-5 text-muted-foreground">
          We controleren bronnen regelmatig. Beschikbaarheid en details kunnen
          intussen wijzigen; de officiële bron blijft leidend.
        </p>
      ) : null}
    </div>
  );
}
