/**
 * One cron "tick" for the Instagram queue (Vercel cron, daily on Hobby).
 * Does at most one heavy step per call so it fits a 60s function:
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
  waitForContainerFinished,
  type MetaClient,
} from "@/lib/instagram/meta-client";
import { readInstagramMetaConfig } from "@/lib/instagram/meta-config";
import {
  isAmbiguousPostPublishError,
  META_HTTP_TIMEOUT_MS,
} from "@/lib/instagram/publish-policy";
import {
  addStoryImage,
  claimDueQueuePost,
  claimQueuePostById,
  claimStoryPublish,
  getFirstFeedImage,
  getStoryImageId,
  markStoryFailed,
  markStoryPosted,
  publicMediaUrl,
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
import { NEEDS_INSTAGRAM_CHECK } from "@/lib/instagram/queue-messages";
import { renderStoryJpeg, renderStoryOrNull } from "@/lib/instagram/story";
import {
  getInstagramAccessToken,
  refreshInstagramTokenIfDue,
  scrubSecrets,
} from "@/lib/instagram/token-store";

/**
 * Weekly proposal slots (Brussels time). weekday: 0 = Sunday.
 * Monday: what's on this week. Wednesday: new on the site. Friday: coming up.
 * 17:30 is just before the daily cron (17:xx UTC = 18–19h Brussels), so the
 * post goes out in that evening's run.
 */
const DAILY_POST_TIME = "17:30";

export const INSTAGRAM_WEEKLY_SLOTS: {
  weekday: number;
  time: string;
  format: InstagramFormatId;
}[] = [
  { weekday: 1, time: DAILY_POST_TIME, format: "deze_week" },
  { weekday: 3, time: DAILY_POST_TIME, format: "nieuw" },
  { weekday: 5, time: DAILY_POST_TIME, format: "binnenkort" },
];

/** Propose posts this far ahead, so there is time to review them. */
const PROPOSE_HORIZON_DAYS = 7;
/** Don't propose a slot that is closer than this. */
const PROPOSE_MIN_LEAD_MS = 6 * 3_600_000;
/** Publishing must finish well within the 60s function limit. */
const PUBLISH_BUDGET_MS = 45_000;
/** The story goes after the feed post, within the same 60s function. */
const STORY_DEADLINE_MS = 54_000;
const STORY_MIN_MS = 8_000;
/** Start another due post in the same cron run only while this much is left. */
const NEXT_POST_MIN_REMAINING_MS = 45_000;
const CRON_TOTAL_MS = 55_000;


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

/** Default time for a post made by hand: this evening's run, or tomorrow's. */
export function nextDailyPostTime(now = new Date()): Date {
  const today = brusselsToday(now);
  const tonight = brusselsWallInstant(today, DAILY_POST_TIME);
  return tonight.getTime() > now.getTime()
    ? tonight
    : brusselsWallInstant(addDays(today, 1), DAILY_POST_TIME);
}

export type QueueTickResult = {
  sweep: { interrupted: number; overdue: number; mediaPurged: number };
  token: string;
  published: { id: string; ok: boolean; message: string }[];
  proposed: { id: string; slotKey: string } | null;
  notes: string[];
};

export async function runInstagramQueueTick(options?: {
  now?: Date;
  metaClient?: MetaClient;
}): Promise<QueueTickResult> {
  const startedMs = Date.now();
  const now = options?.now ?? new Date();
  const notes: string[] = [];

  const sweep = await sweepQueue(now);
  const refresh = await refreshInstagramTokenIfDue({ now });
  const token =
    refresh.status === "skipped" ? `skipped:${refresh.reason}` : refresh.status;

  const result: QueueTickResult = {
    sweep,
    token,
    published: [],
    proposed: null,
    notes,
  };

  const config = readInstagramMetaConfig();
  if (config.dryRun) {
    notes.push("INSTAGRAM_META_DRY_RUN staat aan: er wordt niets gepost.");
  } else if (config.publishExplicitlyOff) {
    notes.push("INSTAGRAM_META_PUBLISH_ENABLED=0: er wordt niets gepost.");
  } else {
    // The cron runs once a day, so publish every due post while time allows.
    const autoPost = await getAutoPostWithoutApproval();
    while (CRON_TOTAL_MS - (Date.now() - startedMs) >= NEXT_POST_MIN_REMAINING_MS) {
      const post = await claimDueQueuePost({ autoPost, now });
      if (!post) break;
      result.published.push(await publishQueuePost(post, options?.metaClient));
    }
    if (result.published.length > 0) return result;
  }

  result.proposed = await proposeNextSlot(now, notes);
  return result;
}

export async function publishQueuePost(
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
  const startedMs = Date.now();
  const deadlineMs = startedMs + PUBLISH_BUDGET_MS;

  // An earlier attempt got as far as media_publish. Only post again when
  // Instagram clearly says that container was never published (FINISHED);
  // anything else needs a human look at Instagram first.
  if (post.containerId) {
    const status = await client.getContainerStatus(post.containerId);
    const code = status.ok
      ? (status.data.status_code ?? status.data.status ?? "").toUpperCase()
      : "";
    if (code === "PUBLISHED") {
      await markQueuePosted(post.id, null);
      return { id: post.id, ok: true, message: "Stond al op Instagram (vorige poging)." };
    }
    if (code !== "FINISHED") {
      return fail(NEEDS_INSTAGRAM_CHECK);
    }
    // FINISHED = never published. Build fresh containers anyway, so an
    // edited caption is what goes live.
  }

  const prepared = await prepareContainers({
    client,
    caption: post.caption,
    imageUrls: post.imageUrls,
    deadlineMs,
  });
  if (!prepared.ok) return fail(prepared.message);
  const containerId = prepared.containerId;
  await saveQueueContainerId(post.id, containerId);

  const published = await client.publishContainer(containerId, {
    timeoutMs: Math.max(5_000, Math.min(META_HTTP_TIMEOUT_MS, deadlineMs - Date.now())),
  });
  if (!published.ok) {
    if (published.error.code === "meta_already_published") {
      await markQueuePosted(post.id, null);
      return { id: post.id, ok: true, message: "Stond al op Instagram." };
    }
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

  if (!post.postStory) {
    return { id: post.id, ok: true, message: "Gepost op Instagram." };
  }
  const story = await publishStory(post.id, client, startedMs + STORY_DEADLINE_MS);
  return {
    id: post.id,
    ok: true,
    message: story.ok
      ? "Gepost op Instagram, ook als verhaal."
      : `Gepost op Instagram. Verhaal niet gelukt: ${story.message}`,
  };
}

/**
 * Publish the 1080×1920 story for a post that is already live.
 * Never touches the feed post; failures only set story_error.
 */
async function publishStory(
  postId: string,
  client: MetaClient,
  deadlineMs: number,
): Promise<{ ok: boolean; message: string }> {
  if (deadlineMs - Date.now() < STORY_MIN_MS) {
    const message = "Geen tijd meer in deze ronde. Klik op 'Verhaal plaatsen'.";
    await markStoryFailed(postId, message);
    return { ok: false, message };
  }
  if (!(await claimStoryPublish(postId))) {
    return { ok: false, message: "Verhaal staat al online of wordt net geplaatst." };
  }
  const fail = async (raw: string) => {
    const message = scrubSecrets(raw);
    await markStoryFailed(postId, message);
    console.warn(`[instagram/queue] ${postId} verhaal mislukt: ${message}`);
    return { ok: false, message };
  };

  try {
    let storyImageId = await getStoryImageId(postId);
    if (!storyImageId) {
      // Posts made before stories existed: render from the first slide now.
      const first = await getFirstFeedImage(postId);
      if (!first) return fail("Geen afbeelding gevonden voor het verhaal.");
      storyImageId = await addStoryImage(postId, await renderStoryJpeg(first));
    }

    const timeoutMs = () =>
      Math.max(1_000, Math.min(META_HTTP_TIMEOUT_MS, deadlineMs - Date.now()));
    if (!client.createStoryContainer) return fail("Verhalen niet ondersteund.");
    const container = await client.createStoryContainer(
      { imageUrl: publicMediaUrl(storyImageId) },
      { timeoutMs: timeoutMs() },
    );
    if (!container.ok) {
      return fail(humanMetaPublishError(container.error.code, container.error.message));
    }
    const ready = await waitForContainerFinished(client, container.data.id, {
      deadlineMs,
      delayMs: 1_500,
    });
    if (!ready.ok) {
      return fail(humanMetaPublishError(ready.error.code, ready.error.message));
    }
    const published = await client.publishContainer(container.data.id, {
      timeoutMs: timeoutMs(),
    });
    if (!published.ok) {
      return fail(humanMetaPublishError(published.error.code, published.error.message));
    }
    await markStoryPosted(postId, published.data.id);
    return { ok: true, message: "Verhaal geplaatst." };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Verhaal mislukt.");
  }
}

/** "Verhaal plaatsen": (re)try the story of a post that is already live. */
export async function publishStoryNow(
  postId: string,
): Promise<{ ok: boolean; message: string }> {
  const config = readInstagramMetaConfig();
  if (config.dryRun || config.publishExplicitlyOff) {
    return { ok: false, message: "Posten staat uit (dry-run of noodstop)." };
  }
  const accessToken = await getInstagramAccessToken();
  if (!config.igUserId || !accessToken) {
    return { ok: false, message: humanMetaPublishError("missing_credentials") };
  }
  const client = createMetaClient({
    igUserId: config.igUserId,
    accessToken,
    graphApiVersion: config.graphApiVersion,
    graphHost: config.graphHost,
  });
  return publishStory(postId, client, Date.now() + PUBLISH_BUDGET_MS);
}

/**
 * Create the containers for one post. Carousel children are created and
 * polled in parallel so a 7-slide carousel fits the 60s function limit.
 */
export async function prepareContainers(args: {
  client: MetaClient;
  caption: string;
  imageUrls: string[];
  deadlineMs: number;
}): Promise<{ ok: true; containerId: string } | { ok: false; message: string }> {
  const { client, caption, imageUrls, deadlineMs } = args;
  const timeoutMs = () =>
    Math.max(1_000, Math.min(META_HTTP_TIMEOUT_MS, deadlineMs - Date.now()));
  const waitReady = (id: string) =>
    waitForContainerFinished(client, id, { deadlineMs, delayMs: 1_500 });
  const err = (e: { code: string; message: string }) => ({
    ok: false as const,
    message: humanMetaPublishError(e.code, e.message),
  });

  if (imageUrls.length > 10) {
    return { ok: false, message: "Instagram staat maximaal 10 afbeeldingen toe." };
  }

  if (imageUrls.length === 1) {
    const single = await client.createImageContainer(
      { imageUrl: imageUrls[0]!, caption },
      { timeoutMs: timeoutMs() },
    );
    if (!single.ok) return err(single.error);
    const ready = await waitReady(single.data.id);
    if (!ready.ok) return err(ready.error);
    return { ok: true, containerId: single.data.id };
  }

  const children = await Promise.all(
    imageUrls.map((imageUrl) =>
      client.createImageContainer(
        { imageUrl, isCarouselItem: true },
        { timeoutMs: timeoutMs() },
      ),
    ),
  );
  const childIds: string[] = [];
  for (const child of children) {
    if (!child.ok) return err(child.error);
    childIds.push(child.data.id);
  }
  const childReady = await Promise.all(childIds.map(waitReady));
  for (const ready of childReady) {
    if (!ready.ok) return err(ready.error);
  }

  const carousel = await client.createCarouselContainer(
    { children: childIds, caption },
    { timeoutMs: timeoutMs() },
  );
  if (!carousel.ok) return err(carousel.error);
  const ready = await waitReady(carousel.data.id);
  if (!ready.ok) return err(ready.error);
  return { ok: true, containerId: carousel.data.id };
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
      storyJpeg: await renderStoryOrNull(jpegs[0]!),
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

/** "Nu plaatsen": publish one post right away (admin action). */
export async function publishQueuePostNow(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const config = readInstagramMetaConfig();
  if (config.dryRun) {
    return { ok: false, message: "INSTAGRAM_META_DRY_RUN staat aan: er wordt niets gepost." };
  }
  if (config.publishExplicitlyOff) {
    return { ok: false, message: "INSTAGRAM_META_PUBLISH_ENABLED=0: posten staat uit." };
  }
  const post = await claimQueuePostById(id);
  if (!post) {
    return { ok: false, message: "Deze post wordt al geplaatst of is al geplaatst." };
  }
  const result = await publishQueuePost(post);
  return { ok: result.ok, message: result.message };
}
