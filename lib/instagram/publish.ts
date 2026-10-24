/**
 * Phase 3B: publish an approved Instagram concept via Meta Graph API.
 * Default mode is disabled; dry-run makes no Meta HTTP calls.
 */

import { appPublicBaseUrl } from "@/lib/email/app-brand";
import { listEvents } from "@/lib/events";
import type { InstagramDraft } from "@/lib/instagram/drafts";
import { assertConceptContentApproved } from "@/lib/instagram/approvals";
import {
  buildInstagramConceptKey,
  buildInstagramContentFingerprint,
  type InstagramSlideApproval,
} from "@/lib/instagram/concept-key";
import {
  liveEventsMatchSnapshots,
  type InstagramEventSnapshot,
} from "@/lib/instagram/event-snapshot";
import { recordConceptEventIds } from "@/lib/instagram/history";
import {
  createMetaClient,
  humanMetaPublishError,
  waitForContainerFinished,
  type MetaClient,
} from "@/lib/instagram/meta-client";
import {
  metaPublishModeLabel,
  readInstagramMetaConfig,
} from "@/lib/instagram/meta-config";
import {
  canReleasePendingForStatus,
  isAmbiguousPostPublishError,
  META_CAROUSEL_TOTAL_BUDGET_MS,
} from "@/lib/instagram/publish-policy";
import {
  acquireRecoveryLease,
  claimPublishAttempt,
  finishPublishAttempt,
  findActivePublish,
  isPublishPendingStale,
  markPublishUncertain,
  persistContainerIdBeforePublish,
  type InstagramPublishRow,
} from "@/lib/instagram/publish-store";
import {
  buildPublicMediaUrl,
  createInstagramMediaTicket,
} from "@/lib/instagram/signed-media";

export type PublishInstagramConceptInput = {
  draft: Pick<
    InstagramDraft,
    "format" | "eventIds" | "caption" | "slides"
  >;
  requestedBy?: string | null;
  publicBaseUrl?: string;
  metaClient?: MetaClient;
  /** Tests only — skip Neon approval gate. */
  skipApprovalCheck?: boolean;
  /** Tests only — frozen snapshots when skipApprovalCheck is set. */
  eventSnapshots?: InstagramEventSnapshot[];
  /**
   * When false, skip live-catalog drift check (tests). Default true.
   * Meta public-media still always renders from approved snapshots via ticket fp.
   */
  checkLiveEventDrift?: boolean;
  /** Tests only — inject persistence / approval collaborators. */
  deps?: Partial<PublishCollaborators>;
};

export type PublishCollaborators = {
  claimPublishAttempt: typeof claimPublishAttempt;
  persistContainerIdBeforePublish: typeof persistContainerIdBeforePublish;
  finishPublishAttempt: typeof finishPublishAttempt;
  markPublishUncertain: typeof markPublishUncertain;
  acquireRecoveryLease: typeof acquireRecoveryLease;
  findActivePublish: typeof findActivePublish;
  assertConceptContentApproved: typeof assertConceptContentApproved;
  recordConceptEventIds: typeof recordConceptEventIds;
};

export type PublishInstagramConceptResult =
  | {
      ok: true;
      mode: "dry_run" | "live";
      publish: InstagramPublishRow;
      message: string;
      /** False when Meta may be live but Neon finish was not confirmed. */
      durableLogConfirmed: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
      publish?: InstagramPublishRow | null;
    };

function collaborators(
  deps?: Partial<PublishCollaborators>,
): PublishCollaborators {
  return {
    claimPublishAttempt: deps?.claimPublishAttempt ?? claimPublishAttempt,
    persistContainerIdBeforePublish:
      deps?.persistContainerIdBeforePublish ?? persistContainerIdBeforePublish,
    finishPublishAttempt: deps?.finishPublishAttempt ?? finishPublishAttempt,
    markPublishUncertain: deps?.markPublishUncertain ?? markPublishUncertain,
    acquireRecoveryLease: deps?.acquireRecoveryLease ?? acquireRecoveryLease,
    findActivePublish: deps?.findActivePublish ?? findActivePublish,
    assertConceptContentApproved:
      deps?.assertConceptContentApproved ?? assertConceptContentApproved,
    recordConceptEventIds: deps?.recordConceptEventIds ?? recordConceptEventIds,
  };
}

function buildSlidePublicUrls(
  draft: PublishInstagramConceptInput["draft"],
  publicBaseUrl: string,
  contentFingerprint: string,
):
  | { ok: true; urls: string[] }
  | { ok: false; code: string; message: string } {
  if (draft.slides.length === 0) {
    return {
      ok: false,
      code: "no_slides",
      message: humanMetaPublishError("no_slides"),
    };
  }
  if (draft.slides.length > 10) {
    return {
      ok: false,
      code: "too_many_slides",
      message: "Instagram staat maximaal 10 slides in een carrousel toe.",
    };
  }

  const urls: string[] = [];
  for (const slide of draft.slides) {
    const ticket = createInstagramMediaTicket(
      slide.kind,
      slide.query,
      contentFingerprint,
    );
    if ("error" in ticket) {
      return {
        ok: false,
        code: "missing_signing_secret",
        message: humanMetaPublishError(
          "missing_signing_secret",
          ticket.error,
        ),
      };
    }
    urls.push(buildPublicMediaUrl(publicBaseUrl, ticket.token));
  }
  return { ok: true, urls };
}

function stubSnapshotsFromEventIds(
  eventIds: readonly string[],
): InstagramEventSnapshot[] {
  return eventIds.map((id) => ({
    id,
    title: "",
    startDate: "",
    startTime: null,
    city: "",
    venue: null,
    organizerName: "",
    imageUrl: null,
  }));
}

async function assertNoLiveEventDrift(
  eventIds: readonly string[],
  snapshots: readonly InstagramEventSnapshot[],
): Promise<
  | { ok: true }
  | { ok: false; code: "event_drift"; message: string }
> {
  let catalog: Awaited<ReturnType<typeof listEvents>>;
  try {
    catalog = await listEvents();
  } catch {
    return {
      ok: false,
      code: "event_drift",
      message: humanMetaPublishError(
        "event_drift",
        "Live catalogus niet bereikbaar voor driftcontrole.",
      ),
    };
  }
  if (!liveEventsMatchSnapshots(catalog, snapshots, eventIds)) {
    return {
      ok: false,
      code: "event_drift",
      message: humanMetaPublishError("event_drift"),
    };
  }
  return { ok: true };
}

async function prepareContainersOnly(args: {
  client: MetaClient;
  caption: string;
  imageUrls: string[];
  deadlineMs: number;
}): Promise<
  | { ok: true; containerId: string }
  | { ok: false; code: string; message: string; containerId?: string }
> {
  const { client, caption, imageUrls, deadlineMs } = args;
  const guard = () => {
    if (Date.now() > deadlineMs) {
      return {
        ok: false as const,
        code: "meta_container_timeout",
        message: humanMetaPublishError(
          "meta_container_timeout",
          "Carrousel-totaalbudget overschreden.",
        ),
      };
    }
    return null;
  };

  if (imageUrls.length === 1) {
    const created = await client.createImageContainer({
      imageUrl: imageUrls[0]!,
      caption,
    });
    if (!created.ok) {
      return {
        ok: false,
        code: created.error.code,
        message: humanMetaPublishError(
          created.error.code,
          created.error.message,
        ),
      };
    }
    const ready = await waitForContainerFinished(client, created.data.id);
    if (!ready.ok) {
      return {
        ok: false,
        code: ready.error.code,
        message: humanMetaPublishError(ready.error.code, ready.error.message),
        containerId: created.data.id,
      };
    }
    return { ok: true, containerId: created.data.id };
  }

  if (imageUrls.length < 2) {
    return {
      ok: false,
      code: "carousel_too_small",
      message: humanMetaPublishError("carousel_too_small"),
    };
  }

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const over = guard();
    if (over) return over;
    const child = await client.createImageContainer({
      imageUrl,
      isCarouselItem: true,
    });
    if (!child.ok) {
      return {
        ok: false,
        code: child.error.code,
        message: humanMetaPublishError(child.error.code, child.error.message),
      };
    }
    const ready = await waitForContainerFinished(client, child.data.id);
    if (!ready.ok) {
      return {
        ok: false,
        code: ready.error.code,
        message: humanMetaPublishError(ready.error.code, ready.error.message),
        containerId: child.data.id,
      };
    }
    childIds.push(child.data.id);
  }

  const over = guard();
  if (over) return over;

  const carousel = await client.createCarouselContainer({
    children: childIds,
    caption,
  });
  if (!carousel.ok) {
    return {
      ok: false,
      code: carousel.error.code,
      message: humanMetaPublishError(
        carousel.error.code,
        carousel.error.message,
      ),
    };
  }
  const carouselReady = await waitForContainerFinished(
    client,
    carousel.data.id,
  );
  if (!carouselReady.ok) {
    return {
      ok: false,
      code: carouselReady.error.code,
      message: humanMetaPublishError(
        carouselReady.error.code,
        carouselReady.error.message,
      ),
      containerId: carousel.data.id,
    };
  }
  return { ok: true, containerId: carousel.data.id };
}

/** Exported for offline carousel regression tests. */
export async function publishLiveToMeta(args: {
  client: MetaClient;
  caption: string;
  imageUrls: string[];
}): Promise<
  | { ok: true; containerId: string; mediaId: string }
  | { ok: false; code: string; message: string; containerId?: string }
> {
  const prepared = await prepareContainersOnly({
    ...args,
    deadlineMs: Date.now() + META_CAROUSEL_TOTAL_BUDGET_MS,
  });
  if (!prepared.ok) return prepared;
  const published = await args.client.publishContainer(prepared.containerId);
  if (!published.ok) {
    return {
      ok: false,
      code: published.error.code,
      message: humanMetaPublishError(
        published.error.code,
        published.error.message,
      ),
      containerId: prepared.containerId,
    };
  }
  return {
    ok: true,
    containerId: prepared.containerId,
    mediaId: published.data.id,
  };
}

async function recoverStaleAttempt(args: {
  row: InstagramPublishRow;
  client: MetaClient | null;
  mode: "live" | "dry_run";
  collab: PublishCollaborators;
}): Promise<PublishInstagramConceptResult | null> {
  const { row, client, mode, collab } = args;
  if (row.status !== "pending" && row.status !== "uncertain") return null;
  if (!isPublishPendingStale(row)) return null;

  // Dry-run must never touch a live attempt.
  if (mode === "dry_run" && !row.dryRun) {
    return {
      ok: false,
      code: "dry_run_blocked_by_live",
      message: humanMetaPublishError("dry_run_blocked_by_live"),
      publish: row,
    };
  }

  const leased = await collab.acquireRecoveryLease(row.id);
  if (!leased) {
    return {
      ok: false,
      code: "recovery_in_progress",
      message: humanMetaPublishError("recovery_in_progress"),
      publish: row,
    };
  }

  if (leased.metaMediaId) {
    const finished = await collab.finishPublishAttempt(leased.id, {
      status: "published",
      metaMediaId: leased.metaMediaId,
      metaContainerId: leased.metaContainerId,
      errorCode: null,
      errorMessage: null,
    });
    if (!finished) {
      return {
        ok: false,
        code: "durable_log_failed",
        message: humanMetaPublishError("durable_log_failed"),
        publish: leased,
      };
    }
    return {
      ok: true,
      mode: "live",
      publish: finished,
      message: `Eerdere publicatie hersteld (media id ${leased.metaMediaId}).`,
      durableLogConfirmed: true,
    };
  }

  const decision = canReleasePendingForStatus({
    statusOk: false,
    hasContainerId: Boolean(leased.metaContainerId),
    mode,
    rowIsLiveAttempt: !leased.dryRun,
  });

  if (!leased.metaContainerId) {
    if (decision === "safe_to_fail_no_container" && mode === "live") {
      const failed = await collab.finishPublishAttempt(leased.id, {
        status: "failed",
        errorCode: "stale_pending",
        errorMessage: "Pending verlopen vóór Meta media_publish (geen container).",
      });
      return {
        ok: false,
        code: "stale_pending",
        message:
          "Eerdere poging is verlopen zonder Meta-publicatie. Je kunt opnieuw publiceren.",
        publish: failed,
      };
    }
    return {
      ok: false,
      code: "publish_in_progress",
      message: humanMetaPublishError("publish_in_progress"),
      publish: leased,
    };
  }

  if (!client) {
    // Missing credentials / dry-run: keep live slot blocked.
    return {
      ok: false,
      code: mode === "dry_run" ? "dry_run_blocked_by_live" : "publish_uncertain",
      message: humanMetaPublishError(
        mode === "dry_run" ? "dry_run_blocked_by_live" : "publish_uncertain",
      ),
      publish: leased,
    };
  }

  const status = await client.getContainerStatus(leased.metaContainerId);
  const action = canReleasePendingForStatus({
    statusOk: status.ok,
    statusCode: status.ok
      ? (status.data.status_code ?? status.data.status)
      : null,
    hasContainerId: true,
    mode,
    rowIsLiveAttempt: !leased.dryRun,
  });

  if (action === "confirm_published") {
    // Confirmed live on Meta, but container GET id is NOT a media id.
    const finished = await collab.finishPublishAttempt(leased.id, {
      status: "published",
      metaContainerId: leased.metaContainerId,
      metaMediaId: null,
      errorCode: null,
      errorMessage: null,
    });
    if (!finished) {
      return {
        ok: false,
        code: "durable_log_failed",
        message: humanMetaPublishError("durable_log_failed"),
        publish: leased,
      };
    }
    return {
      ok: true,
      mode: "live",
      publish: finished,
      message:
        "Eerdere Meta-publicatie bevestigd (PUBLISHED). Media-id onbekend — niet verzonnen.",
      durableLogConfirmed: true,
    };
  }

  if (action === "resume_finished") {
    const published = await client.publishContainer(leased.metaContainerId);
    if (published.ok) {
      const finished = await collab.finishPublishAttempt(leased.id, {
        status: "published",
        metaContainerId: leased.metaContainerId,
        metaMediaId: published.data.id,
        errorCode: null,
        errorMessage: null,
      });
      if (!finished) {
        return {
          ok: false,
          code: "durable_log_failed",
          message: humanMetaPublishError("durable_log_failed"),
          publish: leased,
        };
      }
      return {
        ok: true,
        mode: "live",
        publish: finished,
        message: `Publicatie hervat (media id ${published.data.id}).`,
        durableLogConfirmed: true,
      };
    }

    if (published.error.code === "meta_already_published") {
      const finished = await collab.finishPublishAttempt(leased.id, {
        status: "published",
        metaContainerId: leased.metaContainerId,
        metaMediaId: null,
        errorCode: null,
        errorMessage: null,
      });
      if (!finished) {
        return {
          ok: false,
          code: "durable_log_failed",
          message: humanMetaPublishError("durable_log_failed"),
          publish: leased,
        };
      }
      return {
        ok: true,
        mode: "live",
        publish: finished,
        message:
          "Meta meldde dat de post al live stond. Media-id onbekend — slot gesloten als published.",
        durableLogConfirmed: true,
      };
    }

    if (isAmbiguousPostPublishError(published.error.code)) {
      const uncertain = await collab.markPublishUncertain(leased.id, {
        metaContainerId: leased.metaContainerId,
        errorCode: "publish_uncertain",
        errorMessage: published.error.message,
      });
      return {
        ok: false,
        code: "publish_uncertain",
        message: humanMetaPublishError(
          "publish_uncertain",
          published.error.message,
        ),
        publish: uncertain ?? leased,
      };
    }

    // Definitive media_publish failure with known container — keep blocked
    // (do not free; admin must inspect). Still mark uncertain not failed.
    const uncertain = await collab.markPublishUncertain(leased.id, {
      metaContainerId: leased.metaContainerId,
      errorCode: published.error.code,
      errorMessage: published.error.message,
    });
    return {
      ok: false,
      code: "publish_uncertain",
      message: humanMetaPublishError(
        "publish_uncertain",
        published.error.message,
      ),
      publish: uncertain ?? leased,
    };
  }

  // keep_blocked for IN_PROGRESS / unknown / status lookup failure
  return {
    ok: false,
    code: "publish_uncertain",
    message: humanMetaPublishError(
      "publish_uncertain",
      status.ok
        ? `Containerstatus: ${status.data.status_code ?? status.data.status ?? "UNKNOWN"}`
        : status.error.message,
    ),
    publish: leased,
  };
}

export async function publishInstagramConcept(
  input: PublishInstagramConceptInput,
): Promise<PublishInstagramConceptResult> {
  const config = readInstagramMetaConfig();
  if (config.mode === "disabled") {
    return {
      ok: false,
      code: "disabled",
      message: humanMetaPublishError("disabled"),
    };
  }

  const collab = collaborators(input.deps);
  const dryRun = config.mode === "dry_run";
  const mode: "live" | "dry_run" = dryRun ? "dry_run" : "live";

  const slides = input.draft.slides as InstagramSlideApproval[];
  const conceptKey = buildInstagramConceptKey(
    input.draft.format,
    input.draft.eventIds,
  );

  let eventSnapshots: InstagramEventSnapshot[];
  let contentFingerprint: string;

  if (!input.skipApprovalCheck) {
    const approval = await collab.assertConceptContentApproved({
      format: input.draft.format,
      eventIds: input.draft.eventIds,
      caption: input.draft.caption,
      slides,
    });
    if (!approval.ok) {
      return {
        ok: false,
        code: approval.code,
        message: approval.message,
      };
    }
    eventSnapshots = approval.eventSnapshots;
    contentFingerprint = approval.contentFingerprint;

    if (input.checkLiveEventDrift !== false) {
      const drift = await assertNoLiveEventDrift(
        input.draft.eventIds,
        eventSnapshots,
      );
      if (!drift.ok) {
        return {
          ok: false,
          code: drift.code,
          message: drift.message,
        };
      }
    }
  } else {
    eventSnapshots =
      input.eventSnapshots ?? stubSnapshotsFromEventIds(input.draft.eventIds);
    contentFingerprint = buildInstagramContentFingerprint({
      format: input.draft.format,
      eventIds: input.draft.eventIds,
      caption: input.draft.caption,
      slides,
      eventSnapshots,
    });
  }

  const claim = await collab.claimPublishAttempt({
    conceptKey,
    format: input.draft.format,
    eventIds: input.draft.eventIds,
    caption: input.draft.caption,
    slideCount: input.draft.slides.length,
    dryRun,
    contentFingerprint,
    requestedBy: input.requestedBy ?? null,
  });

  if (!claim.ok) {
    const code =
      claim.error === "neon_unavailable" ? "neon_unavailable" : "claim_failed";
    return {
      ok: false,
      code,
      message: humanMetaPublishError(
        code === "neon_unavailable" ? "neon_unavailable" : "publish_in_progress",
        claim.detail,
      ),
    };
  }

  if (!claim.created) {
    if (claim.row.status === "published") {
      return {
        ok: false,
        code: "already_published",
        message: humanMetaPublishError("already_published"),
        publish: claim.row,
      };
    }

    // Fresh pending/uncertain stays blocked; only stale rows may recover.
    if (!isPublishPendingStale(claim.row)) {
      return {
        ok: false,
        code:
          claim.row.status === "uncertain"
            ? "publish_uncertain"
            : "publish_in_progress",
        message: humanMetaPublishError(
          claim.row.status === "uncertain"
            ? "publish_uncertain"
            : "publish_in_progress",
        ),
        publish: claim.row,
      };
    }

    const recoveryClient =
      dryRun || config.missingForLive.length > 0
        ? null
        : (input.metaClient ??
          createMetaClient({
            igUserId: config.igUserId!,
            accessToken: config.accessToken!,
            graphApiVersion: config.graphApiVersion,
            graphHost: config.graphHost,
          }));

    const recovered = await recoverStaleAttempt({
      row: claim.row,
      client: recoveryClient,
      mode,
      collab,
    });
    if (recovered) {
      if (recovered.ok) {
        await collab.recordConceptEventIds(input.draft.eventIds);
      }
      // Only continue to a new claim when recovery safely failed a
      // pre-publish pending (no container). Never after uncertain/live.
      if (
        recovered.ok === false &&
        recovered.code === "stale_pending" &&
        !claim.row.metaContainerId
      ) {
        const reclaimed = await collab.claimPublishAttempt({
          conceptKey,
          format: input.draft.format,
          eventIds: input.draft.eventIds,
          caption: input.draft.caption,
          slideCount: input.draft.slides.length,
          dryRun,
          contentFingerprint,
          requestedBy: input.requestedBy ?? null,
        });
        if (reclaimed.ok && reclaimed.created) {
          return continueFreshPublish({
            input,
            claimRow: reclaimed.row,
            conceptKey,
            contentFingerprint,
            dryRun,
            config,
            collab,
          });
        }
      }
      return recovered;
    }
  }

  return continueFreshPublish({
    input,
    claimRow: claim.row,
    conceptKey,
    contentFingerprint,
    dryRun,
    config,
    collab,
  });
}

async function continueFreshPublish(args: {
  input: PublishInstagramConceptInput;
  claimRow: InstagramPublishRow;
  conceptKey: string;
  contentFingerprint: string;
  dryRun: boolean;
  config: ReturnType<typeof readInstagramMetaConfig>;
  collab: PublishCollaborators;
}): Promise<PublishInstagramConceptResult> {
  const { input, claimRow, dryRun, config, collab } = args;
  const draft = input.draft;

  const publicBaseUrl =
    input.publicBaseUrl?.replace(/\/$/, "") || appPublicBaseUrl();
  const urls = buildSlidePublicUrls(
    draft,
    publicBaseUrl,
    args.contentFingerprint,
  );
  if (!urls.ok) {
    const failed = await collab.finishPublishAttempt(claimRow.id, {
      status: "failed",
      errorCode: urls.code,
      errorMessage: urls.message,
    });
    return {
      ok: false,
      code: urls.code,
      message: urls.message,
      publish: failed,
    };
  }

  if (dryRun) {
    await collab.recordConceptEventIds(draft.eventIds);
    const finished = await collab.finishPublishAttempt(claimRow.id, {
      status: "dry_run",
      errorCode: null,
      errorMessage: null,
    });
    if (!finished) {
      return {
        ok: false,
        code: "durable_log_failed",
        message: humanMetaPublishError("durable_log_failed"),
        publish: claimRow,
      };
    }
    return {
      ok: true,
      mode: "dry_run",
      publish: finished,
      message: `Dry-run OK (${metaPublishModeLabel("dry_run")}). ${urls.urls.length} publieke JPEG-URL(s) voorbereid; geen Meta-aanroep.`,
      durableLogConfirmed: true,
    };
  }

  if (config.missingForLive.length > 0) {
    const message = humanMetaPublishError(
      "missing_credentials",
      `Ontbrekend: ${config.missingForLive.join(", ")}.`,
    );
    const failed = await collab.finishPublishAttempt(claimRow.id, {
      status: "failed",
      errorCode: "missing_credentials",
      errorMessage: message,
    });
    return {
      ok: false,
      code: "missing_credentials",
      message,
      publish: failed,
    };
  }

  const client =
    input.metaClient ??
    createMetaClient({
      igUserId: config.igUserId!,
      accessToken: config.accessToken!,
      graphApiVersion: config.graphApiVersion,
      graphHost: config.graphHost,
    });

  const prepared = await prepareContainersOnly({
    client,
    caption: draft.caption,
    imageUrls: urls.urls,
    deadlineMs: Date.now() + META_CAROUSEL_TOTAL_BUDGET_MS,
  });
  if (!prepared.ok) {
    const failed = await collab.finishPublishAttempt(claimRow.id, {
      status: "failed",
      metaContainerId: prepared.containerId ?? null,
      errorCode: prepared.code,
      errorMessage: prepared.message,
    });
    return {
      ok: false,
      code: prepared.code,
      message: prepared.message,
      publish: failed,
    };
  }

  const persisted = await collab.persistContainerIdBeforePublish(
    claimRow.id,
    prepared.containerId,
  );
  if (!persisted || persisted.metaContainerId !== prepared.containerId) {
    // Do NOT call media_publish without durable container id.
    const failed = await collab.finishPublishAttempt(claimRow.id, {
      status: "failed",
      metaContainerId: prepared.containerId,
      errorCode: "container_persist_failed",
      errorMessage: humanMetaPublishError("container_persist_failed"),
    });
    return {
      ok: false,
      code: "container_persist_failed",
      message: humanMetaPublishError("container_persist_failed"),
      publish: failed,
    };
  }

  const published = await client.publishContainer(prepared.containerId);
  if (!published.ok) {
    if (
      published.error.code === "meta_already_published" ||
      isAmbiguousPostPublishError(published.error.code)
    ) {
      if (published.error.code === "meta_already_published") {
        const finished = await collab.finishPublishAttempt(claimRow.id, {
          status: "published",
          metaContainerId: prepared.containerId,
          metaMediaId: null,
          errorCode: null,
          errorMessage: null,
        });
        if (!finished) {
          return {
            ok: false,
            code: "durable_log_failed",
            message: humanMetaPublishError("durable_log_failed"),
            publish: persisted,
          };
        }
        await collab.recordConceptEventIds(draft.eventIds);
        return {
          ok: true,
          mode: "live",
          publish: finished,
          message:
            "Meta meldde already-published. Media-id onbekend; geen verzonnen id opgeslagen.",
          durableLogConfirmed: true,
        };
      }

      const uncertain = await collab.markPublishUncertain(claimRow.id, {
        metaContainerId: prepared.containerId,
        errorCode: "publish_uncertain",
        errorMessage: published.error.message,
      });
      return {
        ok: false,
        code: "publish_uncertain",
        message: humanMetaPublishError(
          "publish_uncertain",
          published.error.message,
        ),
        publish: uncertain ?? persisted,
      };
    }

    const failed = await collab.finishPublishAttempt(claimRow.id, {
      status: "failed",
      metaContainerId: prepared.containerId,
      errorCode: published.error.code,
      errorMessage: published.error.message,
    });
    return {
      ok: false,
      code: published.error.code,
      message: humanMetaPublishError(
        published.error.code,
        published.error.message,
      ),
      publish: failed,
    };
  }

  const finished = await collab.finishPublishAttempt(claimRow.id, {
    status: "published",
    metaContainerId: prepared.containerId,
    metaMediaId: published.data.id,
    errorCode: null,
    errorMessage: null,
  });

  if (!finished || finished.status !== "published") {
    // Meta accepted publish; Neon finish missing — do not free slot / do not claim success as durable.
    await collab.markPublishUncertain(claimRow.id, {
      metaContainerId: prepared.containerId,
      errorCode: "durable_log_failed",
      errorMessage: `Meta media id ${published.data.id} mogelijk live; Neon-finish ontbreekt.`,
    });
    return {
      ok: false,
      code: "durable_log_failed",
      message: humanMetaPublishError(
        "durable_log_failed",
        `Meta media id ${published.data.id}`,
      ),
      publish: persisted,
    };
  }

  await collab.recordConceptEventIds(draft.eventIds);

  return {
    ok: true,
    mode: "live",
    publish: finished,
    message: `Gepubliceerd naar Instagram (media id ${published.data.id}).`,
    durableLogConfirmed: true,
  };
}
