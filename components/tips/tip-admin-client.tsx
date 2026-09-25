"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  TIP_STATUSES,
  TIP_STATUS_LABEL,
  type TipStatus,
  type TipsStoreSnapshot,
} from "@/types/tips";

export function TipAdminClient({ initial }: { initial: TipsStoreSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
        publishedEventPath:
          status === "published" ? "/ontdek" : null,
      }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      setError(data.error || "Statuswijziging mislukt.");
      return;
    }
    setMessage(
      status === "published"
        ? "Status gezet op Gepubliceerd (expliciete beheerderstap). Geen auto-publicatie van echte events."
        : status === "approved_for_publication"
          ? "Goedgekeurd voor publicatie. Nog niet publiek tot je Gepubliceerd kiest."
          : "Status bijgewerkt.",
    );
    await refresh();
  }

  return (
    <div className="mt-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Tipwachtrij
        </h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.tips.length} melding
          {snapshot.tips.length === 1 ? "" : "en"} · AI-controle nog niet
          geactiveerd · publicatie nooit automatisch
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
                    <dt className="text-muted-foreground">AI-prep</dt>
                    <dd>
                      {review?.aiPrep
                        ? "Beschikbaar"
                        : "Nog niet gestart (geen automatische aanroep)"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Beslissing</dt>
                    <dd>
                      {review?.decisionReason ||
                        "Nog geen beheerderreden vastgelegd"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Publicatie</dt>
                    <dd>
                      {tip.status === "published"
                        ? `Gepubliceerd ${review?.publishedAt ?? ""}`
                        : tip.status === "approved_for_publication"
                          ? "Goedgekeurd, nog niet gepubliceerd"
                          : "Nog niet goedgekeurd voor publicatie"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusButton
                    label="In controle"
                    onClick={() => setStatus(tip.id, "in_review", "")}
                  />
                  <StatusButton
                    label="Extra info"
                    onClick={() =>
                      setStatus(
                        tip.id,
                        "needs_info",
                        "Officiële bron onvolledig of onbereikbaar.",
                      )
                    }
                  />
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
                  <StatusButton
                    label="Goedkeuren (nog niet publiceren)"
                    onClick={() =>
                      setStatus(
                        tip.id,
                        "approved_for_publication",
                        "Route A/B voldoende; publicatie volgt apart.",
                      )
                    }
                  />
                  <StatusButton
                    label="Publiceren"
                    onClick={() =>
                      setStatus(
                        tip.id,
                        "published",
                        "Expliciete publicatiestap door beheerder (lokale test).",
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full px-3 text-sm"
                    disabled
                    title="AI-controle nog niet geactiveerd"
                  >
                    Start AI-controle (nog niet actief)
                  </Button>
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
