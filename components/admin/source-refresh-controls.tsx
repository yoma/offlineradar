"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  runSourceRefreshAction,
  setSourceScheduledRefreshAction,
  type RefreshActionState,
} from "@/app/interne-events/refresh-actions";
import type { SourceScheduleState } from "@/lib/source-refresh/store";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";

const initial: RefreshActionState = { ok: false, message: "" };

function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return "onbekend";
  return iso.slice(0, 16).replace("T", " ");
}

export function SourceRefreshControls({
  catalogSourceId,
  supported,
  latestRun,
  schedule,
  nextRefreshAt,
  consecutiveFailures,
}: {
  catalogSourceId: string;
  supported: boolean;
  latestRun: SourceRefreshRunRecord | null;
  schedule?: SourceScheduleState | null;
  nextRefreshAt?: string | null;
  consecutiveFailures?: number;
}) {
  const [state, action, pending] = useActionState(
    runSourceRefreshAction,
    initial,
  );

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Refresh V1 nog niet beschikbaar voor deze bron.
      </p>
    );
  }

  const activeLocked =
    latestRun?.status === "pending" || latestRun?.status === "running";
  const triggerLabel =
    latestRun?.triggerType === "scheduled"
      ? "Automatische controle"
      : latestRun
        ? "Handmatige controle"
        : null;
  const lastAttemptAt = latestRun?.completedAt ?? latestRun?.startedAt ?? null;
  const lastSuccessAt =
    schedule?.lastCheckedAt ??
    (latestRun?.status === "completed" &&
    latestRun.fetchState === "ok" &&
    !latestRun.error
      ? latestRun.completedAt
      : null);

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Source refresh
      </p>
      {latestRun ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Laatste poging: {fmtStamp(lastAttemptAt)} · {latestRun.status}
            {triggerLabel ? ` · ${triggerLabel}` : null}
          </p>
          <p>
            Laatste succesvolle controle: {fmtStamp(lastSuccessAt)}
          </p>
          {latestRun.status === "completed" ? (
            <p>
              {latestRun.newCount} nieuw, {latestRun.changedCount} gewijzigd,{" "}
              {latestRun.unchangedCount} ongewijzigd, {latestRun.removedCount}{" "}
              verdwenen?
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nog niet gecontroleerd.</p>
      )}
      {schedule ? (
        <p className="text-sm text-muted-foreground">
          Scheduled: {schedule.refreshEnabled ? "aan" : "uit"}
          {schedule.refreshIntervalHours != null
            ? ` · elke ${schedule.refreshIntervalHours}u`
            : null}
          {" · "}
          laatste auto-poging: {fmtStamp(schedule.lastScheduledRefreshAt)}
          {" · "}
          volgende: {fmtStamp(nextRefreshAt)}
          {consecutiveFailures && consecutiveFailures > 0
            ? ` · ${consecutiveFailures}× fout op rij`
            : null}
        </p>
      ) : null}
      {activeLocked ? (
        <p className="text-sm text-[#e61e4d]">
          Er loopt al een refresh voor deze bron (handmatig of scheduled).
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <input type="hidden" name="catalogSourceId" value={catalogSourceId} />
          <button
            type="submit"
            disabled={pending || activeLocked}
            className="rounded-md bg-[#e61e4d] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Bron wordt gecontroleerd..." : "Controleer bron"}
          </button>
        </form>
        {schedule ? (
          <form action={setSourceScheduledRefreshAction}>
            <input type="hidden" name="catalogSourceId" value={catalogSourceId} />
            <input
              type="hidden"
              name="refreshEnabled"
              value={schedule.refreshEnabled ? "0" : "1"}
            />
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              {schedule.refreshEnabled ? "Scheduled uit" : "Scheduled aan"}
            </button>
          </form>
        ) : null}
        {latestRun?.status === "completed" || latestRun?.status === "failed" ? (
          <Link
            href={`/interne-events/refresh/${latestRun.id}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            Bekijk resultaten
          </Link>
        ) : null}
        {(state.runId || (state.ok && state.runId)) && state.message ? (
          <Link
            href={`/interne-events/refresh/${state.runId}`}
            className="text-sm underline-offset-4 hover:underline"
          >
            Open run
          </Link>
        ) : null}
      </div>
      {state.message ? (
        <p
          className={`text-sm ${state.ok ? "text-foreground" : "text-[#e61e4d]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
