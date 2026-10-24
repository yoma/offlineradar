/**
 * Phase 3B: publish an approved Instagram concept via Meta Graph API.
 * Default mode is disabled; dry-run makes no Meta HTTP calls.
 */

import { appPublicBaseUrl } from "@/lib/email/app-brand";
import type { InstagramDraft } from "@/lib/instagram/drafts";
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

async function publishLiveToMeta(args: {
  client: MetaClient;
  caption: string;
  imageUrls: string[];
}): Promise<
  | { ok: true; containerId: string; mediaId: string }
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
    const published = await client.publishContainer(created.data.id);
    if (!published.ok) {
      return {
        ok: false,
        code: published.error.code,
        message: humanMetaPublishError(
          published.error.code,
          published.error.message,
        ),
        containerId: created.data.id,
      };
    }
    return {
      ok: true,
      containerId: created.data.id,
      mediaId: published.data.id,
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
  const published = await client.publishContainer(carousel.data.id);
  if (!published.ok) {
    return {
      ok: false,
      code: published.error.code,
      message: humanMetaPublishError(
        published.error.code,
        published.error.message,
      ),
      containerId: carousel.data.id,
    };
  }
  return {
    ok: true,
    containerId: carousel.data.id,
    mediaId: published.data.id,
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
    return {
      ok: false,
      code: "publish_in_progress",
      message: humanMetaPublishError("publish_in_progress"),
      publish: claim.row,
    };
  }

  const publicBaseUrl =
    input.publicBaseUrl?.replace(/\/$/, "") || appPublicBaseUrl();
  const urls = buildSlidePublicUrls(input.draft, publicBaseUrl);
  if (!urls.ok) {
    const failed = await finishPublishAttempt(claim.row.id, {
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
    await recordConceptEventIds(input.draft.eventIds);
    const finished = await finishPublishAttempt(claim.row.id, {
      status: "dry_run",
      errorCode: null,
      errorMessage: null,
    });
    return {
      ok: true,
      mode: "dry_run",
      publish: finished ?? claim.row,
      message: `Dry-run OK (${metaPublishModeLabel("dry_run")}). ${urls.urls.length} publieke JPEG-URL(s) voorbereid; geen Meta-aanroep.`,
    };
  }

  if (config.missingForLive.length > 0) {
    const message = humanMetaPublishError(
      "missing_credentials",
      `Ontbrekend: ${config.missingForLive.join(", ")}.`,
    );
    const failed = await finishPublishAttempt(claim.row.id, {
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

  const live = await publishLiveToMeta({
    client,
    caption: input.draft.caption,
    imageUrls: urls.urls,
  });

  if (!live.ok) {
    const failed = await finishPublishAttempt(claim.row.id, {
      status: "failed",
      metaContainerId: live.containerId ?? null,
      errorCode: live.code,
      errorMessage: live.message,
    });
    return {
      ok: false,
      code: live.code,
      message: live.message,
      publish: failed,
    };
  }

  await recordConceptEventIds(input.draft.eventIds);
  const finished = await finishPublishAttempt(claim.row.id, {
    status: "published",
    metaContainerId: live.containerId,
    metaMediaId: live.mediaId,
    errorCode: null,
    errorMessage: null,
  });

  return {
    ok: true,
    mode: "live",
    publish: finished ?? claim.row,
    message: `Gepubliceerd naar Instagram (media id ${live.mediaId}).`,
  };
}
