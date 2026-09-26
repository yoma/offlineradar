import type { ReactNode } from "react";
import {
  signOutEventsAdmin,
  startEventsAdminSignIn,
  takeEventOfflineAction,
} from "@/app/interne-events/actions";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
import { listEditionBundlesForAdmin } from "@/lib/events/neon-store";
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
 * Minimal canonical event admin. Same Google allowlist as tip admin.
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

  const bundles = await listEditionBundlesForAdmin(50);
  if (!bundles) {
    return (
      <GateShell title="Eventbeheer niet beschikbaar">
        <p>Catalogus kon niet worden gelezen.</p>
      </GateShell>
    );
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

      <ul className="space-y-4">
        {bundles.map((bundle) => {
          const { edition } = bundle;
          const primary =
            bundle.sources.find((s) => s.isPrimary) ?? bundle.sources[0];
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
                  <p className="text-sm text-muted-foreground">
                    Laatst gecontroleerd:{" "}
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
        })}
      </ul>
    </div>
  );
}
