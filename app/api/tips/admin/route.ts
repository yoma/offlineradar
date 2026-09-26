import { NextResponse } from "next/server";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { runTipAiScan } from "@/lib/tips/ai-scan";
import {
  createConceptEventFromTip,
  linkTipToExistingEvent,
} from "@/lib/tips/create-concept-event";
import {
  neonFindTipById,
  neonUpsertSourceWatch,
} from "@/lib/tips/neon-store";
import {
  clearTipContactEmail,
  listTipEmailHistory,
  previewTipStatusMail,
  sendTipStatusMailExplicit,
} from "@/lib/tips/send-status-mail";
import { listTips, updateTipStatus } from "@/lib/tips/service";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";
import { TIP_STATUSES, type TipStatus } from "@/types/tips";

export const dynamic = "force-dynamic";

function deny(reason: string) {
  if (reason === "forbidden") {
    return NextResponse.json(
      { ok: false, error: "Geen beheerrechten." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: false, error: "Niet beschikbaar." }, { status: 404 });
}

export async function GET() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) return deny(access.reason);

  const snapshot = await listTips();
  if (!snapshot) return deny("store_disabled");
  return NextResponse.json(snapshot);
}

export async function PATCH(request: Request) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) return deny(access.reason);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const tipId = typeof record.tipId === "string" ? record.tipId : "";
  const status = record.status;
  if (!tipId || typeof status !== "string" || !TIP_STATUSES.includes(status as TipStatus)) {
    return NextResponse.json({ ok: false, error: "Ongeldige status." }, { status: 400 });
  }

  const result = await updateTipStatus({
    tipId,
    status: status as TipStatus,
    decisionReason:
      typeof record.decisionReason === "string" ? record.decisionReason : null,
    publishedEventPath:
      typeof record.publishedEventPath === "string"
        ? record.publishedEventPath
        : null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Admin-only tip actions. Never auto-publishes events.
 */
export async function POST(request: Request) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) return deny(access.reason);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const action = typeof record.action === "string" ? record.action : "";
  const tipId = typeof record.tipId === "string" ? record.tipId : "";

  if (!tipId) {
    return NextResponse.json(
      { ok: false, error: "tipId ontbreekt." },
      { status: 400 },
    );
  }

  if (action === "start_ai_scan") {
    const result = await runTipAiScan(tipId);
    if (!result.ok) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "inflight" || result.code === "fresh"
            ? 409
            : result.code === "missing_key"
              ? 503
              : result.code === "source_unavailable"
                ? 422
                : 500;
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
          prep: result.prep ?? null,
        },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      reused: result.reused,
      tipId: result.tip.id,
      status: result.tip.status,
      prep: result.prep,
      published: false,
      autoApproved: false,
    });
  }

  if (action === "create_concept_event") {
    const forceCreate = record.forceCreate === true;
    const result = await createConceptEventFromTip({ tipId, forceCreate });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
          duplicates: result.duplicates ?? null,
          linkedEdition: result.linkedEdition ?? null,
        },
        { status: result.code === "duplicate_candidates" ? 409 : 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      editionId: result.edition.id,
      slug: result.edition.slug,
      publicationStatus: result.edition.publicationStatus,
      interneEventsPath: "/interne-events",
      eventPath: `/event/${result.edition.slug}`,
    });
  }

  if (action === "link_existing_event") {
    const eventEditionId =
      typeof record.eventEditionId === "string" ? record.eventEditionId : "";
    if (!eventEditionId) {
      return NextResponse.json(
        { ok: false, error: "eventEditionId ontbreekt." },
        { status: 400 },
      );
    }
    const result = await linkTipToExistingEvent({ tipId, eventEditionId });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      editionId: result.edition.id,
      slug: result.edition.slug,
      publicationStatus: result.edition.publicationStatus,
    });
  }

  if (action === "add_source_watch") {
    const found = await neonFindTipById(tipId);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: "Tip niet gevonden." },
        { status: 404 },
      );
    }
    const urlResult = validateAndNormalizeTipUrl(found.tip.originalUrl);
    if (!urlResult.ok) {
      return NextResponse.json(
        { ok: false, error: urlResult.error },
        { status: 400 },
      );
    }
    const name =
      found.review.aiPrep?.proposedOrganizer?.trim() ||
      new URL(found.tip.originalUrl).hostname;
    const sourceId = await neonUpsertSourceWatch({
      officialUrl: found.tip.originalUrl,
      normalizedUrl: urlResult.normalizedUrl,
      organizerOrSeriesName: name,
      whyInteresting:
        found.review.aiPrep?.suggestSourceWatchReason ||
        "Handmatig toegevoegd vanuit tipwachtrij.",
      tipId,
    });
    return NextResponse.json({ ok: true, sourceId });
  }

  if (action === "preview_status_mail") {
    const mailStatus =
      typeof record.mailStatus === "string" &&
      TIP_STATUSES.includes(record.mailStatus as TipStatus)
        ? (record.mailStatus as TipStatus)
        : null;
    const result = await previewTipStatusMail({
      tipId,
      mailStatus,
      requestOrigin: new URL(request.url).origin,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: result.code === "not_found" ? 404 : 400 },
      );
    }
    return NextResponse.json({ ok: true, preview: result.preview });
  }

  if (action === "send_status_mail") {
    // Recipient, subject, and body are never taken from the client.
    const mailStatus =
      typeof record.mailStatus === "string" &&
      TIP_STATUSES.includes(record.mailStatus as TipStatus)
        ? (record.mailStatus as TipStatus)
        : null;
    const result = await sendTipStatusMailExplicit({
      tipId,
      mailStatus,
      requestOrigin: new URL(request.url).origin,
    });
    if (!result.ok) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "provider_not_configured"
            ? 503
            : result.code === "provider_error"
              ? 502
              : 400;
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: result.error,
          code: result.code,
          preview: result.preview ?? null,
        },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      sent: result.sent,
      skipped: result.skipped ?? null,
      messageId: result.messageId ?? null,
      preview: result.preview,
    });
  }

  if (action === "list_email_history") {
    const logs = await listTipEmailHistory(tipId);
    return NextResponse.json({ ok: true, logs });
  }

  if (action === "clear_contact_email") {
    const result = await clearTipContactEmail(tipId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: result.code === "not_found" ? 404 : 400 },
      );
    }
    return NextResponse.json({ ok: true, cleared: true });
  }

  return NextResponse.json(
    { ok: false, error: "Onbekende of onvolledige actie." },
    { status: 400 },
  );
}
