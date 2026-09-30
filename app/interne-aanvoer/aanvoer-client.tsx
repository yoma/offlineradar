"use client";

import { useRef, useState, useTransition } from "react";
import {
  analyzeIntakeAction,
  approveIntakeAction,
  saveIntakeSourceAction,
} from "@/app/interne-aanvoer/actions";
import { evaluateIntakeApproval } from "@/lib/aanvoer/approval";
import type {
  FieldStatus,
  IntakeEditableDraft,
  IntakeMatch,
  IntakeMode,
  IntakeProposal,
} from "@/lib/aanvoer/types";
import { INTAKE_MAX_BYTES } from "@/lib/aanvoer/types";
import { CATEGORY_LABEL } from "@/lib/format";

type InputKind = "screenshot" | "url" | "text";

function hasScreenshotExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp")
  );
}

function validateScreenshotFile(file: File | null): string | null {
  if (!file || file.size === 0) {
    return "Kies een screenshot (PNG/JPG/WEBP).";
  }
  if (file.size > INTAKE_MAX_BYTES) {
    return "Screenshot mag maximaal 4 MB zijn.";
  }
  const type = (file.type || "").toLowerCase().trim();
  const name = file.name || "";
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    name.toLowerCase().endsWith(".heic") ||
    name.toLowerCase().endsWith(".heif")
  ) {
    return "HEIC wordt niet ondersteund. Sla op als PNG of JPG.";
  }
  if (
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/webp"
  ) {
    return null;
  }
  if (!type || type === "application/octet-stream") {
    if (hasScreenshotExtension(name)) return null;
    return "Kies een bestand met extensie .png, .jpg of .webp.";
  }
  if (hasScreenshotExtension(name)) return null;
  return "Alleen PNG, JPG/JPEG of WEBP zijn toegestaan.";
}

function formatDateNl(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Datum onbekend";
  try {
    return new Intl.DateTimeFormat("nl-BE", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function categoryLabel(value: string): string {
  if (value === "dating" || value === "meet_new_people" || value === "social") {
    return CATEGORY_LABEL[value];
  }
  return value || "Categorie onbekend";
}

function fieldOk(status: FieldStatus | undefined, value: string): boolean {
  if (!value.trim()) return false;
  return status === "found" || status === "uncertain";
}

export function AanvoerClient({
  onSavedSource,
  onSavedCandidate,
  onApprovedPublished,
}: {
  onSavedSource?: (sourceId: string) => void;
  onSavedCandidate?: (editionId: string) => void;
  onApprovedPublished?: (editionId: string) => void;
} = {}) {
  const [inputKind, setInputKind] = useState<InputKind | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [proposal, setProposal] = useState<IntakeProposal | null>(null);
  const [draft, setDraft] = useState<IntakeEditableDraft | null>(null);
  const [matches, setMatches] = useState<IntakeMatch[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [forceNeeded, setForceNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [analyzeStep, setAnalyzeStep] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);

  function resetAll() {
    setInputKind(null);
    setUrl("");
    setText("");
    setFile(null);
    setFileName(null);
    setProposal(null);
    setDraft(null);
    setMatches([]);
    setAssetId(null);
    setEditing(false);
    setForceNeeded(false);
    setError(null);
    setMessage(null);
    setAnalyzeStep(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function patchDraft(patch: Partial<IntakeEditableDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function modeForKind(kind: InputKind): IntakeMode {
    return kind;
  }

  function analyze() {
    if (!inputKind || pending) return;
    setError(null);
    setMessage(null);
    setForceNeeded(false);

    if (inputKind === "screenshot") {
      const fileError = validateScreenshotFile(file);
      if (fileError) {
        setError(fileError);
        return;
      }
    }
    if (inputKind === "url" && !url.trim()) {
      setError("Plak eerst een link.");
      return;
    }
    if (inputKind === "text" && !text.trim()) {
      setError("Plak eerst tekst.");
      return;
    }

    const formData = new FormData();
    formData.set("mode", modeForKind(inputKind));
    formData.set("url", url);
    formData.set("text", text);
    if (file) formData.set("screenshot", file);

    setAnalyzeStep("Afbeelding/link lezen…");
    startTransition(async () => {
      try {
        setAnalyzeStep("Eventgegevens herkennen…");
        const result = await analyzeIntakeAction(formData);
        if (!result.ok) {
          setError(
            result.error || "We konden dit event niet automatisch uitlezen.",
          );
          setAnalyzeStep(null);
          return;
        }
        setAnalyzeStep("Controleren of het al bestaat…");
        setProposal(result.proposal);
        setDraft(result.draft);
        setMatches(result.matches);
        setAssetId(result.assetId);
        setEditing(false);
        setAnalyzeStep(null);
        if (result.proposal.aiFailed) {
          setError(
            result.proposal.aiError ||
              "We konden dit event niet automatisch uitlezen.",
          );
        }
        queueMicrotask(() => {
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Analyse mislukt.";
        if (/body exceeded|413|too large/i.test(msg)) {
          setError(
            "Bestand is te groot. Gebruik een screenshot tot 4 MB (PNG/JPG).",
          );
        } else {
          setError("We konden dit event niet automatisch uitlezen.");
        }
        setAnalyzeStep(null);
      }
    });
  }

  function approve(force = false) {
    if (!draft || !proposal || pending) return;
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("draft", JSON.stringify(draft));
    if (assetId) formData.set("assetId", assetId);
    if (force || forceNeeded) formData.set("force", "1");
    if (proposal.needsSourceVerification) {
      formData.set("needsSourceVerification", "1");
    }
    if (proposal.aiFailed) formData.set("aiFailed", "1");

    startTransition(async () => {
      const result = await approveIntakeAction(formData);
      if (!result.ok) {
        setError(result.error);
        if (result.matches?.length) {
          setMatches(result.matches);
          setForceNeeded(true);
        }
        return;
      }
      setForceNeeded(false);
      setMessage(result.message);
      if (result.published) {
        onApprovedPublished?.(result.editionId);
      } else {
        onSavedCandidate?.(result.editionId);
      }
      if (result.sourceId) onSavedSource?.(result.sourceId);
    });
  }

  function saveSourceOnly(force = false) {
    if (!draft || pending) return;
    setError(null);
    const formData = new FormData();
    formData.set("draft", JSON.stringify(draft));
    if (assetId) formData.set("assetId", assetId);
    if (force || forceNeeded) formData.set("force", "1");
    startTransition(async () => {
      const result = await saveIntakeSourceAction(formData);
      if (!result.ok) {
        setError(result.error);
        if (result.matches?.length) {
          setMatches(result.matches);
          setForceNeeded(true);
        }
        return;
      }
      setMessage("Alleen als bron bewaard (geen event).");
      if (result.sourceId) onSavedSource?.(result.sourceId);
    });
  }

  const approval =
    draft && proposal
      ? evaluateIntakeApproval(draft, {
          needsSourceVerification: proposal.needsSourceVerification,
          routeAdvice: draft.routeAdvice,
          aiFailed: proposal.aiFailed,
        })
      : null;

  const showResult = Boolean(draft && proposal);

  return (
    <div className="space-y-5">
      {!showResult ? (
        <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm sm:p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            Voeg een singlesevent toe
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600 sm:text-base">
            Upload een screenshot of plak een link. AI zoekt de gegevens voor je
            uit.
          </p>

          {!inputKind ? (
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => setInputKind("screenshot")}
                className="rounded-2xl border border-stone-300 bg-stone-900 px-4 py-4 text-left text-white shadow-sm transition hover:bg-stone-800"
              >
                <span className="block text-base font-semibold">
                  Screenshot uploaden
                </span>
                <span className="mt-1 block text-sm text-white/75">
                  PNG, JPG of WEBP · max 4 MB
                </span>
              </button>
              <button
                type="button"
                onClick={() => setInputKind("url")}
                className="rounded-2xl border border-stone-300 bg-white px-4 py-4 text-left transition hover:border-stone-900"
              >
                <span className="block text-base font-semibold text-stone-900">
                  Link plakken
                </span>
                <span className="mt-1 block text-sm text-stone-600">
                  Eventpagina, agenda, social of ticketlink
                </span>
              </button>
              <button
                type="button"
                onClick={() => setInputKind("text")}
                className="px-1 py-2 text-left text-sm font-medium text-stone-500 underline-offset-4 hover:underline"
              >
                Of plak tekst
              </button>
            </div>
          ) : null}

          {inputKind === "screenshot" ? (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setInputKind(null)}
                className="text-sm font-medium text-stone-500 underline-offset-4 hover:underline"
              >
                ← Terug
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                className="sr-only"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  const fileError = validateScreenshotFile(next);
                  if (fileError) {
                    setFile(null);
                    setFileName(null);
                    setError(fileError);
                    event.target.value = "";
                    return;
                  }
                  setFile(next);
                  setFileName(next?.name ?? null);
                  setError(null);
                }}
              />
              <div
                className={`rounded-2xl border border-dashed px-4 py-4 ${
                  file
                    ? "border-emerald-300 bg-emerald-50/70"
                    : "border-stone-300 bg-stone-50"
                }`}
              >
                <p className="text-sm font-semibold text-stone-900">
                  {file ? "Bestand geselecteerd" : "Nog geen bestand gekozen"}
                </p>
                <p className="mt-1 break-all text-xs text-stone-600">
                  {file && fileName
                    ? `${fileName} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : "PNG, JPG of WEBP · max 4 MB · geen HEIC"}
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 inline-flex h-11 items-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white"
                >
                  {file ? "Ander bestand" : "Bestand kiezen"}
                </button>
              </div>
            </div>
          ) : null}

          {inputKind === "url" ? (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setInputKind(null)}
                className="text-sm font-medium text-stone-500 underline-offset-4 hover:underline"
              >
                ← Terug
              </button>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-stone-800">
                  Link
                </span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://…"
                  className="h-12 w-full break-all rounded-xl border border-stone-200 bg-white px-3"
                  autoFocus
                />
              </label>
            </div>
          ) : null}

          {inputKind === "text" ? (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setInputKind(null)}
                className="text-sm font-medium text-stone-500 underline-offset-4 hover:underline"
              >
                ← Terug
              </button>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-stone-800">
                  Tekst
                </span>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={7}
                  placeholder="Plak hier de advertentie of post…"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2"
                  autoFocus
                />
              </label>
            </div>
          ) : null}

          {inputKind ? (
            <button
              type="button"
              disabled={
                pending ||
                (inputKind === "screenshot" && !file) ||
                (inputKind === "url" && !url.trim()) ||
                (inputKind === "text" && !text.trim())
              }
              onClick={analyze}
              className="mt-4 h-12 w-full rounded-full bg-rose-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:opacity-60"
            >
              {pending ? "AI bekijkt je event…" : "Analyseer event"}
            </button>
          ) : null}

          {pending && analyzeStep ? (
            <p
              role="status"
              className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950"
            >
              <span className="font-semibold">AI bekijkt je event…</span>
              <span className="mt-1 block text-xs text-sky-900/80">
                {analyzeStep}
              </span>
            </p>
          ) : null}

          {error && !showResult ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
              <p className="font-semibold">
                We konden dit event niet automatisch uitlezen.
              </p>
              <p className="mt-1 text-xs">{error}</p>
              <button
                type="button"
                onClick={analyze}
                className="mt-2 text-sm font-semibold underline-offset-4 hover:underline"
              >
                Probeer opnieuw
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {showResult && draft && proposal ? (
        <section
          ref={resultRef}
          className="space-y-4 rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
                Eventpreview
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
                {draft.title.trim() || "Titel onbekend"}
              </h2>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="shrink-0 text-sm font-medium text-stone-500 underline-offset-4 hover:underline"
            >
              Nieuw
            </button>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-sm font-medium text-stone-800">
              {formatDateNl(draft.startDate)}
              {draft.startTime ? ` · ${draft.startTime}` : ""}
              {draft.endTime ? `–${draft.endTime}` : ""}
            </p>
            <p className="mt-1 text-sm text-stone-700">
              {[draft.venue, draft.city].filter(Boolean).join(" · ") ||
                "Locatie onbekend"}
            </p>
            <p className="mt-3 text-sm text-stone-600">
              Leeftijd: {draft.ageNotes.trim() || "onbekend"}
            </p>
            <p className="text-sm text-stone-600">
              Prijs: {draft.priceNotes.trim() || "onbekend"}
            </p>
            <p className="text-sm text-stone-600">
              Organisator: {draft.organizer.trim() || "onbekend"}
            </p>
            <p className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
              {categoryLabel(draft.category)}
            </p>
          </div>

          {assetId ? (
            // Private admin preview only.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/interne-aanvoer/asset/${assetId}`}
              alt="Intake screenshot (privé)"
              className="max-h-48 w-full rounded-xl border border-stone-200 object-contain bg-stone-100"
            />
          ) : null}

          <div className="space-y-1.5 text-sm">
            <CheckRow
              ok={fieldOk(proposal.title.status, draft.title)}
              label={
                fieldOk(proposal.title.status, draft.title)
                  ? "Eventtitel herkend"
                  : "Eventtitel ontbreekt"
              }
            />
            <CheckRow
              ok={fieldOk(proposal.startDate.status, draft.startDate)}
              label={
                fieldOk(proposal.startDate.status, draft.startDate)
                  ? "Datum bevestigd"
                  : "Datum niet gevonden"
              }
            />
            <CheckRow
              ok={Boolean(draft.venue.trim() || draft.city.trim())}
              label={
                draft.venue.trim() || draft.city.trim()
                  ? "Locatie bevestigd"
                  : "Locatie niet gevonden"
              }
            />
            <CheckRow
              ok={Boolean(draft.priceNotes.trim())}
              label={
                draft.priceNotes.trim()
                  ? "Prijs gevonden"
                  : "Prijs niet gevonden → Prijs onbekend"
              }
            />
            <CheckRow
              ok={
                draft.singlesOnly === "true" ||
                draft.singlesOriented === "true" ||
                draft.routeAdvice === "route_a" ||
                draft.routeAdvice === "route_b"
              }
              label={
                draft.singlesOnly === "true" ||
                draft.singlesOriented === "true" ||
                draft.routeAdvice === "route_a" ||
                draft.routeAdvice === "route_b"
                  ? "Singlesevent bevestigd"
                  : "Singlesgerichtheid nog controleren"
              }
            />
          </div>

          {approval && approval.reviewReasons.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p className="font-semibold">Dit event heeft nog controle nodig</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                {approval.reviewReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {matches.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p className="font-semibold">
                Dit event lijkt al in OfflineRadar te staan.
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {matches.map((match) => (
                  <li key={`${match.kind}-${match.id}`}>
                    {match.label} · {match.detail}
                  </li>
                ))}
              </ul>
              {forceNeeded ? (
                <p className="mt-2 text-xs">
                  Klik opnieuw op Goedkeuren om toch als nieuw toe te voegen.
                </p>
              ) : null}
            </div>
          ) : null}

          {editing ? (
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-2">
              <p className="sm:col-span-2 text-sm font-semibold text-stone-900">
                Aanpassen
              </p>
              {(
                [
                  ["title", "Titel"],
                  ["startDate", "Datum (YYYY-MM-DD)"],
                  ["startTime", "Starttijd"],
                  ["endTime", "Eindtijd"],
                  ["venue", "Locatie"],
                  ["city", "Stad"],
                  ["ageNotes", "Leeftijd"],
                  ["priceNotes", "Prijs"],
                  ["sourceUrl", "URL"],
                  ["availability", "Beschikbaarheid"],
                  ["category", "Categorie"],
                  ["organizer", "Organisator"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1 block font-medium">{label}</span>
                  <input
                    value={draft[key]}
                    onChange={(event) =>
                      patchDraft({ [key]: event.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3"
                  />
                </label>
              ))}
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">Notities</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => patchDraft({ notes: event.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2"
                />
              </label>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
              <p className="font-semibold">{message}</p>
              <button
                type="button"
                onClick={resetAll}
                className="mt-2 text-sm font-semibold underline-offset-4 hover:underline"
              >
                Nog een event toevoegen
              </button>
            </div>
          ) : null}

          {!message ? (
            <div className="grid gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => approve(forceNeeded)}
                className="rounded-2xl bg-stone-900 px-4 py-3.5 text-left text-white transition hover:bg-stone-800 disabled:opacity-60"
              >
                <span className="block text-sm font-semibold">
                  {pending
                    ? "Bezig…"
                    : editing
                      ? "Opslaan en toevoegen"
                      : "Goedkeuren & toevoegen"}
                </span>
                <span className="mt-1 block text-xs text-white/75">
                  {approval?.canPublish
                    ? "Voegt het event toe (live na goedkeuring)."
                    : "Slaat op onder Te bekijken als er nog controle nodig is."}
                </span>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing((value) => !value)}
                className="rounded-2xl border border-stone-300 bg-white px-4 py-3.5 text-left transition hover:border-stone-900 disabled:opacity-60"
              >
                <span className="block text-sm font-semibold text-stone-900">
                  {editing ? "Aanpassen verbergen" : "Iets aanpassen"}
                </span>
                <span className="mt-1 block text-xs text-stone-600">
                  Alleen tonen als AI iets mist of fout heeft.
                </span>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={resetAll}
                className="rounded-2xl px-4 py-3 text-left text-sm font-medium text-stone-500 underline-offset-4 hover:underline disabled:opacity-60"
              >
                Niet toevoegen
              </button>
              <button
                type="button"
                disabled={pending || !(draft.sourceUrl || draft.organizerUrl)}
                onClick={() => saveSourceOnly(forceNeeded)}
                className="px-1 py-1 text-left text-xs font-medium text-stone-400 underline-offset-4 hover:underline disabled:opacity-40"
              >
                Alleen als bron bewaren
              </button>
            </div>
          ) : null}

          <p className="text-xs text-stone-500">
            Screenshot blijft privé-evidence. Geen automatische publicatie zonder
            jouw goedkeuring.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={`flex gap-2 ${ok ? "text-emerald-800" : "text-stone-600"}`}>
      <span aria-hidden>{ok ? "✓" : "?"}</span>
      <span>{label}</span>
    </p>
  );
}
