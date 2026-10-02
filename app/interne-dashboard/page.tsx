import { Suspense } from "react";
import { ActionSubmitButton } from "@/components/ui/action-submit-button";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { InterneAdminShell } from "@/components/admin/interne-admin-shell";
import { DashboardClient } from "@/components/admin/dashboard-client";
import {
  loadDashboardData,
  resolveDashboardPeriod,
} from "@/lib/analytics/dashboard";
import { countBetaFeedbackByStatus } from "@/lib/feedback/store";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
import { startDashboardAdminSignIn } from "@/app/interne-dashboard/actions";

export const dynamic = "force-dynamic";

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <InterneAdminShell wide>
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm">
        {children}
      </div>
    </InterneAdminShell>
  );
}

export default async function InterneDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    const authReady = isGoogleAuthConfigured();
    return (
      <GateShell>
        <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>
        <p className="mt-2 text-sm text-stone-600">
          Alleen voor beheerders. Log in met een allowlisted Google-account.
        </p>
        {authReady ? (
          <form action={startDashboardAdminSignIn} className="mt-4">
            <ActionSubmitButton
              pendingLabel="Bezig…"
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Inloggen met Google
            </ActionSubmitButton>
          </form>
        ) : (
          <p className="mt-4 text-sm text-stone-600">
            Google OAuth is nog niet geconfigureerd.
          </p>
        )}
      </GateShell>
    );
  }

  const raw = await searchParams;
  const periodKey = typeof raw.period === "string" ? raw.period : "7d";
  const from = typeof raw.from === "string" ? raw.from : null;
  const to = typeof raw.to === "string" ? raw.to : null;
  const period = resolveDashboardPeriod({
    period: periodKey,
    from,
    to,
  });
  const data = await loadDashboardData(period);

  let newFeedbackCount = 0;
  try {
    const counts = await countBetaFeedbackByStatus();
    newFeedbackCount = counts.new;
  } catch {
    newFeedbackCount = 0;
  }

  return (
    <InterneAdminShell wide>
      <InterneAdminNav active="dashboard" newFeedbackCount={newFeedbackCount} />
      <Suspense fallback={<p className="text-sm text-stone-500">Laden…</p>}>
        <DashboardClient data={data} />
      </Suspense>
    </InterneAdminShell>
  );
}
