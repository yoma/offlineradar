"use client";

import { Bookmark } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState, type MouseEvent } from "react";
import { toggleSavedEventAction } from "@/app/account/actions";
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
  const { data: session } = useSession();
  const loggedIn = Boolean(session?.user?.id);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(readFavorites().includes(eventId));
    sync();
    window.addEventListener("offlineradar-store", sync);
    return () => window.removeEventListener("offlineradar-store", sync);
  }, [eventId]);

  async function toggle(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;

    const nextSaved = !saved;
    const current = readFavorites();
    const nextLocal = nextSaved
      ? [...current.filter((id) => id !== eventId), eventId]
      : current.filter((id) => id !== eventId);

    // Optimistic local update (anonymous + logged-in).
    writeFavorites(nextLocal);
    setSaved(nextSaved);
    track(nextSaved ? "event_saved" : "event_unsaved", {
      eventId,
      title,
    });

    if (!loggedIn) return;

    setPending(true);
    const result = await toggleSavedEventAction(eventId, nextSaved);
    setPending(false);
    if (!result.ok) {
      // Roll back local on server failure.
      writeFavorites(current);
      setSaved(!nextSaved);
      return;
    }
    writeFavorites(result.ids);
    setSaved(result.ids.includes(eventId));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? `Verwijder ${title} uit bewaard` : `Bewaar ${title}`}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full transition",
        overlay
          ? "bg-white/90 text-foreground shadow-sm hover:scale-105"
          : "border border-border bg-white text-foreground hover:border-foreground",
        saved && "text-primary",
      )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} />
    </button>
  );
}
