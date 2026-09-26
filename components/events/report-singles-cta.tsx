"use client";

import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Phase = "idle" | "confirm" | "submitting" | "done" | "error";

/**
 * Public CTA: Geen singlesevent? Meld het
 * Max 2 taps: open confirm → Ja, meld dit.
 * stopPropagation so card Link does not navigate.
 */
export function ReportSinglesCta({
  eventId,
  compact = false,
  className,
}: {
  eventId: string;
  compact?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const open =
    phase === "confirm" ||
    phase === "submitting" ||
    phase === "done" ||
    phase === "error";

  function openConfirm(e: MouseEvent | KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setPhase("confirm");
  }

  function close() {
    if (phase === "submitting") return;
    setPhase("idle");
    setError(null);
  }

  async function submit() {
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/report`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Melding mislukt. Probeer later opnieuw.");
        setPhase("error");
        return;
      }
      setPhase("done");
    } catch {
      setError("Melding mislukt. Probeer later opnieuw.");
      setPhase("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openConfirm(e);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "min-h-9 text-left underline-offset-4 hover:underline",
          compact
            ? "text-xs text-muted-foreground"
            : "text-sm text-muted-foreground",
          className,
        )}
      >
        Geen singlesevent? Meld het
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={phase !== "submitting"}
          className="mx-auto max-w-lg rounded-t-2xl"
          aria-labelledby={titleId}
        >
          {phase === "done" ? (
            <>
              <SheetHeader>
                <SheetTitle id={titleId}>Bedankt, we controleren het.</SheetTitle>
                <SheetDescription>
                  We bekijken je melding handmatig. Het event blijft online tot
                  wij zelf iets wijzigen.
                </SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <Button type="button" onClick={close} className="w-full">
                  Sluiten
                </Button>
              </SheetFooter>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle id={titleId}>
                  Denk je dat dit event niet voor singles bedoeld is?
                </SheetTitle>
                <SheetDescription>
                  We controleren de melding zelf. Geen account of extra gegevens
                  nodig.
                </SheetDescription>
              </SheetHeader>
              {error ? (
                <p className="px-4 text-sm text-amber-800" role="alert">
                  {error}
                </p>
              ) : null}
              <SheetFooter className="flex-row gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={phase === "submitting"}
                  onClick={close}
                >
                  Annuleren
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={phase === "submitting"}
                  onClick={() => void submit()}
                >
                  {phase === "submitting" ? "Bezig…" : "Ja, meld dit"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
