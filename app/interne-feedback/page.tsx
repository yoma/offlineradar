import type { ReactNode } from "react";
import { FeedbackAdminClient } from "@/components/admin/feedback-admin-client";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { InterneAdminShell } from "@/components/admin/interne-admin-shell";
import {
  signOutFeedbackAdmin,
  startFeedbackAdminSignIn,
} from "@/app/interne-feedback/actions";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
import {
  countBetaFeedbackByStatus,
  listBetaFeedback,
} from "@/lib/feedback/store";
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
      <div className="space-y-4 rounded-2xl border border-stone-200 bg-white/90 px-5 py-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-3 text-sm leading-6 text-stone-600">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function InterneFeedbackPage() {
  const db = assertOfflineRadarDbConfig();
  if (!db.ok) {
    return (
      <GateShell title="Feedback inbox niet beschikbaar">
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
          <form action={signOutFeedbackAdmin}>
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
          De feedback-inbox kan optionele e-mailadressen bevatten. Alleen een
          toegelaten beheerder mag hier binnen.
        </p>
        {authReady ? (
          <form action={startFeedbackAdminSignIn}>
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

  const [items, counts] = await Promise.all([
    listBetaFeedback(),
    countBetaFeedbackByStatus(),
  ]);

  return (
    <InterneAdminShell>
      <InterneAdminNav active="feedback" newFeedbackCount={counts.new} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-rose-700/80 uppercase">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
            Feedback
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Ingelogd als beheerder
            {access.via === "dev_bypass"
              ? " (lokale DEV-bypass)"
              : ` (${access.email})`}
            . Geen ticketsysteem, alleen inbox.
          </p>
        </div>
        <form action={signOutFeedbackAdmin}>
          <button
            type="submit"
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
          >
            Uitloggen
          </button>
        </form>
      </div>

      <FeedbackAdminClient items={items} counts={counts} />
    </InterneAdminShell>
  );
}
