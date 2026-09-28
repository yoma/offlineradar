import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addRefreshItemAsDraftAction,
  applyRefreshItemChangeAction,
  bulkAddRefreshDraftsAction,
  ignoreRefreshItemAction,
} from "@/app/interne-events/refresh-actions";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import {
  getRefreshPilot,
} from "@/lib/source-refresh/registry";
import {
  listRefreshItemsForRun,
} from "@/lib/source-refresh/store";
import { getEventsSql } from "@/lib/events/db";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";

async function getRun(id: string): Promise<SourceRefreshRunRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM source_refresh_runs WHERE id = ${id} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: String(row.id),
    catalogSourceId: String(row.catalog_source_id),
    status: row.status as SourceRefreshRunRecord["status"],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    fetchedUrl: row.fetched_url ? String(row.fetched_url) : null,
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    fetchState: row.fetch_state ? String(row.fetch_state) : null,
    parserKey: String(row.parser_key),
    parserVersion: String(row.parser_version),
    candidateCount: Number(row.candidate_count),
    newCount: Number(row.new_count),
    unchangedCount: Number(row.unchanged_count),
    changedCount: Number(row.changed_count),
    removedCount: Number(row.removed_count),
    error: row.error ? String(row.error) : null,
    triggeredBy: row.triggered_by ? String(row.triggered_by) : null,
    triggerType: row.trigger_type === "scheduled" ? "scheduled" : "manual",
    createdAt: String(row.created_at),
  };
}

export default async function RefreshRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    redirect("/interne-events");
  }
  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) notFound();
  const pilot = getRefreshPilot(run.catalogSourceId);
  const items = await listRefreshItemsForRun(runId);
  const reviewItems = items.filter(
    (i) =>
      i.detectionType !== "existing_unchanged" &&
      (i.status === "needs_review" ||
        i.status === "accepted" ||
        i.status === "applied" ||
        i.status === "ignored"),
  );
  const newItems = reviewItems.filter((i) => i.detectionType === "new");

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm">
        <Link href="/interne-events" className="underline-offset-4 hover:underline">
          ← Interne events
        </Link>
      </p>
      <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight">
        Refresh resultaten
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {pilot?.label ?? run.catalogSourceId} · parser {run.parserKey} v
        {run.parserVersion} · {run.status} ·{" "}
        {run.triggerType === "scheduled"
          ? "Automatische controle"
          : "Handmatige controle"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {run.newCount} nieuw · {run.changedCount} gewijzigd ·{" "}
        {run.unchangedCount} ongewijzigd · {run.removedCount} mogelijk verdwenen
      </p>
      {run.fetchedUrl ? (
        <p className="mt-1 break-all text-xs text-muted-foreground">
          {run.fetchedUrl}
        </p>
      ) : null}
      {run.error ? (
        <p className="mt-2 text-sm text-[#e61e4d]">{run.error}</p>
      ) : null}

      <p className="mt-6 text-sm text-muted-foreground">
        Geen automatische publicatie. Nieuwe items worden hoogstens draft.
      </p>

      {newItems.some((i) => i.status === "needs_review") ? (
        <form
          action={bulkAddRefreshDraftsAction}
          className="mt-4 rounded-xl border border-border px-4 py-3"
        >
          <p className="text-sm font-medium">
            Bulk: geselecteerde nieuwe edities als concept
          </p>
          <ul className="mt-2 space-y-1">
            {newItems
              .filter((i) => i.status === "needs_review")
              .map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="itemId"
                    value={item.id}
                    defaultChecked={false}
                  />
                  <span>
                    {item.detectedTitle} ·{" "}
                    {item.detectedStart?.slice(0, 16) ?? "?"}
                  </span>
                </li>
              ))}
          </ul>
          <button
            type="submit"
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm"
          >
            Voeg geselecteerde toe als concept
          </button>
        </form>
      ) : null}

      <ul className="mt-8 space-y-4">
        {reviewItems.map((item) => (
          <li
            key={item.id}
            className="min-w-0 rounded-xl border border-border bg-background px-4 py-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {item.detectionType === "new"
                ? "Nieuwe editie"
                : item.detectionType === "existing_changed"
                  ? "Wijziging gevonden"
                  : item.detectionType === "possibly_removed"
                    ? "Niet meer gevonden — controle nodig"
                    : "Ongewijzigd"}{" "}
              · {item.status}
            </p>
            <p className="mt-1 break-words font-semibold">
              {item.detectedTitle ?? "(zonder titel)"}
            </p>
            <p className="text-sm text-muted-foreground">
              {item.detectedStart?.slice(0, 16) ?? "—"} ·{" "}
              {item.detectedLocation ?? "—"}
              {item.detectedMinAge != null || item.detectedMaxAge != null
                ? ` · ${item.detectedMinAge ?? "?"}-${item.detectedMaxAge ?? "?"}j`
                : null}
              {item.detectedPrice != null ? ` · €${item.detectedPrice}` : null}
            </p>
            {item.detectedSourceUrl ? (
              <a
                href={item.detectedSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block break-all text-xs underline-offset-4 hover:underline"
              >
                {item.detectedSourceUrl}
              </a>
            ) : null}
            {item.changeSummary && item.changeSummary.length > 0 ? (
              <ul className="mt-2 space-y-1 break-words text-sm">
                {item.changeSummary.map((change) => (
                  <li key={`${item.id}-${change.field}`} className="min-w-0">
                    <span className="font-medium">{change.field}:</span>{" "}
                    <span className="text-muted-foreground">
                      {String(change.before ?? "—")}
                    </span>{" "}
                    →{" "}
                    <span>{String(change.after ?? "—")}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {item.status === "needs_review" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.detectionType === "new" ? (
                  <form action={addRefreshItemAsDraftAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
                    >
                      Voeg toe als concept
                    </button>
                  </form>
                ) : null}
                {item.detectionType === "existing_changed" ? (
                  <form action={applyRefreshItemChangeAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
                    >
                      Pas wijziging toe
                    </button>
                  </form>
                ) : null}
                <form action={ignoreRefreshItemAction}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    Negeer
                  </button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {reviewItems.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Geen reviewbare items (alles ongewijzigd of leeg).
        </p>
      ) : null}
    </div>
  );
}
