import { NextResponse } from "next/server";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { runTipAiScan } from "@/lib/tips/ai-scan";
import {
  createConceptEventFromTip,
  linkTipToExistingEvent,
} from "@/lib/tips/create-concept-event";
import { buildTipStatusEmail, sendTipEmail } from "@/lib/tips/email";
import {
  neonFindTipById,
  neonHasEmailLog,
  neonUpsertSourceWatch,
} from "@/lib/tips/neon-store";
import { listTips, updateTipStatus } from "@/lib/tips/service";
import { getEditionById } from "@/lib/events/neon-store";
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

  if (action === "send_status_mail") {
    const found = await neonFindTipById(tipId);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: "Tip niet gevonden." },
        { status: 404 },
      );
    }
    if (!found.tip.notifyRequested || !found.tip.email) {
      return NextResponse.json(
        {
          ok: false,
          error: "Geen opt-in e-mail voor deze tip.",
          code: "no_opt_in",
        },
        { status: 400 },
      );
    }
    const status =
      typeof record.mailStatus === "string" &&
      TIP_STATUSES.includes(record.mailStatus as TipStatus)
        ? (record.mailStatus as TipStatus)
        : found.tip.status;

    let publishedAbsoluteUrl: string | null = null;
    if (status === "published") {
      if (!found.tip.linkedEventId) {
        return NextResponse.json(
          {
            ok: false,
            error: "Geen gekoppeld published event voor publicatiemail.",
          },
          { status: 400 },
        );
      }
      const bundle = await getEditionById(found.tip.linkedEventId);
      if (!bundle || bundle.edition.publicationStatus !== "published") {
        return NextResponse.json(
          {
            ok: false,
            error: "Gekoppeld event is niet published.",
          },
          { status: 400 },
        );
      }
      const origin = new URL(request.url).origin;
      publishedAbsoluteUrl = `${origin}/event/${bundle.edition.slug}`;
    }

    const draft = buildTipStatusEmail({
      tipId,
      status,
      email: found.tip.email,
      reason: found.review.decisionReason,
      publishedAbsoluteUrl,
    });
    if (!draft) {
      return NextResponse.json(
        { ok: false, error: "Geen mailtemplate voor deze status." },
        { status: 400 },
      );
    }

    if (await neonHasEmailLog(draft.idempotencyKey)) {
      return NextResponse.json({
        ok: true,
        sent: false,
        skipped: "already_sent",
        idempotencyKey: draft.idempotencyKey,
      });
    }

    const sent = await sendTipEmail(draft);
    if (!sent.sent) {
      return NextResponse.json({
        ok: false,
        sent: false,
        code: sent.reason,
        error:
          "Geen mailprovider geconfigureerd. Templates + idempotency klaar; activeer provider pas na goedkeuring.",
        draftPreview: {
          subject: draft.subject,
          kind: draft.kind,
          idempotencyKey: draft.idempotencyKey,
        },
      });
    }

    return NextResponse.json({ ok: true, sent: true });
  }

  return NextResponse.json(
    { ok: false, error: "Onbekende of onvolledige actie." },
    { status: 400 },
  );
}
