"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { NEUTRAL_FALLBACK_DATA_URI } from "@/lib/image-compatibility";

/**
 * next/image with a silent fallback when a remote mood URL 404s
 * (e.g. Unsplash removed the photo).
 */
export function EventVisualImage({
  src,
  alt,
  priority = false,
  sizes,
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  const [current, setCurrent] = useState(src);
  const unoptimized = current.startsWith("data:");

  useEffect(() => {
    setCurrent(src);
  }, [src]);

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
        if (current !== NEUTRAL_FALLBACK_DATA_URI) {
          setCurrent(NEUTRAL_FALLBACK_DATA_URI);
        }
      }}
    />
  );
}
