"use client";

import Image from "next/image";
import { useState } from "react";
import { NEUTRAL_FALLBACK_DATA_URI } from "@/lib/image-compatibility";

/**
 * next/image with ordered failover when a remote mood URL dies (Unsplash 404).
 * Tries each candidate before the calm branded neutral placeholder.
 */
export function EventVisualImage({
  src,
  alt,
  priority = false,
  sizes,
  className,
  candidates = [],
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
  /** Extra URLs to try after `src` fails (same event / same theme). */
  candidates?: string[];
}) {
  const queue = buildQueue(src, candidates);
  // Failover position, tied to the queue it belongs to: a new src/candidate
  // list starts at 0 again without an effect.
  const queueKey = queue.join("|");
  const [failover, setFailover] = useState({ key: queueKey, index: 0 });
  const index = failover.key === queueKey ? failover.index : 0;
  const current = queue[Math.min(index, queue.length - 1)] ?? NEUTRAL_FALLBACK_DATA_URI;
  const unoptimized = current.startsWith("data:");

  return (
    <Image
      src={current}
      alt={alt}
      fill
      priority={priority}
      unoptimized={unoptimized}
      sizes={sizes}
      className={className}
      onError={() => {
        const next = index + 1;
        setFailover({
          key: queueKey,
          index: next < queue.length ? next : queue.length - 1,
        });
      }}
    />
  );
}

function buildQueue(src: string, candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [src, ...candidates, NEUTRAL_FALLBACK_DATA_URI]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
