import type { ReactNode } from "react";
import {
  signOutEventsAdmin,
  startEventsAdminSignIn,
  takeEventOfflineAction,
  publishEventAction,
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
import { CatalogSourcesBrowser } from "@/components/admin/catalog-sources-browser";
import { EventsAdminBrowser } from "@/components/admin/events-admin-browser";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { InterneAdminShell } from "@/components/admin/interne-admin-shell";
import {
  isRefreshSupported,
  REFRESH_PILOTS,
  getRefreshPilot,
} from "@/lib/source-refresh/registry";
import { computeNextRefreshAtIso } from "@/lib/source-refresh/scheduler";
import { isScheduledRefreshGloballyEnabled } from "@/lib/source-refresh/schedule-config";
import {
  countConsecutiveRefreshFailuresBatch,
  countOpenRefreshReviewItems,
  getSourceScheduleStates,
  listLatestRunsBySourceIds,
  type SourceScheduleState,
} from "@/lib/source-refresh/store";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";
import { countBetaFeedbackByStatus } from "@/lib/feedback/store";

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
 * Human override: Van DateOfflineHub halen → rejected + manual_suppressed.
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

  let refreshRuns = new Map<string, SourceRefreshRunRecord>();
  let scheduleStates = new Map<string, SourceScheduleState>();
  let consecutiveFailures = new Map<string, number>();
  let openRefreshReviews = 0;
  try {
    const pilotIds = REFRESH_PILOTS.map((p) => p.catalogSourceId);
    const [runs, schedules, failures, openReviews] = await Promise.all([
      listLatestRunsBySourceIds(pilotIds),
      getSourceScheduleStates(pilotIds),
      countConsecutiveRefreshFailuresBatch(pilotIds),
      countOpenRefreshReviewItems().catch(() => 0),
    ]);
    refreshRuns = runs;
    scheduleStates = schedules;
    consecutiveFailures = failures;
    openRefreshReviews = openReviews;
  } catch {
    refreshRuns = new Map();
    scheduleStates = new Map();
    consecutiveFailures = new Map();
    openRefreshReviews = 0;
  }
  const scheduledGlobalOn = isScheduledRefreshGloballyEnabled();

  const refreshBySourceId = Object.fromEntries(
    catalogSources.map((source) => {
      const schedule = scheduleStates.get(source.id) ?? null;
      const run = refreshRuns.get(source.id) ?? null;
      return [
        source.id,
        {
          supported: isRefreshSupported(source.id),
          // Never ship report_json to the client (can be huge → page crash).
          latestRun: run
            ? {
                id: run.id,
                status: run.status,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                fetchState: run.fetchState,
                error: run.error,
                triggerType: run.triggerType,
                newCount: run.newCount,
                changedCount: run.changedCount,
                unchangedCount: run.unchangedCount,
                removedCount: run.removedCount,
              }
            : null,
          schedule,
          nextRefreshAt: computeNextRefreshAtIso(
            schedule,
            getRefreshPilot(source.id)?.parserKey,
          ),
          consecutiveFailures: consecutiveFailures.get(source.id) ?? 0,
        },
      ];
    }),
  );

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

  let newFeedbackCount = 0;
  try {
    newFeedbackCount = (await countBetaFeedbackByStatus()).new;
  } catch {
    newFeedbackCount = 0;
  }

  return (
    <InterneAdminShell>
      <InterneAdminNav active="events" newFeedbackCount={newFeedbackCount} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-rose-700/80 uppercase">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
            Events
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Van DateOfflineHub halen: direct niet publiek + AI mag niet opnieuw
            publiceren. Geen hard delete als standaardactie.
          </p>
        </div>
        <form action={signOutEventsAdmin}>
          <button
            type="submit"
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
          >
            Uitloggen
          </button>
        </form>
      </div>

      {openRefreshReviews > 0 ? (
        <div className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          Nieuwe bronupdates: {openRefreshReviews}{" "}
          <a
            href="#bronnen"
            className="ml-2 font-medium underline-offset-4 hover:underline"
          >
            Bekijk bronnen
          </a>
        </div>
      ) : null}

      <section id="events" className="mb-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Events</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Canonical events: publiceren of van DateOfflineHub halen.
          </p>
        </div>
      <EventsAdminBrowser
        events={bundles.map((bundle) => {
          const { edition } = bundle;
          const primary =
            bundle.sources.find((s) => s.isPrimary) ?? bundle.sources[0];
          return {
            id: edition.id,
            title: edition.title,
            slug: edition.slug,
            publicationStatus: edition.publicationStatus,
            publishedAt: edition.publishedAt,
            lastCheckedAt: edition.lastCheckedAt,
            city: edition.city,
            startsAt: edition.startsAt,
            primarySourceUrl: primary?.url ?? null,
            primarySourceLabel:
              primary?.sourceName ?? primary?.sourceType ?? null,
            openReports: openByEdition.get(edition.id) ?? 0,
          };
        })}
        takeOfflineAction={takeEventOfflineAction}
        publishAction={publishEventAction}
      />
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
                    {summary.firstReportAt
                      ? String(summary.firstReportAt).slice(0, 16)
                      : "—"}{" "}
                    · Laatste:{" "}
                    {summary.lastReportAt
                      ? String(summary.lastReportAt).slice(0, 16)
                      : "—"}
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
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
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

      <section id="bronnen" className="mb-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Bronnen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated Source Map. Pilotbronnen hebben “Controleer bron” (geen
            crawler, geen auto-publish). Scheduled refresh{" "}
            {scheduledGlobalOn ? "globaal aan" : "globaal uit"}{" "}
            (OFFLINERADAR_SCHEDULED_REFRESH).
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
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="userSupplied" value="1" />
            Door Youri aangebracht (user supplied)
          </label>
          <button
            type="submit"
            className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
          >
            Opslaan
          </button>
        </form>

        <CatalogSourcesBrowser
          sources={catalogSources}
          refreshBySourceId={refreshBySourceId}
          updateAction={updateCatalogSourceAction}
        />
      </section>

    </InterneAdminShell>
  );
}
