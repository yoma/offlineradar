import type { ReactNode } from "react";
import { AanvoerClient } from "@/app/interne-aanvoer/aanvoer-client";
import {
  signOutAanvoerAdmin,
  startAanvoerAdminSignIn,
} from "@/app/interne-aanvoer/actions";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { assertOfflineRadarDbConfig } from "@/lib/events/db";
import { countBetaFeedbackByStatus } from "@/lib/feedback/store";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";

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

export default async function InterneAanvoerPage() {
  const db = assertOfflineRadarDbConfig();
  if (!db.ok) {
    return (
      <GateShell title="Aanvoer niet beschikbaar">
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
          <form action={signOutAanvoerAdmin}>
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
        <p>
          Alleen een toegelaten beheerder mag bronnen en events via snelle
          intake aanbrengen.
        </p>
        {authReady ? (
          <form action={startAanvoerAdminSignIn}>
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

  let newFeedbackCount = 0;
  try {
    const counts = await countBetaFeedbackByStatus();
    newFeedbackCount = counts.new;
  } catch {
    newFeedbackCount = 0;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-10 sm:px-6">
      <InterneAdminNav active="aanvoer" newFeedbackCount={newFeedbackCount} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Aanvoer</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Plak een URL, tekst of screenshot. AI maakt een voorstel. Jij beslist.
          Geen auto-publish. User-supplied bronnen blijven mandatory voor
          toekomstige discovery.
        </p>
      </div>
      <AanvoerClient />
    </div>
  );
}
