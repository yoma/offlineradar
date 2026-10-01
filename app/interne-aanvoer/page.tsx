import { Suspense, type ReactNode } from "react";
import {
  signOutAanvoerAdmin,
  startAanvoerAdminSignIn,
} from "@/app/interne-aanvoer/actions";
import { AanvoerCockpit } from "@/components/admin/aanvoer-cockpit";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { InterneAdminShell } from "@/components/admin/interne-admin-shell";
import { loadAanvoerCockpitData } from "@/lib/aanvoer/cockpit-data";
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
      <div className="space-y-4 rounded-2xl border border-stone-200 bg-white/90 px-5 py-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-3 text-sm leading-6 text-stone-600">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function InterneAanvoerPage({
  searchParams,
}: PageProps<"/interne-aanvoer">) {
  const raw = await searchParams;
  const tabRaw = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  const initialTab =
    tabRaw === "bronnen" ||
    tabRaw === "klaar" ||
    tabRaw === "controle" ||
    tabRaw === "te_bekijken" ||
    tabRaw === "toegevoegd" ||
    tabRaw === "niet_toegevoegd" ||
    tabRaw === "nieuw" ||
    tabRaw === "kandidaten"
      ? tabRaw === "kandidaten" || tabRaw === "te_bekijken"
        ? "controle"
        : tabRaw
      : "nieuw";
  const highlightSourceId = Array.isArray(raw.sourceId)
    ? raw.sourceId[0]
    : raw.sourceId ?? null;
  const highlightEditionId = Array.isArray(raw.editionId)
    ? raw.editionId[0]
    : raw.editionId ?? null;

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
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
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
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
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

  const data = await loadAanvoerCockpitData();

  return (
    <InterneAdminShell>
      <InterneAdminNav active="aanvoer" newFeedbackCount={newFeedbackCount} />
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-rose-700/80 uppercase">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
          Aanvoer
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Screenshot of link aanleveren. AI analyseert. Jij geeft finaal akkoord
          via Toevoegen aan OfflineRadar. Geen auto-publicatie.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-stone-500">Laden…</p>}>
        <AanvoerCockpit
          data={data}
          initialTab={initialTab}
          highlightSourceId={highlightSourceId}
          highlightEditionId={highlightEditionId}
        />
      </Suspense>
    </InterneAdminShell>
  );
}
