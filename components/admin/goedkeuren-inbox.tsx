"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateAanvoerCandidateStatusAction } from "@/app/interne-aanvoer/actions";
import { PendingContent } from "@/components/ui/pending";
import type { CockpitCandidateRow } from "@/lib/aanvoer/cockpit-data";
import { ORIGIN_LABEL } from "@/lib/aanvoer/cockpit-data";

type Props = {
  items: CockpitCandidateRow[];
};

export function GoedkeurenInbox({ items: initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(editionId: string, intent: "toevoegen" | "niet_toegevoegd") {
    setBusyId(editionId);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("editionId", editionId);
    formData.set("intent", intent);
    startTransition(async () => {
      const result = await updateAanvoerCandidateStatusAction(formData);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== editionId));
      setMessage(
        result.message ??
          (intent === "toevoegen"
            ? "Toegevoegd aan DateOfflineHub."
            : "Gemarkeerd als niet toegevoegd."),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {message ? (
        <p
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white/90 px-5 py-8 text-center">
          <p className="font-semibold text-stone-900">Geen events ter review</p>
          <p className="mt-1 text-sm text-stone-600">
            Tips staan hieronder als er open tips zijn.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-stone-200 bg-white/95 px-4 py-4 shadow-sm sm:px-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
                      {ORIGIN_LABEL[item.origin]}
                      {item.readyToPublish
                        ? " · klaar voor publicatie"
                        : " · nakijken"}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-stone-900">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-sm text-stone-600">
                      {[item.displayDate, item.startTime, item.city, item.organizerName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p
                      className={`mt-2 text-sm ${
                        item.readyToPublish
                          ? "text-emerald-900"
                          : "text-amber-900"
                      }`}
                    >
                      {item.readinessSummary}
                    </p>
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm font-medium text-stone-700 underline-offset-4 hover:underline"
                      >
                        {item.sourceDomain ?? "Bron openen"}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(item.id, "toevoegen")}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                  >
                    <PendingContent pending={busy} pendingLabel="Bezig…">
                      {item.readyToPublish ? "Publiceren" : "Toch publiceren"}
                    </PendingContent>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(item.id, "niet_toegevoegd")}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-60"
                  >
                    Niet toevoegen
                  </button>
                  <Link
                    href={`/interne-aanvoer?tab=aandacht&editionId=${item.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-stone-600 underline-offset-4 hover:underline"
                  >
                    Meer details
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
