"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateAanvoerCandidateStatusAction } from "@/app/interne-aanvoer/actions";
import { PendingContent } from "@/components/ui/pending";
import type { CockpitCandidateRow } from "@/lib/aanvoer/cockpit-data";
import { ORIGIN_LABEL } from "@/lib/aanvoer/cockpit-data";
import { displayEventTitle } from "@/lib/aanvoer/display-title";
import { isWeakLocationCity } from "@/lib/geo-cities";

type Props = {
  items: CockpitCandidateRow[];
};

function placeLabel(city: string | null | undefined): string | null {
  if (!city?.trim() || isWeakLocationCity(city)) return null;
  return city.trim();
}

function eyebrowFor(item: CockpitCandidateRow): string | null {
  const origin =
    item.origin === "onbekend" ? null : ORIGIN_LABEL[item.origin];
  const state = item.readyToPublish ? "Klaar voor publicatie" : "Nakijken";
  if (origin) return `${origin} · ${state}`;
  return state;
}

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
            const eyebrow = eyebrowFor(item);
            const place = placeLabel(item.city);
            const displayTitle = displayEventTitle(item.title);
            const editHref = `/interne-aanvoer?tab=aandacht&editionId=${item.id}`;
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-stone-200 bg-white/95 px-4 py-4 shadow-sm sm:px-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {eyebrow ? (
                      <p className="text-xs font-semibold tracking-wide text-stone-500">
                        {eyebrow}
                      </p>
                    ) : null}
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-stone-900">
                      {displayTitle}
                    </h2>
                    {displayTitle !== item.title.trim() ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">
                        Volledige titel: {item.title}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-stone-600">
                      {[
                        item.displayDate,
                        item.startTime,
                        place ?? (item.checks.location ? null : "Locatie ontbreekt"),
                        item.organizerName,
                      ]
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
                  {item.readyToPublish ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(item.id, "toevoegen")}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                    >
                      <PendingContent pending={busy} pendingLabel="Bezig…">
                        Publiceren
                      </PendingContent>
                    </button>
                  ) : (
                    <Link
                      href={editHref}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                    >
                      Gegevens corrigeren
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(item.id, "niet_toegevoegd")}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-60"
                  >
                    Niet toevoegen
                  </button>
                  {item.readyToPublish ? (
                    <Link
                      href={editHref}
                      className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-stone-600 underline-offset-4 hover:underline"
                    >
                      Meer details
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
