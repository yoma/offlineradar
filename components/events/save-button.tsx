"use client";

import { Bookmark } from "lucide-react";
import { PendingSpinner } from "@/components/ui/pending";
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
        "inline-flex size-9 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--brand-bordeaux)_55%,var(--brand-gold))]",
        overlay
          ? "bg-white/92 text-[var(--brand-bordeaux)] shadow-sm hover:scale-105 hover:bg-[var(--brand-rose-soft)]"
          : "border border-[color-mix(in_srgb,var(--border)_70%,var(--brand-bordeaux)_30%)] bg-white text-[var(--brand-bordeaux)] hover:border-[var(--brand-bordeaux)] hover:bg-[var(--brand-rose-soft)]",
        saved &&
          "bg-[var(--brand-bordeaux)] text-white hover:bg-[var(--brand-bordeaux-muted)] hover:text-white",
      )}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <PendingSpinner />
      ) : (
        <Bookmark className={cn("size-4", saved && "fill-current")} />
      )}
    </button>
  );
}
