"use server";

import { revalidatePath } from "next/cache";
import { listEvents } from "@/lib/events";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import { buildInstagramDraft } from "@/lib/instagram/drafts";
import {
  getRecentlyUsedEventIds,
  recordConceptEventIds,
} from "@/lib/instagram/history";
import {
  approveQueuePost,
  createQueuePost,
  deleteQueuePost,
  rejectQueuePost,
  resetFailedQueuePost,
  setAutoPostWithoutApproval,
  submitQueuePostForReview,
  updateQueuePost,
} from "@/lib/instagram/queue";
import { ingestExternalImage, renderDraftJpegs } from "@/lib/instagram/queue-media";
import { fromBrusselsLocalInput } from "@/lib/instagram/queue-time";
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

function readTime(formData: FormData): Date | null | "invalid" {
  const raw = String(formData.get("scheduledAt") ?? "").trim();
  if (!raw) return null;
  return fromBrusselsLocalInput(raw) ?? "invalid";
}

function failure(error: unknown): QueueActionResult {
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Er ging iets mis.",
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
    });
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
    });
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
    const ok = await resetFailedQueuePost(String(formData.get("id")));
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

/** Build a fresh proposal from the event catalog (same logic as the cron). */
export async function createProposalAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  const format = parseFormat(String(formData.get("format") ?? ""));
  const time = readTime(formData);
  if (!format) return { ok: false, message: "Kies een soort post." };
  if (!time || time === "invalid") {
    return { ok: false, message: "Kies een datum en tijd." };
  }
  try {
    const catalog = await listEvents();
    const draft = buildInstagramDraft(format, catalog, {
      now: time,
      recentlyUsedIds: await getRecentlyUsedEventIds(21),
    });
    if (!draft) {
      return {
        ok: false,
        message: "Te weinig geschikte events voor dit soort post op dat moment.",
      };
    }
    const created = await createQueuePost({
      jpegs: await renderDraftJpegs(draft, catalog),
      caption: draft.caption,
      scheduledAt: time,
      status: "te_keuren",
      source: "manual",
      format,
      eventIds: draft.eventIds,
    });
    if (created) await recordConceptEventIds(draft.eventIds);
    return done(Boolean(created), "Voorstel gemaakt.", "Voorstel maken lukte niet.");
  } catch (error) {
    return failure(error);
  }
}

/** Own post from image links: images are downloaded and stored as JPEG. */
export async function createCustomPostAction(
  formData: FormData,
): Promise<QueueActionResult> {
  if (!(await guard())) return UNAUTHORIZED;
  const urls = String(formData.get("imageUrls") ?? "")
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean);
  const caption = String(formData.get("caption") ?? "").trim();
  const time = readTime(formData);
  if (urls.length < 1 || urls.length > 10) {
    return { ok: false, message: "Geef 1 tot 10 afbeeldingslinks (één per regel)." };
  }
  if (!caption) return { ok: false, message: "Caption is leeg." };
  if (!time || time === "invalid") {
    return { ok: false, message: "Kies een datum en tijd." };
  }
  try {
    const jpegs: Buffer[] = [];
    for (const url of urls) jpegs.push(await ingestExternalImage(url));
    const created = await createQueuePost({
      jpegs,
      caption,
      scheduledAt: time,
      status: "te_keuren",
      source: "manual",
    });
    return done(Boolean(created), "Post toegevoegd.", "Toevoegen lukte niet.");
  } catch (error) {
    return failure(error);
  }
}
