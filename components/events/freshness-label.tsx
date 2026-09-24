"use client";

import { formatFreshness, type FreshnessTone } from "@/lib/freshness";
import { cn } from "@/lib/utils";

const toneClass: Record<FreshnessTone, string> = {
  fresh: "bg-emerald-500",
  recent: "bg-amber-400",
  stale: "bg-stone-300",
};

export function FreshnessLabel({
  lastCheckedAt,
  compact = false,
}: {
  lastCheckedAt: string;
  compact?: boolean;
}) {
  const { label, tone, caution } = formatFreshness(lastCheckedAt);

  return (
    <div className="space-y-1">
      <p
        className={cn(
          "flex items-center gap-2",
          compact ? "text-xs text-muted-foreground" : "text-sm font-medium",
        )}
      >
        <span className={cn("size-2 rounded-full", toneClass[tone])} />
        <span>{label}</span>
      </p>
      {caution && !compact ? (
        <p className="text-sm text-amber-800">{caution}</p>
      ) : null}
    </div>
  );
}
