import type { ReactNode } from "react";
import { TipAdminClient } from "@/components/tips/tip-admin-client";
import { startGoogleSignIn, signOutTipsAdmin } from "@/app/interne-tips/actions";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
import { isTipsStoreAvailable, tipsStorageMode } from "@/lib/tips/config";
import { listTips } from "@/lib/tips/service";

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
 * Internal tips queue. Access requires:
 * 1) durable store (Neon or local-dev file), and
 * 2) Auth.js Google session whose email is on OFFLINERADAR_ADMIN_EMAILS,
 *    OR an explicit local-only DEV bypass (never production).
 */
export default async function InterneTipsPage() {
  if (!isTipsStoreAvailable()) {
    return (
      <GateShell title="Tipwachtrij niet beschikbaar">
        <p>
          De opslag voor meldingen is niet actief. Lokaal:{" "}
          <code className="text-xs">npm run dev:tips-neon</code>.
        </p>
      </GateShell>
    );
  }

  const access = await resolveTipsAdminAccess();

  if (!access.ok) {
    if (access.reason === "forbidden") {
      return (
        <GateShell title="Geen beheerrechten">
          <p>
            Je bent ingelogd, maar dit Google-account staat niet op de
            beheerderslijst. Log uit en probeer het toegelaten account.
          </p>
          <form action={signOutTipsAdmin}>
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

    if (access.reason === "unauthenticated" || access.reason === "auth_unconfigured") {
      const authReady = isGoogleAuthConfigured();
      return (
        <GateShell title="Beheerder login vereist">
          <p>
            De tipwachtrij toont persoonsgegevens (o.a. optionele e-mailadressen).
            Alleen een toegelaten beheerder mag hier binnen.
          </p>
          {authReady ? (
            <form action={startGoogleSignIn}>
              <button
                type="submit"
                className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
              >
                Inloggen met Google
              </button>
            </form>
          ) : (
            <p>
              Google OAuth is nog niet geconfigureerd (
              <code className="text-xs">AUTH_SECRET</code>,{" "}
              <code className="text-xs">AUTH_GOOGLE_ID</code>,{" "}
              <code className="text-xs">AUTH_GOOGLE_SECRET</code>,{" "}
              <code className="text-xs">OFFLINERADAR_ADMIN_EMAILS</code>
              ). Login is voorbereid maar nog niet operationeel. Voor lokale
              tests zonder OAuth:{" "}
              <code className="text-xs">npm run dev:tips-neon</code> (zet
              expliciet de DEV-bypass).
            </p>
          )}
        </GateShell>
      );
    }

    return (
      <GateShell title="Tipwachtrij niet beschikbaar">
        <p>Toegang geweigerd.</p>
      </GateShell>
    );
  }

  const snapshot = await listTips();
  if (!snapshot) {
    return (
      <GateShell title="Tipwachtrij niet beschikbaar">
        <p>Opslag kon niet worden gelezen.</p>
      </GateShell>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Interne tipwachtrij (niet publiek)</p>
            <p className="mt-1 leading-6">
              Ingelogd als beheerder
              {access.via === "dev_bypass"
                ? " (lokale DEV-bypass, geen productie-auth)"
                : ` (${access.email})`}
              . Opslag: {tipsStorageMode()}. Goedkeuren publiceert niet
              automatisch.
            </p>
          </div>
          {access.via === "google_session" ? (
            <form action={signOutTipsAdmin}>
              <button
                type="submit"
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm"
              >
                Uitloggen
              </button>
            </form>
          ) : null}
        </div>
      </div>
      <TipAdminClient initial={snapshot} />
    </div>
  );
}
