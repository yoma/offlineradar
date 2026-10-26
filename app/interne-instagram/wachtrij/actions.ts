"use server";

import { revalidatePath } from "next/cache";
import { listEvents } from "@/lib/events";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import {
  buildInstagramDraft,
  buildSingleEventDraft,
  listSingleEventCandidates,
} from "@/lib/instagram/drafts";
import {
  getRecentlyUsedEventIds,
  recordConceptEventIds,
} from "@/lib/instagram/history";
import {
  approveQueuePost,
  createQueuePost,
  deleteQueuePost,
  rejectQueuePost,
  requestReelRender,
  resetFailedQueuePost,
  setAutoPostWithoutApproval,
  submitQueuePostForReview,
  updateQueuePost,
} from "@/lib/instagram/queue";
import { renderDraftJpegs } from "@/lib/instagram/queue-media";
import {
  nextDailyPostTime,
  publishQueuePostNow,
  publishStoryNow,
} from "@/lib/instagram/queue-runner";
import {
  prepareReelProps,
  refreshReelAfterReschedule,
} from "@/lib/instagram/reel/queue-reel";
import { renderStoryOrNull } from "@/lib/instagram/story";
import { fromBrusselsLocalInput } from "@/lib/instagram/queue-time";
import { scrubSecrets } from "@/lib/instagram/token-store";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";

export type QueueActionResult = { ok: boolean; message: string };

const PATH = "/interne-instagram/wachtrij";

async function guard(): Promise<{ email: string | null } | null> {
  const access = await resolveTipsAdminAccess();
  return access.ok ? { email: access.email ?? null } : null;
}

const UNAUTHORIZED: QueueActionResult = {
  ok: false,
  message: "Je bent niet ingelogd als beheerder.",
};

function done(ok: boolean, yes: string, no: string): QueueActionResult {
  revalidatePath(PATH);
  return ok ? { ok, message: yes } : { ok, message: no };
}

function readPostStory(formData: FormData): boolean | undefined {
  const raw = formData.get("postStory");
  return raw == null ? undefined : String(raw) === "1";
}

function readTime(formData: FormData): Date | null | "invalid" {
  const raw = String(formData.get("scheduledAt") ?? "").trim();
  if (!raw) return null;
  return fromBrusselsLocalInput(raw) ?? "invalid";
}

function failure(error: unknown): QueueActionResult {
  return {
    ok: false,
    message: scrubSecrets(
      error instanceof Error ? error.message : "Er ging iets mis.",
    ),
  };
}

export async function saveQueuePostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  const time = readTime(formData);
  if (time === "invalid") return { ok: false, message: "Ongeldig tijdstip." };
  try {
    const ok = await updateQueuePost(String(formData.get("id")), {
      caption: String(formData.get("caption") ?? ""),
      scheduledAt: time ?? undefined,
      postStory: readPostStory(formData),
    });
    if (ok && time) await refreshReelAfterReschedule(String(formData.get("id")));
    return done(ok, "Opgeslagen.", "Deze post kan niet meer aangepast worden.");
  } catch (error) {
    return failure(error);
  }
}

export async function approveQueuePostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  const admin = await guard();
  if (!admin) return UNAUTHORIZED;
  const time = readTime(formData);
  if (time === "invalid") return { ok: false, message: "Ongeldig tijdstip." };
  const caption = String(formData.get("caption") ?? "").trim();
  if (!caption) return { ok: false, message: "Caption is leeg." };
  try {
    const ok = await approveQueuePost(String(formData.get("id")), {
      caption,
      scheduledAt: time ?? undefined,
      approvedBy: admin.email,
      postStory: readPostStory(formData),
    });
    if (ok && time) await refreshReelAfterReschedule(String(formData.get("id")));
    return done(
      ok,
      "Goedgekeurd. De post wordt op het geplande tijdstip geplaatst.",
      "Goedkeuren lukte niet (post is al bezig of geplaatst).",
    );
  } catch (error) {
    return failure(error);
  }
}

export async function rejectQueuePostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  try {
    const ok = await rejectQueuePost(String(formData.get("id")));
    return done(
      ok,
      "Afgewezen. De post wordt niet geplaatst.",
      "Afwijzen lukte niet (post is al bezig of geplaatst).",
    );
  } catch (error) {
    return failure(error);
  }
}

export async function submitQueuePostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  try {
    const ok = await submitQueuePostForReview(String(formData.get("id")));
    return done(ok, "Terug bij 'te keuren'.", "Dat lukte niet.");
  } catch (error) {
    return failure(error);
  }
}

export async function retryQueuePostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  try {
    const ok = await resetFailedQueuePost(String(formData.get("id")), {
      confirmedNotOnInstagram: String(formData.get("confirmedNotOnInstagram")) === "1",
    });
    return done(
      ok,
      "Terug bij 'te keuren'. Kies een tijdstip en keur opnieuw goed.",
      "Dat lukte niet.",
    );
  } catch (error) {
    return failure(error);
  }
}

export async function deleteQueuePostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  try {
    const ok = await deleteQueuePost(String(formData.get("id")));
    return done(ok, "Verwijderd.", "Geplaatste posts kun je niet verwijderen.");
  } catch (error) {
    return failure(error);
  }
}

export async function setAutoPostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  const enabled = String(formData.get("enabled")) === "1";
  try {
    await setAutoPostWithoutApproval(enabled);
    return done(
      true,
      enabled
        ? "Automatisch posten staat AAN: voorstellen worden ook zonder goedkeuring geplaatst."
        : "Automatisch posten staat UIT: alleen goedgekeurde posts worden geplaatst.",
      "",
    );
  } catch (error) {
    return failure(error);
  }
}

function parseFormat(raw: string): InstagramFormatId | null {
  return raw === "binnenkort" || raw === "deze_week" || raw === "nieuw"
    ? raw
    : null;
}

/**
 * "Maak een post": build a post from the event catalog (a format, or one
 * specific event). It lands under "Te keuren", set for now or the chosen time.
 */
export async function createPostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  const kind = String(formData.get("kind") ?? "");
  const time = readTime(formData);
  if (time === "invalid") return { ok: false, message: "Ongeldig tijdstip." };
  const scheduledAt = time ?? nextDailyPostTime();
  try {
    const catalog = await listEvents();
    let draft;
    if (kind === "event") {
      const eventId = String(formData.get("eventId") ?? "");
      const event = listSingleEventCandidates(catalog).find((e) => e.id === eventId);
      if (!event) return { ok: false, message: "Kies een event uit de lijst." };
      draft = buildSingleEventDraft(event);
    } else {
      const format = parseFormat(kind);
      if (!format) return { ok: false, message: "Kies wat voor post je wilt." };
      draft = buildInstagramDraft(format, catalog, {
        now: scheduledAt,
        recentlyUsedIds: await getRecentlyUsedEventIds(21),
      });
      // Too few fresh events: allow events that were used recently.
      draft ??= buildInstagramDraft(format, catalog, { now: scheduledAt });
      if (!draft) {
        return {
          ok: false,
          message: "Te weinig geschikte events voor dit soort post.",
        };
      }
    }
    const jpegs = await renderDraftJpegs(draft, catalog);
    const created = await createQueuePost({
      jpegs,
      storyJpeg: await renderStoryOrNull(jpegs[0]!),
      postStory: String(formData.get("postStory") ?? "1") === "1",
      caption: draft.caption,
      scheduledAt,
      status: "te_keuren",
      source: "manual",
      format: kind === "event" ? "event" : draft.format,
      eventIds: draft.eventIds,
      reelProps: prepareReelProps(draft, scheduledAt),
    });
    if (created) await recordConceptEventIds(draft.eventIds);
    return done(
      Boolean(created),
      "Post gemaakt. Bekijk hem hieronder en klik Nu plaatsen of Goedkeuren.",
      "Post maken lukte niet.",
    );
  } catch (error) {
    return failure(error);
  }
}

/** Approve (with the edited caption) and publish immediately. */
export async function publishNowAction(
  formData: FormData,
): Promise<QueueActionResult> {
  const admin = await guard();
  if (!admin) return UNAUTHORIZED;
  const id = String(formData.get("id"));
  const caption = String(formData.get("caption") ?? "").trim();
  if (!caption) return { ok: false, message: "Caption is leeg." };
  try {
    const approved = await approveQueuePost(id, {
      caption,
      scheduledAt: new Date(),
      approvedBy: admin.email,
      postStory: readPostStory(formData),
    });
    if (!approved) {
      return { ok: false, message: "Deze post wordt al geplaatst of is al geplaatst." };
    }
    const result = await publishQueuePostNow(id);
    revalidatePath(PATH);
    return { ok: result.ok, message: result.message };
  } catch (error) {
    revalidatePath(PATH);
    return failure(error);
  }
}

/** Place (or retry) the story of a post that is already on Instagram. */
export async function publishStoryAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  try {
    const result = await publishStoryNow(String(formData.get("id")));
    revalidatePath(PATH);
    return result;
  } catch (error) {
    revalidatePath(PATH);
    return failure(error);
  }
}

/** "Reel opnieuw maken": queue a fresh render (same events, same hook). */
export async function remakeReelAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  try {
    const ok = await requestReelRender(String(formData.get("id")));
    return done(
      ok,
      "De reel wordt opnieuw gemaakt. Dat duurt tot een uur.",
      "Voor deze post kan geen reel meer gemaakt worden.",
    );
  } catch (error) {
    return failure(error);
  }
}
