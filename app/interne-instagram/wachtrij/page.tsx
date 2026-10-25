import type { ReactNode } from "react";
import {
  isGoogleAuthConfigured,
  resolveTipsAdminAccess,
} from "@/lib/tips/admin-auth";
import { InterneAdminNav } from "@/components/admin/interne-admin-nav";
import { InterneAdminShell } from "@/components/admin/interne-admin-shell";
import { InstagramQueueClient } from "@/components/admin/instagram-queue-client";
import { readInstagramMetaConfig } from "@/lib/instagram/meta-config";
import {
  getAutoPostWithoutApproval,
  listQueuePosts,
  type InstagramQueuePost,
} from "@/lib/instagram/queue";
import { upcomingQueueSlots } from "@/lib/instagram/queue-runner";
import { getInstagramTokenStatus } from "@/lib/instagram/token-store";

export const dynamic = "force-dynamic";

function GateShell({ title, children }: { title: string; children: ReactNode }) {
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

export default async function InstagramWachtrijPage() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    if (access.reason === "forbidden") {
      return (
        <GateShell title="Geen beheerrechten">
          <p>Dit Google-account staat niet op de beheerderslijst.</p>
        </GateShell>
      );
    }
    return (
      <GateShell title="Beheerder login vereist">
        <p>Alleen toegelaten beheerders mogen de Instagram-wachtrij zien.</p>
        {isGoogleAuthConfigured() ? (
          <p>Log in via een andere interne adminpagina met Google.</p>
        ) : null}
      </GateShell>
    );
  }

  let posts: InstagramQueuePost[] = [];
  let autoPost = false;
  let loadError: string | null = null;
  try {
    [posts, autoPost] = await Promise.all([
      listQueuePosts(),
      getAutoPostWithoutApproval(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Wachtrij kon niet geladen worden.";
  }

  const config = readInstagramMetaConfig();
  const token = await getInstagramTokenStatus();
  const nextSlots = upcomingQueueSlots().map((s) => ({
    at: s.at.toISOString(),
    format: s.format,
  }));

  return (
    <InterneAdminShell wide>
      <InterneAdminNav active="instagram" />
      <InstagramQueueClient
        posts={posts}
        autoPost={autoPost}
        loadError={loadError}
        nextSlots={nextSlots}
        renderedAt={new Date().toISOString()}
        setup={{
          userIdSet: Boolean(config.igUserId),
          tokenConfigured: token.configured,
          tokenStored: token.stored,
          tokenRefreshedAt: token.refreshedAt,
          tokenExpiresAt: token.expiresAt,
          tokenLastError: token.lastError,
          dryRun: config.dryRun,
        }}
      />
    </InterneAdminShell>
  );
}
