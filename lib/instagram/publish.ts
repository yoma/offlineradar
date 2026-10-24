/**
 * Phase 3B: publish an approved Instagram concept via Meta Graph API.
 * Default mode is disabled; dry-run makes no Meta HTTP calls.
 */

import { appPublicBaseUrl } from "@/lib/email/app-brand";
import type { InstagramDraft } from "@/lib/instagram/drafts";
import { isConceptApproved } from "@/lib/instagram/approvals";
import { buildInstagramConceptKey } from "@/lib/instagram/concept-key";
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
  claimPublishAttempt,
  finishPublishAttempt,
  isPublishPendingStale,
  patchPendingPublish,
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
  /** Override public origin for signed media URLs (tests). */
  publicBaseUrl?: string;
  /** Inject Meta client (tests). */
  metaClient?: MetaClient;
  /** Tests only — skip Neon approval gate. */
  skipApprovalCheck?: boolean;
};

export type PublishInstagramConceptResult =
  | {
      ok: true;
      mode: "dry_run" | "live";
      publish: InstagramPublishRow;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      publish?: InstagramPublishRow | null;
    };

function buildSlidePublicUrls(
  draft: PublishInstagramConceptInput["draft"],
  publicBaseUrl: string,
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
    const ticket = createInstagramMediaTicket(slide.kind, slide.query);
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

/**
 * Create Meta containers + publish. Multi-image uses carousel children.
 * Caller must persist container id before relying on media_publish ack.
 */
export async function publishLiveToMeta(args: {
  client: MetaClient;
  caption: string;
  imageUrls: string[];
}): Promise<
  | { ok: true; containerId: string; mediaId: string }
  | {
      ok: false;
      code: string;
      message: string;
      containerId?: string;
      /** True when Meta indicates the container was already published. */
      alreadyPublished?: boolean;
    }
> {
  const { client, caption, imageUrls } = args;

  if (imageUrls.length === 0) {
    return {
      ok: false,
      code: "no_slides",
      message: humanMetaPublishError("no_slides"),
    };
  }

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
    return finalizeMediaPublish(client, created.data.id);
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
  return finalizeMediaPublish(client, carousel.data.id);
}

async function finalizeMediaPublish(
  client: MetaClient,
  containerId: string,
): Promise<
  | { ok: true; containerId: string; mediaId: string }
  | {
      ok: false;
      code: string;
      message: string;
      containerId?: string;
      alreadyPublished?: boolean;
    }
> {
  const published = await client.publishContainer(containerId);
  if (published.ok) {
    return {
      ok: true,
      containerId,
      mediaId: published.data.id,
    };
  }

  if (published.error.code === "meta_already_published") {
    // Lost-ack recovery: treat as success when Meta says it's already live.
    const status = await client.getContainerStatus(containerId);
    const mediaId =
      status.ok && status.data.id ? status.data.id : `published:${containerId}`;
    return {
      ok: true,
      containerId,
      mediaId,
    };
  }

  return {
    ok: false,
    code: published.error.code,
    message: humanMetaPublishError(
      published.error.code,
      published.error.message,
    ),
    containerId,
    alreadyPublished: published.error.code === "meta_already_published",
  };
}

async function recoverStalePending(args: {
  row: InstagramPublishRow;
  client: MetaClient | null;
}): Promise<PublishInstagramConceptResult | null> {
  const { row, client } = args;
  if (row.status !== "pending" || !isPublishPendingStale(row)) return null;

  // Already have a media id persisted but finish never landed.
  if (row.metaMediaId) {
    const finished = await finishPublishAttempt(row.id, {
      status: "published",
      metaMediaId: row.metaMediaId,
      metaContainerId: row.metaContainerId,
      errorCode: null,
      errorMessage: null,
    });
    return {
      ok: true,
      mode: "live",
      publish: finished ?? row,
      message: `Eerdere publicatie hersteld (media id ${row.metaMediaId}).`,
    };
  }

  if (row.metaContainerId && client) {
    const status = await client.getContainerStatus(row.metaContainerId);
    if (status.ok) {
      const code = status.data.status_code ?? status.data.status;
      if (code === "PUBLISHED") {
        const mediaId = status.data.id ?? `published:${row.metaContainerId}`;
        const finished = await finishPublishAttempt(row.id, {
          status: "published",
          metaContainerId: row.metaContainerId,
          metaMediaId: mediaId,
          errorCode: null,
          errorMessage: null,
        });
        return {
          ok: true,
          mode: "live",
          publish: finished ?? row,
          message: `Eerdere Meta-publicatie bevestigd (media id ${mediaId}).`,
        };
      }
      if (code === "FINISHED") {
        const finalized = await finalizeMediaPublish(
          client,
          row.metaContainerId,
        );
        if (finalized.ok) {
          const finished = await finishPublishAttempt(row.id, {
            status: "published",
            metaContainerId: finalized.containerId,
            metaMediaId: finalized.mediaId,
            errorCode: null,
            errorMessage: null,
          });
          return {
            ok: true,
            mode: "live",
            publish: finished ?? row,
            message: `Publicatie hervat na time-out (media id ${finalized.mediaId}).`,
          };
        }
        if (finalized.alreadyPublished || finalized.code === "meta_already_published") {
          const mediaId = `published:${row.metaContainerId}`;
          const finished = await finishPublishAttempt(row.id, {
            status: "published",
            metaContainerId: row.metaContainerId,
            metaMediaId: mediaId,
            errorCode: null,
            errorMessage: null,
          });
          return {
            ok: true,
            mode: "live",
            publish: finished ?? row,
            message: "Meta meldde dat de post al live stond; Neon bijgewerkt.",
          };
        }
        const failed = await finishPublishAttempt(row.id, {
          status: "failed",
          metaContainerId: row.metaContainerId,
          errorCode: finalized.code,
          errorMessage: finalized.message,
        });
        return {
          ok: false,
          code: finalized.code,
          message: finalized.message,
          publish: failed,
        };
      }
    }

    // Container unusable — free the slot for a clean retry (no known media id).
    const failed = await finishPublishAttempt(row.id, {
      status: "failed",
      metaContainerId: row.metaContainerId,
      errorCode: "stale_pending",
      errorMessage:
        "Eerdere publicatiepoging verlopen zonder bevestigd media-id. Slot vrijgegeven; opnieuw publiceren mag.",
    });
    return {
      ok: false,
      code: "stale_pending",
      message:
        "Eerdere publicatiepoging is verlopen. Probeer opnieuw (controleer Instagram eerst op een dubbele post).",
      publish: failed,
    };
  }

  // No container was persisted — Meta publish was never reached. Safe to free.
  const failed = await finishPublishAttempt(row.id, {
    status: "failed",
    errorCode: "stale_pending",
    errorMessage: "Pending publicatie verlopen vóór Meta media_publish.",
  });
  return {
    ok: false,
    code: "stale_pending",
    message:
      "Eerdere poging is verlopen zonder Meta-publicatie. Je kunt opnieuw publiceren.",
    publish: failed,
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

  const conceptKey = buildInstagramConceptKey(
    input.draft.format,
    input.draft.eventIds,
  );
  const dryRun = config.mode === "dry_run";

  if (!input.skipApprovalCheck) {
    const approved = await isConceptApproved(conceptKey);
    if (!approved) {
      return {
        ok: false,
        code: "not_approved",
        message: humanMetaPublishError("not_approved"),
      };
    }
  }

  const claim = await claimPublishAttempt({
    conceptKey,
    format: input.draft.format,
    eventIds: input.draft.eventIds,
    caption: input.draft.caption,
    slideCount: input.draft.slides.length,
    dryRun,
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

    // Fresh pending → double-click / concurrent request.
    if (!isPublishPendingStale(claim.row)) {
      return {
        ok: false,
        code: "publish_in_progress",
        message: humanMetaPublishError("publish_in_progress"),
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

    const recovered = await recoverStalePending({
      row: claim.row,
      client: recoveryClient,
    });
    if (recovered) {
      if (recovered.ok) {
        await recordConceptEventIds(input.draft.eventIds);
      }
      // If recovery freed the slot (failed stale), fall through to a new claim.
      if (!(recovered.ok === false && recovered.code === "stale_pending")) {
        return recovered;
      }
      // Re-claim after stale fail.
      const reclaimed = await claimPublishAttempt({
        conceptKey,
        format: input.draft.format,
        eventIds: input.draft.eventIds,
        caption: input.draft.caption,
        slideCount: input.draft.slides.length,
        dryRun,
        requestedBy: input.requestedBy ?? null,
      });
      if (!reclaimed.ok || !reclaimed.created) {
        return (
          recovered ?? {
            ok: false,
            code: "publish_in_progress",
            message: humanMetaPublishError("publish_in_progress"),
          }
        );
      }
      // Continue with reclaimed.row below by replacing claim.
      return await continueFreshPublish({
        ...input,
        claimRow: reclaimed.row,
        conceptKey,
        dryRun,
        config,
      });
    }
  }

  return continueFreshPublish({
    ...input,
    claimRow: claim.row,
    conceptKey,
    dryRun,
    config,
  });
}

async function continueFreshPublish(args: {
  draft: PublishInstagramConceptInput["draft"];
  requestedBy?: string | null;
  publicBaseUrl?: string;
  metaClient?: MetaClient;
  claimRow: InstagramPublishRow;
  conceptKey: string;
  dryRun: boolean;
  config: ReturnType<typeof readInstagramMetaConfig>;
}): Promise<PublishInstagramConceptResult> {
  const { draft, claimRow, dryRun, config } = args;

  const publicBaseUrl =
    args.publicBaseUrl?.replace(/\/$/, "") || appPublicBaseUrl();
  const urls = buildSlidePublicUrls(draft, publicBaseUrl);
  if (!urls.ok) {
    const failed = await finishPublishAttempt(claimRow.id, {
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
    // Intentionally no Meta client / HTTP.
    await recordConceptEventIds(draft.eventIds);
    const finished = await finishPublishAttempt(claimRow.id, {
      status: "dry_run",
      errorCode: null,
      errorMessage: null,
    });
    return {
      ok: true,
      mode: "dry_run",
      publish: finished ?? claimRow,
      message: `Dry-run OK (${metaPublishModeLabel("dry_run")}). ${urls.urls.length} publieke JPEG-URL(s) voorbereid; geen Meta-aanroep.`,
    };
  }

  if (config.missingForLive.length > 0) {
    const message = humanMetaPublishError(
      "missing_credentials",
      `Ontbrekend: ${config.missingForLive.join(", ")}.`,
    );
    const failed = await finishPublishAttempt(claimRow.id, {
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
    args.metaClient ??
    createMetaClient({
      igUserId: config.igUserId!,
      accessToken: config.accessToken!,
      graphApiVersion: config.graphApiVersion,
      graphHost: config.graphHost,
    });

  // Build containers first; persist parent container id before media_publish
  // so a lost HTTP response can be recovered without a duplicate post.
  const prepared = await prepareContainersOnly({
    client,
    caption: draft.caption,
    imageUrls: urls.urls,
  });
  if (!prepared.ok) {
    const failed = await finishPublishAttempt(claimRow.id, {
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

  await patchPendingPublish(claimRow.id, {
    metaContainerId: prepared.containerId,
  });

  const finalized = await finalizeMediaPublish(client, prepared.containerId);
  if (!finalized.ok) {
    const failed = await finishPublishAttempt(claimRow.id, {
      status: "failed",
      metaContainerId: prepared.containerId,
      errorCode: finalized.code,
      errorMessage: finalized.message,
    });
    return {
      ok: false,
      code: finalized.code,
      message: finalized.message,
      publish: failed,
    };
  }

  // Persist published BEFORE side-effects so a crash after Meta ack is recoverable.
  const finished = await finishPublishAttempt(claimRow.id, {
    status: "published",
    metaContainerId: finalized.containerId,
    metaMediaId: finalized.mediaId,
    errorCode: null,
    errorMessage: null,
  });

  await recordConceptEventIds(draft.eventIds);

  return {
    ok: true,
    mode: "live",
    publish: finished ?? {
      ...claimRow,
      status: "published",
      metaContainerId: finalized.containerId,
      metaMediaId: finalized.mediaId,
    },
    message: `Gepubliceerd naar Instagram (media id ${finalized.mediaId}).`,
  };
}

/** Create + wait containers only (no media_publish). */
async function prepareContainersOnly(args: {
  client: MetaClient;
  caption: string;
  imageUrls: string[];
}): Promise<
  | { ok: true; containerId: string }
  | { ok: false; code: string; message: string; containerId?: string }
> {
  const { client, caption, imageUrls } = args;
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
