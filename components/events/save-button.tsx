"use client";

import { Bookmark } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { track } from "@/lib/analytics";
import { readFavorites, writeFavorites } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function SaveButton({
  eventId,
  title,
  overlay = false,
}: {
  eventId: string;
  title: string;
  overlay?: boolean;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(readFavorites().includes(eventId));
    sync();
    window.addEventListener("offlineradar-store", sync);
    return () => window.removeEventListener("offlineradar-store", sync);
  }, [eventId]);

  function toggle(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const current = readFavorites();
    const next = saved
      ? current.filter((id) => id !== eventId)
      : [...current, eventId];
    writeFavorites(next);
    setSaved(!saved);
    if (!saved) track("favorite_added", { eventId, title });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Verwijder ${title} uit bewaard` : `Bewaar ${title}`}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full transition",
        overlay
          ? "bg-white/90 text-foreground shadow-sm hover:scale-105"
          : "border border-border bg-white text-foreground hover:border-foreground",
        saved && "text-[#e61e4d]",
      )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} />
    </button>
  );
}
