"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  TIP_STATUSES,
  TIP_STATUS_LABEL,
  type TipAiPrep,
  type TipRouteSuggestion,
  type TipStatus,
  type TipsStoreSnapshot,
} from "@/types/tips";

const ROUTE_LABEL: Record<TipRouteSuggestion, string> = {
  route_a_supported: "Route A waarschijnlijk ondersteund",
  route_b_supported: "Route B waarschijnlijk ondersteund",
  insufficient_evidence: "Onvoldoende bewijs",
  not_eligible: "Waarschijnlijk niet geschikt",
  needs_manual_review: "Handmatige controle nodig",
};

export function TipAdminClient({ initial }: { initial: TipsStoreSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reviewsByTip = useMemo(() => {
    const map = new Map(snapshot.reviews.map((review) => [review.tipId, review]));
    return map;
  }, [snapshot.reviews]);

  async function refresh() {
    const response = await fetch("/api/tips/admin");
    if (!response.ok) {
      setError("Kon de wachtrij niet vernieuwen.");
      return;
    }
    const data = (await response.json()) as TipsStoreSnapshot;
    setSnapshot(data);
  }

  async function setStatus(tipId: string, status: TipStatus, reason: string) {
    setError("");
    setMessage("");
    const response = await fetch("/api/tips/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipId,
        status,
        decisionReason: reason || null,
      }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      setError(data.error || "Statuswijziging mislukt.");
      return;
    }
    setMessage(
      status === "published"
        ? "Tip gemarkeerd als published (gekoppeld event staat live)."
        : status === "approved_for_publication"
          ? "Goedgekeurd voor publicatie. Maak daarna een concept-event."
          : status === "in_review"
            ? "In controle gezet."
            : "Status bijgewerkt.",
    );
    await refresh();
  }

  async function postAction(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    setError("");
    setMessage("");
    const response = await fetch("/api/tips/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok || data.ok !== true) {
      if (data.code === "duplicate_candidates" && Array.isArray(data.duplicates)) {
        const lines = (
          data.duplicates as Array<{ title: string; slug: string; matchReason: string }>
        )
          .slice(0, 5)
          .map((d) => `- ${d.title} (${d.slug}): ${d.matchReason}`)
          .join("\n");
        const force = window.confirm(
          `${String(data.error || "Mogelijk bestaand event")}\n\n${lines}\n\nToch nieuw concept maken?`,
        );
        if (force) {
          return postAction({ ...body, forceCreate: true });
        }
      }
      setError(String(data.error || "Actie mislukt."));
      await refresh();
      return null;
    }
    return data;
  }

  function startAiScan(tipId: string) {
    setScanningId(tipId);
    startTransition(async () => {
      try {
        const data = await postAction({ action: "start_ai_scan", tipId });
        if (!data) return;
        setMessage(
          data.reused
            ? "AI-controle hergebruikt (zelfde bron/hash). Geen nieuwe betaalde call."
            : "AI-controle voltooid. Advies opgeslagen; jij beslist.",
        );
        await refresh();
      } finally {
        setScanningId(null);
      }
    });
  }

  function createConcept(tipId: string) {
    startTransition(async () => {
      const data = await postAction({ action: "create_concept_event", tipId });
      if (!data) return;
      setMessage(
        `Concept-event aangemaakt (${String(data.slug)}). Review/publicatie via /interne-events.`,
      );
      await refresh();
    });
  }

  function addWatch(tipId: string) {
    startTransition(async () => {
      const data = await postAction({ action: "add_source_watch", tipId });
      if (!data) return;
      setMessage("Bron toegevoegd aan tip-watchlist (geen auto-monitoring).");
      await refresh();
    });
  }

  function canSendStatusMail(status: TipStatus): boolean {
    return (
      status === "rejected" ||
      status === "needs_info" ||
      status === "approved_for_publication" ||
      status === "published"
    );
  }

  function previewAndSendMail(tipId: string, mailStatus: TipStatus) {
    startTransition(async () => {
      const previewData = await postAction({
        action: "preview_status_mail",
        tipId,
        mailStatus,
      });
      if (!previewData) return;
      const preview = previewData.preview as
        | {
            kind?: string;
            subject?: string;
            toMasked?: string;
            bodyPreview?: string;
            alreadySent?: boolean;
          }
        | undefined;
      if (!preview) {
        setError("Kon mailpreview niet laden.");
        return;
      }
      if (preview.alreadySent) {
        setMessage(
          `Statusmail (${preview.kind}) was al verzonden naar ${preview.toMasked}.`,
        );
        return;
      }
      const confirmSend = window.confirm(
        `Statusmail versturen?\n\nType: ${preview.kind}\nAan: ${preview.toMasked}\nOnderwerp: ${preview.subject}\n\n${preview.bodyPreview}`,
      );
      if (!confirmSend) {
        setMessage("Verzenden geannuleerd.");
        return;
      }
      const data = await postAction({
        action: "send_status_mail",
        tipId,
        mailStatus,
      });
      if (!data) return;
      if (data.skipped === "already_sent") {
        setMessage("Statusmail was al gelogd (idempotent).");
      } else if (data.sent === true) {
        setMessage(`Statusmail verstuurd naar ${String(preview.toMasked)}.`);
      } else {
        setMessage("Geen mail verstuurd.");
      }
      await refresh();
    });
  }

  function clearContactEmail(tipId: string) {
    startTransition(async () => {
      const ok = window.confirm(
        "Contactmail wissen? De tip blijft bestaan voor audit/dedupe.",
      );
      if (!ok) return;
      const data = await postAction({ action: "clear_contact_email", tipId });
      if (!data) return;
      setMessage("Contactmail gewist.");
      await refresh();
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Tips
        </h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.tips.length} tip{snapshot.tips.length === 1 ? "" : "s"} · AI
          scant → dezelfde publicatiegate · jouw aandacht alleen bij twijfel
        </p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[
            {
              label: "Jouw aandacht nodig",
              n: snapshot.tips.filter((t) =>
                ["received", "in_review", "needs_info", "duplicate"].includes(
                  t.status,
                ),
              ).length,
            },
            {
              label: "Toegevoegd",
              n: snapshot.tips.filter((t) => t.status === "published").length,
            },
            {
              label: "Niet toegevoegd",
              n: snapshot.tips.filter((t) =>
                ["rejected", "expired_or_cancelled"].includes(t.status),
              ).length,
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2"
            >
              <p className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
                {c.label}
              </p>
              <p className="text-xl font-semibold text-stone-900">{c.n}</p>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {snapshot.tips.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen tips ontvangen.</p>
      ) : (
        <ul className="space-y-4">
          {snapshot.tips.map((tip) => {
            const review = reviewsByTip.get(tip.id);
            const prep = review?.aiPrep ?? null;
            const hasAiAdvice = Boolean(prep?.routeSuggestion && !prep.scanError);
            const scanning = scanningId === tip.id || (isPending && scanningId === tip.id);
            return (
              <li
                key={tip.id}
                className="rounded-2xl border border-border bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      {TIP_STATUS_LABEL[tip.status]} ·{" "}
                      {new Date(tip.receivedAt).toLocaleString("nl-BE")}
                    </p>
                    <a
                      href={tip.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-[15px] font-semibold underline-offset-4 hover:underline"
                    >
                      {tip.originalUrl}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      genormaliseerd: {tip.normalizedUrl}
                    </p>
                  </div>
                </div>

                {tip.note ? (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Toelichting: {tip.note}
                  </p>
                ) : null}

                {tip.duplicateNotes.length > 0 ? (
                  <div className="mt-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Extra notities van latere tips
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {tip.duplicateNotes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <AiPrepPanel
                  tipUrl={tip.originalUrl}
                  sourceUrlChecked={review?.sourceUrlChecked ?? null}
                  checkedAt={review?.checkedAt ?? null}
                  prep={prep}
                />

                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Terugkoppeling</dt>
                    <dd>
                      {tip.notifyRequested
                        ? `Ja (${tip.email ?? "e-mail ontbreekt"})`
                        : "Nee (geen e-mail bewaard)"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Menselijke beslissing</dt>
                    <dd>
                      {review?.adminDecision
                        ? `${TIP_STATUS_LABEL[review.adminDecision]}${
                            review.decisionReason
                              ? ` · ${review.decisionReason}`
                              : ""
                          }`
                        : "Nog geen beheerderbeslissing"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Eventkoppeling</dt>
                    <dd>
                      {tip.linkedEventId ? (
                        <span>
                          Gekoppeld ·{" "}
                          <a
                            href="/interne-events"
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            Bekijk concept-event
                          </a>
                        </span>
                      ) : tip.status === "approved_for_publication" ? (
                        "Nog geen concept-event"
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Publicatie</dt>
                    <dd>
                      {tip.status === "published"
                        ? "Tip published (gekoppeld event live)"
                        : tip.status === "approved_for_publication"
                          ? "Goedgekeurd, nog niet published"
                          : "Nog niet goedgekeurd voor publicatie"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className="h-9 rounded-full px-3 text-sm"
                    disabled={scanning}
                    onClick={() => startAiScan(tip.id)}
                  >
                    {scanning
                      ? "AI-controle bezig…"
                      : hasAiAdvice
                        ? "Opnieuw AI-controle"
                        : "Start AI-controle"}
                  </Button>
                  {tip.status === "received" ||
                  tip.status === "duplicate" ||
                  tip.status === "needs_info" ? (
                    <StatusButton
                      label="In controle"
                      onClick={() => setStatus(tip.id, "in_review", "")}
                    />
                  ) : null}
                  {tip.status !== "rejected" &&
                  tip.status !== "published" &&
                  tip.status !== "expired_or_cancelled" ? (
                    <StatusButton
                      label="Extra info nodig"
                      onClick={() =>
                        setStatus(
                          tip.id,
                          "needs_info",
                          "Officiële bron onvolledig of onbereikbaar.",
                        )
                      }
                    />
                  ) : null}
                  {tip.status !== "rejected" &&
                  tip.status !== "published" &&
                  tip.status !== "expired_or_cancelled" ? (
                    <StatusButton
                      label="Afwijzen"
                      onClick={() =>
                        setStatus(
                          tip.id,
                          "rejected",
                          "De activiteit is niet aantoonbaar singlesgericht volgens Route A/B.",
                        )
                      }
                    />
                  ) : null}
                  {tip.status !== "approved_for_publication" &&
                  tip.status !== "published" &&
                  tip.status !== "rejected" &&
                  tip.status !== "expired_or_cancelled" ? (
                    <StatusButton
                      label="Goedkeuren (nog niet publiceren)"
                      onClick={() =>
                        setStatus(
                          tip.id,
                          "approved_for_publication",
                          "Route A/B voldoende; concept-event volgt apart.",
                        )
                      }
                    />
                  ) : null}
                  {tip.status === "approved_for_publication" &&
                  !tip.linkedEventId ? (
                    <Button
                      type="button"
                      className="h-9 rounded-full px-3 text-sm"
                      disabled={isPending}
                      onClick={() => createConcept(tip.id)}
                    >
                      Maak concept-event
                    </Button>
                  ) : null}
                  {tip.linkedEventId ? (
                    <a
                      href="/interne-events"
                      className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm font-medium hover:bg-muted"
                    >
                      Bekijk event
                    </a>
                  ) : null}
                  {tip.status === "approved_for_publication" ||
                  tip.status === "published" ||
                  hasAiAdvice ? (
                    <StatusButton
                      label="Voeg bron toe aan watchlist"
                      onClick={() => addWatch(tip.id)}
                    />
                  ) : null}
                  {tip.notifyRequested ? (
                    <div className="w-full space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Notificatie aangevraagd</p>
                      <p className="text-muted-foreground">
                        {tip.email
                          ? "Contactmail bewaard (opt-in)."
                          : "Contactmail al gewist; tip blijft voor audit."}
                      </p>
                      {review?.emailSentForStatuses?.length ? (
                        <p className="text-muted-foreground">
                          Laatste statusmail(s):{" "}
                          {review.emailSentForStatuses
                            .map((s) => TIP_STATUS_LABEL[s] ?? s)
                            .join(" · ")}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Nog geen statusmail verzonden.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {tip.email && canSendStatusMail(tip.status) ? (
                          <StatusButton
                            label="Verstuur statusmail"
                            onClick={() =>
                              previewAndSendMail(tip.id, tip.status)
                            }
                          />
                        ) : null}
                        {tip.email ? (
                          <StatusButton
                            label="Verwijder contactmail"
                            onClick={() => clearContactEmail(tip.id)}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {tip.status === "approved_for_publication" && tip.linkedEventId ? (
                    <StatusButton
                      label="Markeer tip published"
                      onClick={() =>
                        setStatus(
                          tip.id,
                          "published",
                          "Gekoppeld event is published.",
                        )
                      }
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Statussen: {TIP_STATUSES.map((s) => TIP_STATUS_LABEL[s]).join(" · ")}
      </p>
    </div>
  );
}

function AiPrepPanel({
  tipUrl,
  sourceUrlChecked,
  checkedAt,
  prep,
}: {
  tipUrl: string;
  sourceUrlChecked: string | null;
  checkedAt: string | null;
  prep: TipAiPrep | null;
}) {
  const [open, setOpen] = useState(false);

  if (!prep) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Nog geen AI-scan</p>
        <p className="mt-1 text-muted-foreground">
          Start AI-controle. Resultaat: Toegevoegd, aandacht nodig, of niet
          toegevoegd.
        </p>
      </div>
    );
  }

  if (prep.scanError && !prep.routeSuggestion) {
    return (
      <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">⚠ Jouw aandacht nodig</p>
        <p className="mt-1 text-muted-foreground">{prep.scanError}</p>
      </div>
    );
  }

  const humanBadge =
    prep.routeSuggestion === "not_eligible"
      ? "✕ Niet toegevoegd"
      : prep.routeSuggestion === "needs_manual_review" ||
          prep.routeSuggestion === "insufficient_evidence"
        ? "⚠ Jouw aandacht nodig"
        : prep.proposedTitle
          ? "AI-voorstel klaar"
          : "⚠ Jouw aandacht nodig";

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
        <p className="text-sm font-bold text-stone-900">{humanBadge}</p>
        {prep.proposedTitle ? (
          <p className="mt-1 text-[15px] font-semibold text-stone-900">
            {prep.proposedTitle}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-stone-600">
          {[prep.proposedStartDate, prep.proposedCity, prep.proposedOrganizer]
            .filter(Boolean)
            .join(" · ") || "Gegevens onvolledig"}
        </p>
        {prep.routeReason ? (
          <p className="mt-2 text-sm font-medium text-amber-900">
            {prep.routeReason}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className="text-xs font-medium text-stone-500 underline-offset-4 hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Verberg AI-details" : "Bekijk AI-details"}
      </button>

      {open ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
          <section className="space-y-1">
            <h3 className="font-medium">Bron</h3>
            <p className="break-all text-muted-foreground">Ingestuurd: {tipUrl}</p>
            {sourceUrlChecked ? (
              <p className="break-all text-muted-foreground">
                Gecontroleerd: {sourceUrlChecked}
              </p>
            ) : null}
            {prep.sourceUrlsUsed.length > 0 ? (
              <p className="break-all text-muted-foreground">
                Gebruikte bronnen: {prep.sourceUrlsUsed.join(" · ")}
              </p>
            ) : null}
            {checkedAt || prep.preparedAt ? (
              <p className="text-muted-foreground">
                Gecontroleerd op{" "}
                {new Date(checkedAt ?? prep.preparedAt).toLocaleString("nl-BE")}
                {prep.reusedFromTipId ? " · hergebruikt resultaat" : ""}
                {prep.modelHint ? ` · ${prep.modelHint}` : ""}
              </p>
            ) : null}
          </section>

          {prep.routeSuggestion ? (
            <section className="space-y-1">
              <h3 className="font-medium">Route / confidence</h3>
              <p className="font-semibold">{ROUTE_LABEL[prep.routeSuggestion]}</p>
              {prep.confidence ? (
                <p className="text-muted-foreground">
                  Zekerheid: {prep.confidence}
                  {prep.singlesEvidence ? ` · ${prep.singlesEvidence}` : ""}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-1">
            <h3 className="font-medium">Gevonden eventgegevens</h3>
            <ul className="grid gap-1 text-muted-foreground sm:grid-cols-2">
              <Fact label="Titel" value={prep.proposedTitle} />
              <Fact label="Organisator" value={prep.proposedOrganizer} />
              <Fact label="Datum" value={prep.proposedStartDate} />
              <Fact
                label="Tijd"
                value={
                  prep.proposedStartTime
                    ? `${prep.proposedStartTime}${
                        prep.proposedEndTime ? `–${prep.proposedEndTime}` : ""
                      }`
                    : null
                }
              />
              <Fact label="Locatie" value={prep.proposedVenue} />
              <Fact label="Gemeente" value={prep.proposedCity} />
              <Fact label="Prijs" value={prep.proposedPriceNotes ?? prep.priceNotes} />
            </ul>
          </section>

          {(prep.gaps.length > 0 || prep.conflicts.length > 0) && (
            <section className="space-y-1">
              <h3 className="font-medium">Onzekerheden</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {[...prep.gaps, ...prep.conflicts].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <li>
      <span className="text-foreground">{label}:</span>{" "}
      {value?.trim() ? value : "niet bevestigd"}
    </li>
  );
}

function StatusButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 rounded-full px-3 text-sm"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
