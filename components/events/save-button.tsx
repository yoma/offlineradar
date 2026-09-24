"use client";

import { Bookmark } from "lucide-react";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { readFavorites, writeFavorites } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function SaveButton({
  eventId,
  title,
}: {
  eventId: string;
  title: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(readFavorites().includes(eventId));
    sync();
    window.addEventListener("offlineradar-store", sync);
    return () => window.removeEventListener("offlineradar-store", sync);
  }, [eventId]);

  function toggle() {
    const current = readFavorites();
    const next = saved
      ? current.filter((id) => id !== eventId)
      : [...current, eventId];
    writeFavorites(next);
    setSaved(!saved);
    if (!saved) {
      track("favorite_added", { eventId, title });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Verwijder ${title} uit bewaard` : `Bewaar ${title}`}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full border bg-background/90 text-foreground",
        saved && "border-primary text-primary",
      )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} />
    </button>
  );
}
