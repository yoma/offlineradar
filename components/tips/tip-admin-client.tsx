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

  function sendMail(tipId: string, mailStatus: TipStatus) {
    startTransition(async () => {
      const data = await postAction({
        action: "send_status_mail",
        tipId,
        mailStatus,
      });
      if (!data) return;
      if (data.skipped === "already_sent") {
        setMessage("Statusmail was al gelogd (idempotent).");
      } else if (data.sent === true) {
        setMessage("Statusmail verstuurd.");
      } else {
        setMessage(
          "Mailprovider niet geconfigureerd — template klaar, niets verstuurd.",
        );
      }
      await refresh();
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Tipwachtrij
        </h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.tips.length} melding
          {snapshot.tips.length === 1 ? "" : "en"} · AI op jouw knop · concept-event
          na goedkeuring · publicatie via /interne-events · geen auto-live
        </p>
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
                  {tip.notifyRequested && tip.email ? (
                    <StatusButton
                      label="Verstuur statusmail"
                      onClick={() => sendMail(tip.id, tip.status)}
                    />
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
  if (!prep) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">AI-controle nog niet uitgevoerd</p>
        <p className="mt-1 text-muted-foreground">
          Start de controle hieronder. De AI publiceert of keurt nooit zelf goed.
        </p>
      </div>
    );
  }

  if (prep.scanError && !prep.routeSuggestion) {
    return (
      <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">AI-controle mislukt</p>
        <p className="mt-1 text-muted-foreground">{prep.scanError}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Vorige succesvolle resultaten blijven bewaard waar aanwezig. Probeer later opnieuw.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
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
          <h3 className="font-medium">AI-advies (geen goedkeuring)</h3>
          <p className="font-semibold">{ROUTE_LABEL[prep.routeSuggestion]}</p>
          {prep.routeReason ? (
            <p className="text-muted-foreground">{prep.routeReason}</p>
          ) : null}
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
          <Fact
            label="Leeftijd"
            value={
              prep.ageNotes
                ? `${prep.ageNotes}${prep.ageRule ? ` (${prep.ageRule})` : ""}`
                : null
            }
          />
          <Fact label="Prijs" value={prep.proposedPriceNotes ?? prep.priceNotes} />
          <Fact
            label="Singles only"
            value={
              prep.singlesOnly === "true"
                ? "true (deelnamevoorwaarde)"
                : prep.singlesOnly === "false"
                  ? "false"
                  : prep.singlesOnly === "unknown"
                    ? "unknown"
                    : null
            }
          />
          <Fact label="Beschikbaarheid" value={prep.availabilityNotes} />
          <Fact label="Ticketlink" value={prep.bookingUrl} />
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

      {prep.suggestSourceWatch ? (
        <section className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <h3 className="font-medium">Interessante bron voor opvolging</h3>
          <p className="text-muted-foreground">
            {prep.suggestSourceWatchReason ||
              "AI stelt voor deze organisator/reeks te bekijken. Niet automatisch toegevoegd."}
          </p>
        </section>
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
