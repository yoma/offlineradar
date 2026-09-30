"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  analyzeIntakeAction,
  saveIntakeCombinedAction,
  saveIntakeEventAction,
  saveIntakeSourceAction,
} from "@/app/interne-aanvoer/actions";
import type {
  FieldStatus,
  IntakeEditableDraft,
  IntakeMatch,
  IntakeMode,
  IntakeProposal,
  IntakeSourceKindHint,
} from "@/lib/aanvoer/types";
import { INTAKE_MAX_BYTES } from "@/lib/aanvoer/types";

const MODES: { id: IntakeMode; label: string; help: string }[] = [
  {
    id: "url",
    label: "URL",
    help: "Plak een website, eventpagina, Instagram/Facebook-link of ticketlink",
  },
  {
    id: "text",
    label: "Tekst",
    help: "Plak tekst uit een advertentie, post of bericht",
  },
  {
    id: "screenshot",
    label: "Screenshot",
    help: "Upload PNG, JPG of WEBP (max 4 MB). Geen HEIC. Alleen review-evidence.",
  },
];

function validateScreenshotFile(file: File | null): string | null {
  if (!file || file.size === 0) {
    return "Kies een screenshot (PNG/JPG/WEBP).";
  }
  if (file.size > INTAKE_MAX_BYTES) {
    return "Screenshot mag maximaal 4 MB zijn.";
  }
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  ) {
    return "HEIC wordt niet ondersteund. Sla op als PNG of JPG.";
  }
  if (
    type &&
    type !== "image/png" &&
    type !== "image/jpeg" &&
    type !== "image/webp"
  ) {
    return "Alleen PNG, JPG/JPEG of WEBP zijn toegestaan.";
  }
  return null;
}

function statusLabel(status: FieldStatus): string {
  if (status === "found") return "gevonden";
  if (status === "uncertain") return "onzeker";
  return "onbekend";
}

function FieldMeta({
  status,
  evidence,
}: {
  status?: FieldStatus;
  evidence?: string | null;
}) {
  if (!status) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {statusLabel(status)}
      {evidence ? ` · “${evidence}”` : ""}
    </p>
  );
}

export function AanvoerClient({
  onSavedSource,
  onSavedCandidate,
}: {
  onSavedSource?: (sourceId: string) => void;
  onSavedCandidate?: (editionId: string) => void;
} = {}) {
  const [mode, setMode] = useState<IntakeMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [proposal, setProposal] = useState<IntakeProposal | null>(null);
  const [draft, setDraft] = useState<IntakeEditableDraft | null>(null);
  const [matches, setMatches] = useState<IntakeMatch[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceNeeded, setForceNeeded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savingKind, setSavingKind] = useState<
    null | "source" | "event" | "combined"
  >(null);
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null);
  const [savedEditionId, setSavedEditionId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const saveFeedbackRef = useRef<HTMLDivElement>(null);

  const fieldStatus = useMemo(() => {
    if (!proposal) return {} as Record<string, FieldStatus>;
    return {
      organizer: proposal.organizer.status,
      title: proposal.title.status,
      startDate: proposal.startDate.status,
      startTime: proposal.startTime.status,
      endTime: proposal.endTime.status,
      city: proposal.city.status,
      venue: proposal.venue.status,
      location: proposal.location.status,
      ageNotes: proposal.ageNotes.status,
      priceNotes: proposal.priceNotes.status,
      singlesOnly: proposal.singlesOnly.status,
      singlesOriented: proposal.singlesOriented.status,
      category: proposal.category.status,
      sourceUrl: proposal.sourceUrl.status,
      organizerUrl: proposal.organizerUrl.status,
      availability: proposal.availability.status,
      notes: proposal.notes.status,
    };
  }, [proposal]);

  const evidence = useMemo(() => {
    if (!proposal) return {} as Record<string, string | null>;
    return {
      organizer: proposal.organizer.evidence,
      title: proposal.title.evidence,
      startDate: proposal.startDate.evidence,
      ageNotes: proposal.ageNotes.evidence,
      singlesOnly: proposal.singlesOnly.evidence,
      singlesOriented: proposal.singlesOriented.evidence,
      sourceUrl: proposal.sourceUrl.evidence,
    };
  }, [proposal]);

  function patchDraft(patch: Partial<IntakeEditableDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function resetAll() {
    setProposal(null);
    setDraft(null);
    setMatches([]);
    setAssetId(null);
    setMessage(null);
    setError(null);
    setForceNeeded(false);
    setDismissed(false);
    setSavedSourceId(null);
    setSavedEditionId(null);
    setSavingKind(null);
  }

  function scrollToSaveFeedback() {
    queueMicrotask(() => {
      saveFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function analyze() {
    setError(null);
    setMessage(null);
    setDismissed(false);
    setForceNeeded(false);
    setSavingKind(null);
    setSavedSourceId(null);
    setSavedEditionId(null);

    if (mode === "screenshot") {
      const fileError = validateScreenshotFile(file);
      if (fileError) {
        setError(fileError);
        return;
      }
    }

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("url", url);
    formData.set("text", text);
    if (file) formData.set("screenshot", file);

    startTransition(async () => {
      try {
        const result = await analyzeIntakeAction(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setProposal(result.proposal);
        setDraft(result.draft);
        setMatches(result.matches);
        setAssetId(result.assetId);
        if (result.proposal.aiFailed) {
          setMessage(result.proposal.aiError);
        }
      } catch (err) {
        const text =
          err instanceof Error ? err.message : "Analyse mislukt.";
        if (/body exceeded|413|too large/i.test(text)) {
          setError(
            "Bestand is te groot voor de upload. Gebruik een screenshot tot 4 MB (PNG/JPG).",
          );
          return;
        }
        setError(text || "Analyse mislukt. Probeer opnieuw.");
      }
    });
  }

  function runSave(
    kind: "source" | "event" | "combined",
    action: typeof saveIntakeSourceAction,
    force = false,
  ) {
    if (!draft || pending) return;
    setError(null);
    setMessage(null);
    setSavedSourceId(null);
    setSavedEditionId(null);
    setSavingKind(kind);
    scrollToSaveFeedback();

    const formData = new FormData();
    formData.set("draft", JSON.stringify(draft));
    if (assetId) formData.set("assetId", assetId);
    if (force) formData.set("force", "1");

    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.ok) {
          setError(result.error);
          if (result.matches?.length) {
            setMatches(result.matches);
            setForceNeeded(true);
          }
          setSavingKind(null);
          scrollToSaveFeedback();
          return;
        }
        setForceNeeded(false);
        const parts: string[] = [];
        if (result.sourceId) {
          setSavedSourceId(result.sourceId);
          parts.push("Bron staat in Mijn bronnen.");
        }
        if (result.editionId) {
          setSavedEditionId(result.editionId);
          parts.push("Event-kandidaat staat klaar voor review.");
        }
        setMessage(
          parts.length > 0
            ? `Gelukt. ${parts.join(" ")}`
            : `Gelukt. ${result.message}`,
        );
        setSavingKind(null);
        scrollToSaveFeedback();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Opslaan mislukt. Probeer opnieuw.",
        );
        setSavingKind(null);
        scrollToSaveFeedback();
      }
    });
  }

  if (dismissed) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-5 shadow-sm">
        <p className="text-sm text-stone-700">
          Gemarkeerd als niet relevant. Niets opgeslagen.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-stone-900 underline-offset-4 hover:underline"
          onClick={resetAll}
        >
          Nieuwe intake
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                mode === item.id
                  ? "bg-stone-900 text-white shadow"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {MODES.find((item) => item.id === mode)?.help}
        </p>

        <div className="mt-4 space-y-3">
          {mode === "url" || mode === "screenshot" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-800">
                URL (optioneel bij screenshot)
              </span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                className="h-11 w-full break-all rounded-xl border border-stone-200 bg-white px-3"
              />
            </label>
          ) : null}

          {mode === "text" || mode === "url" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-800">
                {mode === "text" ? "Tekst" : "Extra notities (optioneel)"}
              </span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={mode === "text" ? 8 : 3}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2"
                placeholder="Plak hier…"
              />
            </label>
          ) : null}

          {mode === "screenshot" ? (
            <div className="block text-sm">
              <span className="mb-1.5 block font-medium text-stone-800">
                Screenshot
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                className="sr-only"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  const fileError = validateScreenshotFile(next);
                  setFile(fileError ? null : next);
                  setFileName(next?.name ?? null);
                  setError(fileError);
                }}
              />
              <div
                className={`flex flex-col gap-3 rounded-2xl border border-dashed px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                  file
                    ? "border-emerald-300 bg-emerald-50/70"
                    : "border-stone-300 bg-stone-50"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">
                    {fileName ? "Bestand geselecteerd" : "Nog geen bestand gekozen"}
                  </p>
                  <p className="mt-0.5 break-all text-xs text-stone-600">
                    {fileName ?? "PNG, JPG of WEBP · max 4 MB · geen HEIC"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
                  >
                    {file ? "Ander bestand" : "Bestand kiezen"}
                  </button>
                  {file ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setFileName(null);
                        setError(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      Wissen
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={analyze}
          className="mt-4 h-11 w-full rounded-full bg-rose-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:opacity-60 sm:w-auto"
        >
          {pending && !savingKind ? "Bezig met analyseren…" : "Analyseer"}
        </button>
      </section>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          <p className="font-semibold">{message}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {savedSourceId ? (
              <button
                type="button"
                className="font-semibold text-emerald-900 underline-offset-4 hover:underline"
                onClick={() => onSavedSource?.(savedSourceId)}
              >
                Bekijk in Mijn bronnen
              </button>
            ) : null}
            {savedEditionId ? (
              <button
                type="button"
                className="font-semibold text-emerald-900 underline-offset-4 hover:underline"
                onClick={() => onSavedCandidate?.(savedEditionId)}
              >
                Bekijk bij Event-kandidaten
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {draft && proposal ? (
        <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Voorstel</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Route:{" "}
              {draft.routeAdvice === "route_a"
                ? "Route A"
                : draft.routeAdvice === "route_b"
                  ? "Route B"
                  : draft.routeAdvice === "not_suitable"
                    ? "Mogelijk niet geschikt"
                    : "Review nodig"}
              {" · "}
              {draft.routeReason}
            </p>
            {proposal.needsSourceVerification ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Bronverificatie nodig. Screenshot/social alleen is geen publicatiebewijs.
              </p>
            ) : null}
          </div>

          {assetId ? (
            // Private admin preview only; not a public event image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/interne-aanvoer/asset/${assetId}`}
              alt="Intake screenshot (privé evidence)"
              className="max-h-56 w-full rounded-xl border border-border object-contain bg-secondary/40"
            />
          ) : null}

          {matches.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
              <p className="font-semibold">Mogelijke bestaande match</p>
              <ul className="mt-2 space-y-1">
                {matches.map((match) => (
                  <li key={`${match.kind}-${match.id}`}>
                    {match.label} - {match.detail} ({match.matchReason})
                  </li>
                ))}
              </ul>
              {forceNeeded ? (
                <p className="mt-2 text-xs">
                  Gebruik “toch opslaan” om bewust een duplicate te forceren.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["title", "Naam"],
                ["organizer", "Organisator"],
                ["startDate", "Datum (YYYY-MM-DD)"],
                ["startTime", "Starttijd"],
                ["endTime", "Eindtijd"],
                ["city", "Plaats"],
                ["venue", "Locatie/venue"],
                ["location", "Adres"],
                ["ageNotes", "Leeftijd"],
                ["priceNotes", "Prijs"],
                ["currency", "Valuta"],
                ["category", "Categorie"],
                ["sourceUrl", "Bron-URL"],
                ["organizerUrl", "Organizer-URL"],
                ["availability", "Beschikbaarheid"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block font-medium">{label}</span>
                <input
                  value={draft[key]}
                  onChange={(event) =>
                    patchDraft({ [key]: event.target.value } as Partial<IntakeEditableDraft>)
                  }
                  className="h-10 w-full rounded-xl border border-border px-3"
                />
                <FieldMeta
                  status={fieldStatus[key]}
                  evidence={evidence[key]}
                />
              </label>
            ))}

            <label className="block text-sm">
              <span className="mb-1 block font-medium">singlesOnly</span>
              <select
                value={draft.singlesOnly}
                onChange={(event) =>
                  patchDraft({
                    singlesOnly: event.target.value as IntakeEditableDraft["singlesOnly"],
                  })
                }
                className="h-10 w-full rounded-xl border border-border px-3"
              >
                <option value="unknown">onbekend</option>
                <option value="true">ja</option>
                <option value="false">nee</option>
              </select>
              <FieldMeta
                status={fieldStatus.singlesOnly}
                evidence={evidence.singlesOnly}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">singlesgericht</span>
              <select
                value={draft.singlesOriented}
                onChange={(event) =>
                  patchDraft({
                    singlesOriented: event.target
                      .value as IntakeEditableDraft["singlesOriented"],
                  })
                }
                className="h-10 w-full rounded-xl border border-border px-3"
              >
                <option value="unknown">onbekend</option>
                <option value="true">ja</option>
                <option value="false">nee</option>
              </select>
              <FieldMeta
                status={fieldStatus.singlesOriented}
                evidence={evidence.singlesOriented}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Brontype</span>
              <select
                value={draft.sourceKindHint}
                onChange={(event) =>
                  patchDraft({
                    sourceKindHint: event.target.value as IntakeSourceKindHint,
                  })
                }
                className="h-10 w-full rounded-xl border border-border px-3"
              >
                <option value="website_first">website-first</option>
                <option value="social_first">social-first</option>
                <option value="ticket_platform_first">ticket-platform-first</option>
                <option value="manual_only">manual-only</option>
              </select>
            </label>

            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Notities</span>
              <textarea
                value={draft.notes}
                onChange={(event) => patchDraft({ notes: event.target.value })}
                rows={3}
                className="w-full rounded-xl border border-border px-3 py-2"
              />
            </label>
          </div>

          <div
            ref={saveFeedbackRef}
            className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 sm:p-4"
          >
            <p className="text-sm font-semibold text-stone-900">
              Wat wil je hiermee doen?
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              <p className="font-semibold">Geen automatische scan bij deze knop</p>
              <p className="mt-1">
                Bewaren zet de bron op je lijst als{" "}
                <strong>verplichte input voor latere discovery</strong>. Er start
                nu geen crawl/refresh. Publicatie gebeurt pas na handmatige review
                van een event-kandidaat.
              </p>
            </div>

            {savingKind ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950"
              >
                <p className="font-semibold">
                  {savingKind === "source"
                    ? "Bron wordt bewaard…"
                    : savingKind === "event"
                      ? "Event-kandidaat wordt gemaakt…"
                      : "Bron én event-kandidaat worden bewaard…"}
                </p>
                <p className="mt-1 text-xs text-sky-900/80">
                  Even geduld. Dit publiceert niets.
                </p>
              </div>
            ) : null}

            {error && draft ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900"
              >
                <p className="font-semibold">Niet gelukt</p>
                <p className="mt-1">{error}</p>
                {forceNeeded ? (
                  <p className="mt-2 text-xs">
                    Er is een mogelijke match. Klik opnieuw op dezelfde knop om
                    toch te bewaren.
                  </p>
                ) : null}
              </div>
            ) : null}

            {message && (savedSourceId || savedEditionId) ? (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950"
              >
                <p className="font-semibold">{message}</p>
                <p className="mt-1 text-xs leading-5 text-emerald-900/90">
                  {savedSourceId
                    ? "De bron zit in Mijn bronnen en blijft mandatory voor toekomstige scans. Er loopt nu geen scan."
                    : null}
                  {savedSourceId && savedEditionId ? " " : null}
                  {savedEditionId
                    ? "Het event staat als kandidaat klaar; jij (of review) publiceert later."
                    : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {savedSourceId ? (
                    <button
                      type="button"
                      className="font-semibold text-emerald-900 underline-offset-4 hover:underline"
                      onClick={() => onSavedSource?.(savedSourceId)}
                    >
                      Open Mijn bronnen
                    </button>
                  ) : null}
                  {savedEditionId ? (
                    <button
                      type="button"
                      className="font-semibold text-emerald-900 underline-offset-4 hover:underline"
                      onClick={() => onSavedCandidate?.(savedEditionId)}
                    >
                      Open Event-kandidaten
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runSave("source", saveIntakeSourceAction, forceNeeded)
                }
                className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-left transition hover:border-stone-900 disabled:opacity-60"
              >
                <span className="block text-sm font-semibold text-stone-900">
                  {savingKind === "source"
                    ? "Bezig met bewaren…"
                    : "Alleen bron bewaren"}
                </span>
                <span className="mt-1 block text-xs leading-5 text-stone-600">
                  Nu: op de bronnenlijst. Later: meenemen in discovery/scans.
                  Geen event, geen publicatie, geen scan juist nu.
                </span>
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runSave("event", saveIntakeEventAction, forceNeeded)
                }
                className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-left transition hover:border-stone-900 disabled:opacity-60"
              >
                <span className="block text-sm font-semibold text-stone-900">
                  {savingKind === "event"
                    ? "Bezig met maken…"
                    : "Alleen event-kandidaat maken"}
                </span>
                <span className="mt-1 block text-xs leading-5 text-stone-600">
                  Nu: concept bij Event-kandidaten. Geen bronnenlijst, geen
                  automatische scan, niet zichtbaar voor gebruikers.
                </span>
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runSave("combined", saveIntakeCombinedAction, forceNeeded)
                }
                className="rounded-2xl border border-stone-900 bg-stone-900 px-4 py-3 text-left text-white transition hover:bg-stone-800 disabled:opacity-60"
              >
                <span className="block text-sm font-semibold">
                  {savingKind === "combined"
                    ? "Bezig met bewaren…"
                    : "Bron én event-kandidaat"}
                </span>
                <span className="mt-1 block text-xs leading-5 text-white/80">
                  Nu: bron op de lijst + concept-event. Scan later via discovery;
                  publicatie pas na review.
                </span>
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => setDismissed(true)}
                className="rounded-2xl px-4 py-2.5 text-left text-sm font-medium text-stone-500 underline-offset-4 hover:underline disabled:opacity-60"
              >
                Niet relevant — niets bewaren
              </button>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            Screenshot blijft privé-evidence en wordt nooit public event image.
          </p>
        </section>
      ) : null}
    </div>
  );
}
