"use client";

import { useMemo, useState, useTransition } from "react";
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
    help: "Upload PNG, JPG/JPEG of WEBP (max 4 MB). Alleen review-evidence.",
  },
];

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

export function AanvoerClient() {
  const [mode, setMode] = useState<IntakeMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [proposal, setProposal] = useState<IntakeProposal | null>(null);
  const [draft, setDraft] = useState<IntakeEditableDraft | null>(null);
  const [matches, setMatches] = useState<IntakeMatch[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceNeeded, setForceNeeded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

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
  }

  function analyze() {
    setError(null);
    setMessage(null);
    setDismissed(false);
    setForceNeeded(false);
    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("url", url);
    formData.set("text", text);
    if (file) formData.set("screenshot", file);

    startTransition(async () => {
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
    });
  }

  function runSave(
    action: typeof saveIntakeSourceAction,
    force = false,
  ) {
    if (!draft) return;
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("draft", JSON.stringify(draft));
    if (assetId) formData.set("assetId", assetId);
    if (force) formData.set("force", "1");

    startTransition(async () => {
      const result = await action(formData);
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
    });
  }

  if (dismissed) {
    return (
      <div className="rounded-xl border border-border bg-white px-4 py-5">
        <p className="text-sm">Gemarkeerd als niet relevant. Niets opgeslagen.</p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold underline-offset-4 hover:underline"
          onClick={resetAll}
        >
          Nieuwe intake
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                mode === item.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {MODES.find((item) => item.id === mode)?.help}
        </p>

        <div className="mt-4 space-y-3">
          {mode === "url" || mode === "screenshot" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">URL (optioneel bij screenshot)</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                className="h-11 w-full rounded-xl border border-border px-3"
              />
            </label>
          ) : null}

          {mode === "text" || mode === "url" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                {mode === "text" ? "Tekst" : "Extra notities (optioneel)"}
              </span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={mode === "text" ? 8 : 3}
                className="w-full rounded-xl border border-border px-3 py-2"
                placeholder="Plak hier…"
              />
            </label>
          ) : null}

          {mode === "screenshot" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Screenshot</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                className="block w-full text-sm"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  setFile(next);
                  setFileName(next?.name ?? null);
                }}
              />
              {fileName ? (
                <p className="mt-1 text-xs text-muted-foreground">{fileName}</p>
              ) : null}
            </label>
          ) : null}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={analyze}
          className="mt-4 h-11 w-full rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Bezig…" : "Analyseer"}
        </button>
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}

      {draft && proposal ? (
        <section className="space-y-4 rounded-xl border border-border bg-white p-4 sm:p-5">
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
                    {match.label} — {match.detail} ({match.matchReason})
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

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={pending}
              onClick={() => runSave(saveIntakeSourceAction, forceNeeded)}
              className="h-11 rounded-full border border-border px-4 text-sm font-semibold hover:border-foreground disabled:opacity-60"
            >
              Bewaar als bron
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runSave(saveIntakeEventAction, forceNeeded)}
              className="h-11 rounded-full border border-border px-4 text-sm font-semibold hover:border-foreground disabled:opacity-60"
            >
              Maak event-kandidaat
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runSave(saveIntakeCombinedAction, forceNeeded)}
              className="h-11 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-60"
            >
              Bron + event voorbereiden
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setDismissed(true)}
              className="h-11 rounded-full px-4 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Niet relevant
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Geen directe publicatie vanaf intake. Screenshot wordt nooit public
            event image.
          </p>
        </section>
      ) : null}
    </div>
  );
}
