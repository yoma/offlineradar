/**
 * Reel props for queue posts. Built from the same draft (events, format) as
 * the slides when a post is made, and rebuilt when the post moves to another
 * day so the hook ("dit weekend", "morgen") stays true.
 */

import { listEvents } from "@/lib/events";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import { getQueuePost, requestReelRender } from "@/lib/instagram/queue";
import { readInstagramReelConfig } from "@/lib/instagram/reel/config";
import { buildReelProps } from "@/lib/instagram/reel/props";
import type { ReelProps } from "@/lib/instagram/reel/types";
import type { Event } from "@/types/event";

function reelFormat(format: string | null): InstagramFormatId {
  return format === "deze_week" || format === "nieuw" ? format : "binnenkort";
}

/** Props for a new post; null (no reel, the post still works) on failure. */
export function prepareReelProps(
  draft: { format: string | null; events: Event[] },
  publishAt: Date,
): ReelProps | null {
  try {
    return buildReelProps({
      format: reelFormat(draft.format),
      events: draft.events,
      publishAt,
      config: readInstagramReelConfig(),
      // The renderer picks the track, so the music rotates across reels.
      music: null,
    });
  } catch (error) {
    console.warn(
      "[instagram/reel] props failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * After a post was moved: render the reel again when its hook would read
 * differently on the new date. Best effort; never blocks the edit itself.
 */
export async function refreshReelAfterReschedule(postId: string): Promise<void> {
  try {
    const post = await getQueuePost(postId);
    if (!post?.reelHook || post.eventIds.length === 0) return;
    const catalog = await listEvents();
    const byId = new Map(catalog.map((e) => [e.id, e]));
    const events = post.eventIds.map((id) => byId.get(id));
    if (events.some((e) => !e)) return;
    const props = prepareReelProps(
      { format: post.format, events: events as Event[] },
      new Date(post.scheduledAt),
    );
    if (props && props.hookText !== post.reelHook) {
      await requestReelRender(postId, props);
      console.info(`[instagram/reel] ${postId}: nieuwe datum, reel wordt opnieuw gemaakt`);
    }
  } catch (error) {
    console.warn(
      "[instagram/reel] refresh failed",
      error instanceof Error ? error.message : error,
    );
  }
}
