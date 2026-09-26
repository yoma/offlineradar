import type { ReactNode } from "react";
import {
  signOutEventsAdmin,
  startEventsAdminSignIn,
  takeEventOfflineAction,
  addCatalogSourceAction,
  updateCatalogSourceAction,
  updateEventReportsAction,
} from "@/app/interne-events/actions";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
import { listEditionBundlesForAdmin } from "@/lib/events/neon-store";
import { listCatalogSources } from "@/lib/events/catalog-sources";
import {
  countOpenReportsByEditionIds,
  listEventReportSummaries,
} from "@/lib/events/reports";
import { assertOfflineRadarDbConfig } from "@/lib/events/db";

export const dynamic = "force-dynamic";

function GateShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
      <div className="space-y-4 rounded-xl border border-border bg-background px-5 py-6">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Minimal canonical event admin + Source Map.
 * Soft unpublish only: published → under_review.
 */
export default async function InterneEventsPage() {
  const db = assertOfflineRadarDbConfig();
  if (!db.ok) {
    return (
      <GateShell title="Eventbeheer niet beschikbaar">
        <p>Databaseconfiguratie ontbreekt of is ongeldig.</p>
      </GateShell>
    );
  }

  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    if (access.reason === "forbidden") {
      return (
        <GateShell title="Geen beheerrechten">
          <p>Dit Google-account staat niet op de beheerderslijst.</p>
          <form action={signOutEventsAdmin}>
            <button
              type="submit"
              className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
            >
              Uitloggen
            </button>
          </form>
        </GateShell>
      );
    }
    const authReady = isGoogleAuthConfigured();
    return (
      <GateShell title="Beheerder login vereist">
        <p>Alleen toegelaten beheerders mogen canonical events beheren.</p>
        {authReady ? (
          <form action={startEventsAdminSignIn}>
            <button
              type="submit"
              className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
            >
              Inloggen met Google
            </button>
          </form>
        ) : (
          <p>Google OAuth is nog niet geconfigureerd.</p>
        )}
      </GateShell>
    );
  }

  const bundles = await listEditionBundlesForAdmin(80);
  if (!bundles) {
    return (
      <GateShell title="Eventbeheer niet beschikbaar">
        <p>Catalogus kon niet worden gelezen.</p>
      </GateShell>
    );
  }

  let catalogSources: Awaited<ReturnType<typeof listCatalogSources>> = [];
  try {
    catalogSources = await listCatalogSources();
  } catch {
    catalogSources = [];
  }

  let reportSummaries: Awaited<ReturnType<typeof listEventReportSummaries>> = [];
  let openByEdition = new Map<string, number>();
  try {
    reportSummaries = await listEventReportSummaries();
    openByEdition = await countOpenReportsByEditionIds(
      bundles.map((b) => b.edition.id),
    );
  } catch {
    reportSummaries = [];
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Canonical events
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Soft offline: published → under_review. Geen hard delete.
          </p>
        </div>
        <form action={signOutEventsAdmin}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Uitloggen
          </button>
        </form>
      </div>

      <section className="mb-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Bronnen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated Source Map voor handmatige batches. Geen crawler.
          </p>
        </div>

        <form
          action={addCatalogSourceAction}
          className="space-y-3 rounded-xl border border-border bg-background px-4 py-4"
        >
          <p className="text-sm font-medium">Bron toevoegen</p>
          <input
            name="name"
            required
            placeholder="Naam"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            name="officialUrl"
            required
            type="url"
            placeholder="https://"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="regions"
              placeholder="Regio's (komma)"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              name="formats"
              placeholder="Formats (komma)"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <select
            name="status"
            defaultValue="promising"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="active">active</option>
            <option value="promising">promising</option>
            <option value="low_yield">low_yield</option>
            <option value="inactive">inactive</option>
          </select>
          <textarea
            name="notes"
            placeholder="Notities"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
          >
            Opslaan
          </button>
        </form>

        <ul className="space-y-3">
          {catalogSources.map((source) => (
            <li
              key={source.id}
              className="rounded-xl border border-border bg-background px-4 py-4"
            >
              <div className="space-y-2">
                <p className="font-semibold">{source.name}</p>
                <p className="text-xs text-muted-foreground">
                  {source.sourceKind} · {source.sourceType} · {source.status}
                  {source.editionCount != null
                    ? ` · ${source.editionCount} editions`
                    : null}
                </p>
                <a
                  href={source.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium underline-offset-4 hover:underline"
                >
                  {source.officialUrl}
                </a>
                <p className="text-sm text-muted-foreground">
                  Regio: {source.regions.join(", ") || "—"} · Formats:{" "}
                  {source.formats.join(", ") || "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Laatst gecontroleerd:{" "}
                  {source.lastCheckedAt?.slice(0, 16) ?? "onbekend"}
                </p>
                {source.notes ? (
                  <p className="text-sm text-muted-foreground">{source.notes}</p>
                ) : null}
                <form
                  action={updateCatalogSourceAction}
                  className="flex flex-wrap items-end gap-2 pt-1"
                >
                  <input type="hidden" name="sourceId" value={source.id} />
                  <select
                    name="status"
                    defaultValue={source.status}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="active">active</option>
                    <option value="promising">promising</option>
                    <option value="low_yield">low_yield</option>
                    <option value="inactive">inactive</option>
                  </select>
                  <input
                    name="notes"
                    defaultValue={source.notes ?? ""}
                    placeholder="Note"
                    className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" name="touchChecked" value="1" />
                    checked_at nu
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    Update
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Meldingen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publieke signalen “mogelijk geen singlesevent”. Nooit auto-offline.
          </p>
        </div>
        {reportSummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen meldingen.</p>
        ) : (
          <ul className="space-y-3">
            {reportSummaries.map((summary) => (
              <li
                key={summary.eventEditionId}
                id={`meldingen-${summary.eventEditionId}`}
                className="rounded-xl border border-border bg-background px-4 py-4"
              >
                <div className="space-y-2">
                  <p className="font-semibold">{summary.title}</p>
                  <p className="text-xs text-muted-foreground">{summary.slug}</p>
                  <p className="text-sm">
                    {summary.openCount > 0
                      ? `${summary.openCount}× mogelijk geen singlesevent (open)`
                      : "Geen open meldingen"}
                    {` · ${summary.totalCount} totaal`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Status event: <strong>{summary.publicationStatus}</strong>
                    {" · "}
                    Route: {summary.eligibilityRoute ?? "—"}
                    {" · "}
                    singlesOnly:{" "}
                    {summary.singlesOnly == null
                      ? "—"
                      : summary.singlesOnly
                        ? "true"
                        : "false"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {summary.city ?? "—"} · Eerste:{" "}
                    {summary.firstReportAt?.slice(0, 16) ?? "—"} · Laatste:{" "}
                    {summary.lastReportAt?.slice(0, 16) ?? "—"}
                  </p>
                  {summary.primarySourceUrl ? (
                    <a
                      href={summary.primarySourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Bron: {summary.primarySourceUrl}
                    </a>
                  ) : null}
                  {summary.openCount > 0 ? (
                    <form
                      action={updateEventReportsAction}
                      className="flex flex-wrap items-end gap-2 pt-1"
                    >
                      <input
                        type="hidden"
                        name="editionId"
                        value={summary.eventEditionId}
                      />
                      <select
                        name="status"
                        defaultValue="reviewing"
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="reviewing">In controle</option>
                        <option value="confirmed">Bevestigd (terecht)</option>
                        <option value="dismissed">Onterecht</option>
                        <option value="resolved">Afgehandeld</option>
                      </select>
                      <input
                        name="resolutionNote"
                        placeholder="Note (optioneel)"
                        className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-border px-3 py-1.5 text-sm"
                      >
                        Update open meldingen
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-4 text-lg font-semibold tracking-tight">Events</h2>
      <ul className="space-y-4">
        {bundles.map((bundle) => {
          const { edition } = bundle;
          const primary =
            bundle.sources.find((s) => s.isPrimary) ?? bundle.sources[0];
          const openReports = openByEdition.get(edition.id) ?? 0;
          return (
            <li
              key={edition.id}
              className="rounded-xl border border-border bg-background px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{edition.title}</p>
                  <p className="text-xs text-muted-foreground">{edition.slug}</p>
                  <p className="text-sm">
                    Status: <strong>{edition.publicationStatus}</strong>
                    {edition.publishedAt
                      ? ` · published ${edition.publishedAt.slice(0, 10)}`
                      : null}
                  </p>
                  {openReports > 0 ? (
                    <p className="text-sm">
                      <a
                        href={`#meldingen-${edition.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {openReports}× mogelijk geen singlesevent
                      </a>
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {edition.city} · Laatst gecontroleerd:{" "}
                    {edition.lastCheckedAt?.slice(0, 16) ?? "onbekend"}
                  </p>
                  {primary ? (
                    <a
                      href={primary.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Bron: {primary.sourceName ?? primary.sourceType}
                    </a>
                  ) : null}
                </div>
                {edition.publicationStatus === "published" ? (
                  <form action={takeEventOfflineAction}>
                    <input type="hidden" name="editionId" value={edition.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
                    >
                      Haal offline
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}      </ul>
    </div>
  );
}
