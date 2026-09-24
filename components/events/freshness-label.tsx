"use client";

import { useEffect, useState } from "react";
import { formatFreshness, type FreshnessTone } from "@/lib/freshness";
import { cn } from "@/lib/utils";

const toneClass: Record<FreshnessTone, string> = {
  fresh: "bg-emerald-600",
  recent: "bg-amber-500",
  stale: "bg-stone-400",
};

export function FreshnessLabel({
  lastCheckedAt,
  compact = false,
}: {
  lastCheckedAt: string;
  compact?: boolean;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const [tone, setTone] = useState<FreshnessTone>("stale");
  const [caution, setCaution] = useState<string | null>(null);

  useEffect(() => {
    const freshness = formatFreshness(lastCheckedAt);
    setLabel(freshness.label);
    setTone(freshness.tone);
    setCaution(freshness.caution);
  }, [lastCheckedAt]);

  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("size-2 rounded-full", toneClass[tone])} />
        <span>
          Laatst gecontroleerd
          {label ? `: ${compact ? label.toLowerCase() : label}` : ""}
        </span>
      </p>
      {caution ? (
        <p className="text-sm text-amber-800">{caution}</p>
      ) : null}
    </div>
  );
}
