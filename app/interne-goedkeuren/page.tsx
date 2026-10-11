import { Suspense, type ReactNode } from "react";
import { ActionSubmitButton } from "@/components/ui/action-submit-button";
import {
  signOutAanvoerAdmin,
  startAanvoerAdminSignIn,
} from "@/app/interne-aanvoer/actions";
import { GoedkeurenInbox } from "@/components/admin/goedkeuren-inbox";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { InterneAdminShell } from "@/components/admin/interne-admin-shell";
import { loadAanvoerCockpitData } from "@/lib/aanvoer/cockpit-data";
import { assertOfflineRadarDbConfig } from "@/lib/events/db";
import { countBetaFeedbackByStatus } from "@/lib/feedback/store";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
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
      <div className="space-y-4 rounded-2xl border border-stone-200 bg-white/90 px-5 py-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-3 text-sm leading-6 text-stone-600">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function InterneGoedkeurenPage() {
  const db = assertOfflineRadarDbConfig();
  if (!db.ok) {
    return (
      <GateShell title="Goedkeuren niet beschikbaar">
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
            <ActionSubmitButton
              pendingLabel="Bezig…"
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Uitloggen
            </ActionSubmitButton>
          </form>
        </GateShell>
      );
    }

    const authReady = isGoogleAuthConfigured();
    return (
      <GateShell title="Beheerder login vereist">
        <p>Alleen een toegelaten beheerder mag events goedkeuren.</p>
        {authReady ? (
          <form action={startAanvoerAdminSignIn}>
            <ActionSubmitButton
              pendingLabel="Bezig…"
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Inloggen met Google
            </ActionSubmitButton>
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
  const items = data.candidates
    .filter((c) => c.adminStatus === "aandacht_nodig")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let tipQueueCount = 0;
  try {
    const tips = await listTips();
    if (tips) {
      tipQueueCount = tips.tips.filter(
        (tip) =>
          tip.status === "received" ||
          tip.status === "in_review" ||
          tip.status === "needs_info",
      ).length;
    }
  } catch {
    tipQueueCount = 0;
  }

  return (
    <InterneAdminShell>
      <InterneAdminNav
        active="goedkeuren"
        newFeedbackCount={newFeedbackCount}
      />
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-rose-700/80 uppercase">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
          Goedkeuren
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Snelle inbox: alles wat jouw oké nodig heeft. Toevoegen = live op de
          site. Twijfel? Open meer details.
        </p>
        <p className="mt-2 text-sm font-medium text-stone-800">
          {items.length} openstaand
          {items.length === 1 ? " item" : " items"}
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-stone-500">Laden…</p>}>
        <GoedkeurenInbox items={items} tipQueueCount={tipQueueCount} />
      </Suspense>
    </InterneAdminShell>
  );
}
