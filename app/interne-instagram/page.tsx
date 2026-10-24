import type { ReactNode } from "react";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
import { listEvents } from "@/lib/events";
import { buildPhase3aPreviewDrafts } from "@/lib/instagram/drafts";
import { getRecentlyUsedEventIds } from "@/lib/instagram/history";
import { INSTAGRAM_META_STATUS } from "@/lib/instagram/meta-readiness";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { InterneAdminShell } from "@/components/admin/interne-admin-shell";
import { InstagramPreviewClient } from "@/components/admin/instagram-preview-client";
import type { Event } from "@/types/event";
import type { InstagramDraft } from "@/lib/instagram/drafts";

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

/** Strip non-JSON values so drafts can cross the RSC → client boundary. */
function sanitizeEvent(event: Event): Event {
  return {
    ...event,
    distanceKm: Number.isFinite(event.distanceKm) ? event.distanceKm : 0,
  };
}

function sanitizeDraft(draft: InstagramDraft): InstagramDraft {
  return {
    ...draft,
    events: draft.events.map(sanitizeEvent),
  };
}

export default async function InterneInstagramPage() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    if (access.reason === "forbidden") {
      return (
        <GateShell title="Geen beheerrechten">
          <p>Dit Google-account staat niet op de beheerderslijst.</p>
        </GateShell>
      );
    }
    const authReady = isGoogleAuthConfigured();
    return (
      <GateShell title="Beheerder login vereist">
        <p>Alleen toegelaten beheerders mogen Instagram-concepten bekijken.</p>
        {!authReady ? (
          <p>
            Lokaal: zet{" "}
            <code className="text-foreground">OFFLINERADAR_TIPS_ADMIN_DEV_BYPASS=1</code>{" "}
            + store flags, of configureer Google OAuth.
          </p>
        ) : (
          <p>Log in via een andere interne adminpagina met Google.</p>
        )}
      </GateShell>
    );
  }

  let catalog: Event[] = [];
  let loadError: string | null = null;
  try {
    catalog = await listEvents();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Catalogus kon niet worden geladen.";
  }

  const recentlyUsed = await getRecentlyUsedEventIds(21);
  const { drafts, notes } = buildPhase3aPreviewDrafts(catalog);
  const extraNotes = [...notes];
  if (recentlyUsed.size > 0) {
    extraNotes.push(
      `${recentlyUsed.size} events in conceptgeschiedenis (laatste 21 dagen) — preview negeert die filter deels zodat de drie formats zichtbaar blijven.`,
    );
  }
  if (loadError) {
    extraNotes.unshift(`Catalogusfout: ${loadError}`);
  }

  return (
    <InterneAdminShell wide>
      <InterneAdminNav active="instagram" />
      <InstagramPreviewClient
        drafts={drafts.map(sanitizeDraft)}
        notes={extraNotes}
      />
      <p className="mt-8 text-xs text-stone-500">
        Meta-status: publishEnabled=
        {String(INSTAGRAM_META_STATUS.publishEnabled)}, phase=
        {INSTAGRAM_META_STATUS.phase}. Geen Graph API-calls in deze fase.
      </p>
    </InterneAdminShell>
  );
}
