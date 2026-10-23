"use client";

import { useEffect, useState, useTransition } from "react";
import { approveInstagramConceptAction } from "@/app/interne-instagram/actions";
import {
  imageUrlFromQuery,
  type InstagramDraft,
} from "@/lib/instagram/drafts";
import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_SLOGAN,
  INSTAGRAM_WEBSITE,
  type InstagramFormatId,
} from "@/lib/instagram/constants";

const FORMAT_TITLE: Record<InstagramFormatId, string> = {
  binnenkort: "Format A — Binnenkort te beleven",
  deze_week: "Format B — Deze week nog iets gepland?",
  nieuw: "Format C — Nieuw op DateOfflineHub",
};

function DraftCard({ draft }: { draft: InstagramDraft }) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [approved, setApproved] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const slide = draft.slides[slideIndex] ?? draft.slides[0];
  const src = slide ? imageUrlFromQuery(slide.query) : "";

  useEffect(() => {
    setImageLoaded(false);
  }, [src]);

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-4 py-3 sm:px-5">
        <h2 className="font-heading text-lg text-[var(--brand-bordeaux)]">
          {FORMAT_TITLE[draft.format]}
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          {draft.events.length} events · {draft.periodLabel} ·{" "}
          {draft.slides.length} slide
          {draft.slides.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] sm:p-5">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--brand-gold)_35%,var(--border))] bg-[var(--brand-cream)] shadow-[0_16px_40px_-28px_rgba(47,48,53,0.45)]">
            {!imageLoaded ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--brand-cream)]/80 text-sm font-semibold text-[var(--brand-bordeaux)]"
                aria-live="polite"
              >
                Slide wordt gerenderd…
              </div>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={src}
              src={src}
              alt={slide?.label ?? draft.altHint}
              width={1080}
              height={1350}
              className={`h-auto w-full transition-opacity ${imageLoaded ? "opacity-100" : "opacity-40"}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          </div>
          {draft.slides.length > 1 ? (
            <div
              className="mt-3 flex flex-wrap items-center justify-center gap-2"
              role="tablist"
              aria-label="Carrouselslides"
            >
              {draft.slides.map((s, i) => (
                <button
                  key={`${s.kind}-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === slideIndex}
                  onClick={() => {
                    if (i === slideIndex) return;
                    setImageLoaded(false);
                    setSlideIndex(i);
                    // Prefetch neighbour slides so the next click feels instant.
                    const next = draft.slides[i + 1];
                    if (next && typeof window !== "undefined") {
                      const img = new window.Image();
                      img.src = imageUrlFromQuery(next.query);
                    }
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    i === slideIndex
                      ? "bg-[var(--brand-bordeaux)] text-white"
                      : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {i === 0 ? "Cover" : `Slide ${i}`}
                </button>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-center text-xs text-stone-500">
            1080 × 1350 · {slide?.label}
            {!imageLoaded ? " · laden…" : ""}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-800">
              Geselecteerde events
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-stone-700">
              {draft.events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2"
                >
                  <span className="font-medium text-[var(--brand-bordeaux)]">
                    {event.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {event.startDate}
                    {event.startTime ? ` · ${event.startTime}` : ""} ·{" "}
                    {event.city} · {event.organizerName}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-stone-800">Caption</h3>
              <button
                type="button"
                className="text-xs font-semibold text-[var(--brand-gold-ink)] underline-offset-2 hover:underline"
                onClick={async () => {
                  await navigator.clipboard.writeText(draft.caption);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? "Gekopieerd" : "Kopieer"}
              </button>
            </div>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-stone-200 bg-[#fbf8f0] p-3 text-xs leading-5 text-stone-700">
              {draft.caption}
            </pre>
          </div>

          <form
            className="mt-auto flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4"
            action={(formData) => {
              startTransition(async () => {
                const res = await approveInstagramConceptAction(formData);
                if (res.ok) setApproved(true);
              });
            }}
          >
            <input
              type="hidden"
              name="eventIds"
              value={draft.eventIds.join(",")}
            />
            <button
              type="submit"
              disabled={pending || approved}
              className="rounded-xl bg-[var(--brand-bordeaux)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-bordeaux-muted)] disabled:opacity-50"
            >
              {approved
                ? "Concept onthouden"
                : pending
                  ? "Bezig…"
                  : "Goedkeuren (onthouden, niet publiceren)"}
            </button>
            <p className="text-xs text-stone-500">
              Geen automatische Instagram-publicatie in fase 3A.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

export function InstagramPreviewClient({
  drafts,
  notes,
}: {
  drafts: InstagramDraft[];
  notes: string[];
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-[var(--brand-gold-deep)]">
          {INSTAGRAM_HANDLE} · fase 3A preview
        </p>
        <h1 className="font-heading text-2xl tracking-tight text-[var(--brand-bordeaux)] sm:text-3xl">
          Instagram Autopilot — visuele voorbeelden
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-stone-600">
          Gerenderde 4:5-beelden (1080×1350) met het echte logo, {INSTAGRAM_WEBSITE}{" "}
          en huisstijl. Slogan: {INSTAGRAM_SLOGAN}. Selectie is objectief; er
          wordt niets naar Instagram gestuurd.
        </p>
      </header>

      {notes.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <ul className="list-disc space-y-1 pl-5">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {drafts.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-sm text-stone-600">
          Geen concepten — onvoldoende gepubliceerde evenementen in de
          selectievensters.
        </p>
      ) : (
        drafts.map((draft) => <DraftCard key={draft.id} draft={draft} />)
      )}
    </div>
  );
}
