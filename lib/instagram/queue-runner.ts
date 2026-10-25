/**
 * One cron "tick" for the Instagram queue. Does at most one heavy step per
 * call so it fits a 60s Vercel Hobby function:
 *
 *   1. housekeeping + token refresh (cheap)
 *   2. publish one due post, or else
 *   3. propose one post for an empty weekly slot
 */

import { brusselsWallInstant } from "@/lib/event-visibility";
import { addDays, brusselsToday, weekdayIndex } from "@/lib/dates";
import { listEvents } from "@/lib/events";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import { buildInstagramDraft } from "@/lib/instagram/drafts";
import {
  getRecentlyUsedEventIds,
  recordConceptEventIds,
} from "@/lib/instagram/history";
import {
  createMetaClient,
  humanMetaPublishError,
  type MetaClient,
} from "@/lib/instagram/meta-client";
import { readInstagramMetaConfig } from "@/lib/instagram/meta-config";
import { prepareContainersOnly } from "@/lib/instagram/publish";
import {
  isAmbiguousPostPublishError,
  META_HTTP_TIMEOUT_MS,
} from "@/lib/instagram/publish-policy";
import {
  claimDueQueuePost,
  createQueuePost,
  getAutoPostWithoutApproval,
  hasPostForSlot,
  markQueueFailed,
  markQueuePosted,
  saveQueueContainerId,
  sweepQueue,
  type InstagramQueuePost,
} from "@/lib/instagram/queue";
import { renderDraftJpegs } from "@/lib/instagram/queue-media";
import {
  getInstagramAccessToken,
  refreshInstagramTokenIfDue,
  scrubSecrets,
} from "@/lib/instagram/token-store";

/**
 * Weekly proposal slots (Brussels time). weekday: 0 = Sunday.
 * Monday: what's on this week. Wednesday: new on the site. Friday: coming up.
 */
export const INSTAGRAM_WEEKLY_SLOTS: {
  weekday: number;
  time: string;
  format: InstagramFormatId;
}[] = [
  { weekday: 1, time: "19:00", format: "deze_week" },
  { weekday: 3, time: "19:00", format: "nieuw" },
  { weekday: 5, time: "17:00", format: "binnenkort" },
];

/** Propose posts this far ahead, so there is time to review them. */
const PROPOSE_HORIZON_DAYS = 7;
/** Don't propose a slot that is closer than this. */
const PROPOSE_MIN_LEAD_MS = 6 * 3_600_000;
/** Publishing must finish well within the 60s function limit. */
const PUBLISH_BUDGET_MS = 40_000;

export type QueueSlot = {
  slotKey: string;
  at: Date;
  format: InstagramFormatId;
};

export function upcomingQueueSlots(now = new Date()): QueueSlot[] {
  const today = brusselsToday(now);
  const out: QueueSlot[] = [];
  for (let d = 0; d <= PROPOSE_HORIZON_DAYS; d++) {
    const ymd = addDays(today, d);
    const weekday = weekdayIndex(ymd);
    for (const slot of INSTAGRAM_WEEKLY_SLOTS) {
      if (slot.weekday !== weekday) continue;
      const at = brusselsWallInstant(ymd, slot.time);
      const lead = at.getTime() - now.getTime();
      if (lead < PROPOSE_MIN_LEAD_MS) continue;
      if (lead > PROPOSE_HORIZON_DAYS * 86_400_000) continue;
      out.push({ slotKey: `${ymd}T${slot.time}|${slot.format}`, at, format: slot.format });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export type QueueTickResult = {
  sweep: { interrupted: number; overdue: number; mediaPurged: number };
  token: string;
  published: { id: string; ok: boolean; message: string } | null;
  proposed: { id: string; slotKey: string } | null;
  notes: string[];
};

export async function runInstagramQueueTick(options?: {
  now?: Date;
  metaClient?: MetaClient;
}): Promise<QueueTickResult> {
  const now = options?.now ?? new Date();
  const notes: string[] = [];

  const sweep = await sweepQueue(now);
  const refresh = await refreshInstagramTokenIfDue({ now });
  const token =
    refresh.status === "skipped" ? `skipped:${refresh.reason}` : refresh.status;

  const result: QueueTickResult = {
    sweep,
    token,
    published: null,
    proposed: null,
    notes,
  };

  const config = readInstagramMetaConfig();
  if (config.dryRun) {
    notes.push("INSTAGRAM_META_DRY_RUN staat aan: er wordt niets gepost.");
  } else {
    const autoPost = await getAutoPostWithoutApproval();
    const post = await claimDueQueuePost({ autoPost, now });
    if (post) {
      result.published = await publishQueuePost(post, options?.metaClient);
      return result;
    }
  }

  result.proposed = await proposeNextSlot(now, notes);
  return result;
}

async function publishQueuePost(
  post: InstagramQueuePost,
  injectedClient?: MetaClient,
): Promise<{ id: string; ok: boolean; message: string }> {
  const fail = async (message: string) => {
    const safe = scrubSecrets(message);
    await markQueueFailed(post.id, safe);
    console.warn(`[instagram/queue] ${post.id} mislukt: ${safe}`);
    return { id: post.id, ok: false, message: safe };
  };

  const config = readInstagramMetaConfig();
  const accessToken = await getInstagramAccessToken();
  if (!config.igUserId || !accessToken) {
    return fail(humanMetaPublishError("missing_credentials"));
  }
  if (post.imageUrls.length === 0) return fail(humanMetaPublishError("no_slides"));

  if (post.eventIds.length > 0) {
    try {
      const live = new Set((await listEvents()).map((e) => e.id));
      const gone = post.eventIds.filter((id) => !live.has(id));
      if (gone.length > 0) {
        return fail(
          `Niet geplaatst: ${gone.length} event(s) uit deze post staan niet meer online. Maak een nieuw voorstel.`,
        );
      }
    } catch {
      return fail("Catalogus niet bereikbaar om de events te controleren.");
    }
  }

  const client =
    injectedClient ??
    createMetaClient({
      igUserId: config.igUserId,
      accessToken,
      graphApiVersion: config.graphApiVersion,
      graphHost: config.graphHost,
    });

  const deadlineMs = Date.now() + PUBLISH_BUDGET_MS;
  const prepared = await prepareContainersOnly({
    client,
    caption: post.caption,
    imageUrls: post.imageUrls,
    deadlineMs,
  });
  if (!prepared.ok) return fail(prepared.message);
  await saveQueueContainerId(post.id, prepared.containerId);

  const published = await client.publishContainer(prepared.containerId, {
    timeoutMs: Math.max(5_000, Math.min(META_HTTP_TIMEOUT_MS, deadlineMs - Date.now())),
  });
  if (!published.ok) {
    const message = humanMetaPublishError(
      published.error.code,
      published.error.message,
    );
    return fail(
      isAmbiguousPostPublishError(published.error.code)
        ? `Onzeker of de post online staat (${message}) Kijk op Instagram voor je opnieuw probeert.`
        : message,
    );
  }

  await markQueuePosted(post.id, published.data.id);
  console.info(`[instagram/queue] ${post.id} gepost als ${published.data.id}`);
  return { id: post.id, ok: true, message: "Gepost op Instagram." };
}

async function proposeNextSlot(
  now: Date,
  notes: string[],
): Promise<{ id: string; slotKey: string } | null> {
  const open: QueueSlot[] = [];
  for (const candidate of upcomingQueueSlots(now)) {
    if (!(await hasPostForSlot(candidate.slotKey))) open.push(candidate);
  }
  if (open.length === 0) return null;

  const catalog = await listEvents();
  const recentlyUsed = await getRecentlyUsedEventIds(21);
  for (const slot of open) {
    const draft = buildInstagramDraft(slot.format, catalog, {
      now: slot.at,
      recentlyUsedIds: recentlyUsed,
    });
    if (!draft) {
      notes.push(`${slot.slotKey}: te weinig geschikte events voor een voorstel.`);
      continue;
    }

    // Render one proposal per tick; the next run picks up the next slot.
    const jpegs = await renderDraftJpegs(draft, catalog);
    const created = await createQueuePost({
      jpegs,
      caption: draft.caption,
      scheduledAt: slot.at,
      status: "te_keuren",
      source: "auto",
      format: draft.format,
      eventIds: draft.eventIds,
      slotKey: slot.slotKey,
    });
    if (!created) return null;
    await recordConceptEventIds(draft.eventIds);
    return { id: created.id, slotKey: slot.slotKey };
  }
  return null;
}
