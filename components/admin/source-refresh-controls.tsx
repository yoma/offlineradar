"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  runSourceRefreshAction,
  type RefreshActionState,
} from "@/app/interne-events/refresh-actions";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";

const initial: RefreshActionState = { ok: false, message: "" };

export function SourceRefreshControls({
  catalogSourceId,
  supported,
  latestRun,
}: {
  catalogSourceId: string;
  supported: boolean;
  latestRun: SourceRefreshRunRecord | null;
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

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Source refresh
      </p>
      {latestRun ? (
        <p className="text-sm text-muted-foreground">
          Laatste controle:{" "}
          {latestRun.completedAt?.slice(0, 16).replace("T", " ") ??
            latestRun.startedAt.slice(0, 16).replace("T", " ")}{" "}
          · {latestRun.status}
          {latestRun.status === "completed" ? (
            <>
              {" "}
              · {latestRun.newCount} nieuw, {latestRun.changedCount} gewijzigd,{" "}
              {latestRun.unchangedCount} ongewijzigd, {latestRun.removedCount}{" "}
              verdwenen?
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Nog niet gecontroleerd.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <input type="hidden" name="catalogSourceId" value={catalogSourceId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[#e61e4d] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Bron wordt gecontroleerd..." : "Controleer bron"}
          </button>
        </form>
        {latestRun?.status === "completed" ? (
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
