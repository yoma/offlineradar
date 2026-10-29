/**
 * Minimal Instagram Graph API client (Instagram Login, graph.instagram.com).
 * Access tokens are sent in POST bodies / Authorization headers, never in URLs
 * (the one exception, refresh_access_token, lives in token-store.ts).
 */

import {
  META_HTTP_TIMEOUT_MS,
} from "@/lib/instagram/publish-policy";

export type MetaGraphError = {
  code: string;
  message: string;
  httpStatus?: number;
  metaCode?: number;
  metaSubcode?: number;
};

export type MetaClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: MetaGraphError };

export type MetaRequestOptions = {
  /** Cap this single HTTP call (ms). Defaults to client timeout. */
  timeoutMs?: number;
  /**
   * Let this call wait longer than the client default (ms). For reel
   * media_publish, which Meta often answers only after 20–60 s.
   */
  longTimeoutMs?: number;
};

export type MetaClient = {
  createImageContainer: (
    args: {
      imageUrl: string;
      caption?: string;
      isCarouselItem?: boolean;
    },
    opts?: MetaRequestOptions,
  ) => Promise<MetaClientResult<{ id: string }>>;
  /** Optional so older test doubles stay valid; the real client has it. */
  createStoryContainer?: (
    args: { imageUrl: string } | { videoUrl: string },
    opts?: MetaRequestOptions,
  ) => Promise<MetaClientResult<{ id: string }>>;
  /** REELS container (video processed by Meta; poll until FINISHED). */
  createReelContainer?: (
    args: {
      videoUrl: string;
      caption: string;
      coverUrl?: string | null;
      shareToFeed?: boolean;
      /** Instagram usernames, max 3; they get an invite to co-author. */
      collaborators?: string[];
    },
    opts?: MetaRequestOptions,
  ) => Promise<MetaClientResult<{ id: string }>>;
  /** Posts left in the rolling 24 h publishing window. */
  getPublishingLimit?: (
    opts?: MetaRequestOptions,
  ) => Promise<MetaClientResult<{ used: number; total: number }>>;
  createCarouselContainer: (
    args: {
      children: string[];
      caption: string;
    },
    opts?: MetaRequestOptions,
  ) => Promise<MetaClientResult<{ id: string }>>;
  publishContainer: (
    creationId: string,
    opts?: MetaRequestOptions,
  ) => Promise<MetaClientResult<{ id: string }>>;
  getContainerStatus: (
    containerId: string,
    opts?: MetaRequestOptions,
  ) => Promise<
    MetaClientResult<{
      status_code?: string;
      status?: string;
    }>
  >;
  /**
   * The account's newest posts and reels, newest first. Used to find a post
   * whose media_publish answer got lost. Optional for older test doubles.
   */
  listRecentMedia?: (
    opts?: MetaRequestOptions,
  ) => Promise<MetaClientResult<RecentMedia[]>>;
};

export type RecentMedia = {
  id: string;
  caption: string;
  /** ISO time Instagram gives the post. */
  timestamp: string | null;
};

export type MetaClientOptions = {
  igUserId: string;
  accessToken: string;
  graphApiVersion: string;
  graphHost: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

function mapMetaError(payload: unknown, httpStatus: number): MetaGraphError {
  const err = (payload as { error?: Record<string, unknown> } | null)?.error;
  const message =
    typeof err?.message === "string"
      ? err.message
      : `Meta Graph API-fout (HTTP ${httpStatus}).`;
  const metaCode = typeof err?.code === "number" ? err.code : undefined;
  const metaSubcode =
    typeof err?.error_subcode === "number" ? err.error_subcode : undefined;
  const msgLower = message.toLowerCase();
  let code = "meta_graph_error";
  if (httpStatus === 401 || metaCode === 190) code = "meta_auth";
  else if (httpStatus >= 500) code = "meta_network";
  else if (metaCode === 4 || metaCode === 17 || metaCode === 32)
    code = "meta_rate_limit";
  else if (metaCode === 36003 || metaSubcode === 2207003)
    code = "meta_media_url";
  else if (metaCode === 9007 || metaSubcode === 2207027)
    code = "meta_media_format";
  else if (
    msgLower.includes("already published") ||
    msgLower.includes("already been published") ||
    metaSubcode === 2207020
  ) {
    code = "meta_already_published";
  }
  return { code, message, httpStatus, metaCode, metaSubcode };
}

function resolveCallTimeoutMs(
  defaultMs: number,
  opts: MetaRequestOptions | undefined,
): number {
  if (opts?.longTimeoutMs) return Math.max(1, Math.floor(opts.longTimeoutMs));
  const ms = opts?.timeoutMs ?? defaultMs;
  return Math.max(1, Math.min(defaultMs, Math.floor(ms)));
}

export function createMetaClient(options: MetaClientOptions): MetaClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultTimeoutMs = options.timeoutMs ?? META_HTTP_TIMEOUT_MS;
  const base = `https://${options.graphHost}/${options.graphApiVersion}`;

  async function graphPost(
    path: string,
    body: Record<string, string>,
    opts?: MetaRequestOptions,
  ): Promise<MetaClientResult<{ id: string }>> {
    const url = `${base}${path}`;
    const form = new URLSearchParams({
      ...body,
      access_token: options.accessToken,
    });
    const timeoutMs = resolveCallTimeoutMs(defaultTimeoutMs, opts);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        return {
          ok: false,
          error: {
            code: "meta_network",
            message: "Meta-antwoord was onleesbaar.",
            httpStatus: res.status,
          },
        };
      }
      if (!res.ok) {
        return { ok: false, error: mapMetaError(json, res.status) };
      }
      const id = (json as { id?: string } | null)?.id;
      if (!id || typeof id !== "string") {
        return {
          ok: false,
          error: {
            code: "meta_missing_id",
            message: "Meta gaf geen container-/media-id terug.",
            httpStatus: res.status,
          },
        };
      }
      return { ok: true, data: { id } };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const message =
        error instanceof Error
          ? error.message
          : "Netwerkfout bij Meta Graph API.";
      return {
        ok: false,
        error: {
          code:
            name === "TimeoutError" || name === "AbortError"
              ? "meta_network"
              : "meta_network",
          message,
        },
      };
    }
  }

  async function graphGet(
    path: string,
    fields: string,
    opts?: MetaRequestOptions,
  ): Promise<MetaClientResult<Record<string, unknown>>> {
    const url = new URL(`${base}${path}`);
    url.searchParams.set("fields", fields);
    const timeoutMs = resolveCallTimeoutMs(defaultTimeoutMs, opts);
    try {
      const res = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        return {
          ok: false,
          error: {
            code: "meta_network",
            message: "Meta-antwoord was onleesbaar.",
            httpStatus: res.status,
          },
        };
      }
      if (!res.ok) {
        return { ok: false, error: mapMetaError(json, res.status) };
      }
      return { ok: true, data: (json as Record<string, unknown>) ?? {} };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "meta_network",
          message:
            error instanceof Error
              ? error.message
              : "Netwerkfout bij Meta Graph API.",
        },
      };
    }
  }

  return {
    createImageContainer: ({ imageUrl, caption, isCarouselItem }, opts) => {
      const body: Record<string, string> = { image_url: imageUrl };
      if (caption) body.caption = caption;
      if (isCarouselItem) body.is_carousel_item = "true";
      return graphPost(`/${options.igUserId}/media`, body, opts);
    },
    createStoryContainer: (args, opts) =>
      graphPost(
        `/${options.igUserId}/media`,
        "videoUrl" in args
          ? { media_type: "STORIES", video_url: args.videoUrl }
          : { media_type: "STORIES", image_url: args.imageUrl },
        opts,
      ),
    createReelContainer: ({ videoUrl, caption, coverUrl, shareToFeed, collaborators }, opts) => {
      const body: Record<string, string> = {
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: shareToFeed === false ? "false" : "true",
      };
      if (coverUrl) body.cover_url = coverUrl;
      if (collaborators && collaborators.length > 0) {
        body.collaborators = JSON.stringify(collaborators.slice(0, 3));
      }
      return graphPost(`/${options.igUserId}/media`, body, opts);
    },
    getPublishingLimit: async (opts) => {
      const res = await graphGet(
        `/${options.igUserId}/content_publishing_limit`,
        "config,quota_usage",
        opts,
      );
      if (!res.ok) return res;
      // { data: [{ quota_usage: 2, config: { quota_total: 100, ... } }] }
      const row = (Array.isArray(res.data.data) ? res.data.data[0] : res.data) as
        | { quota_usage?: unknown; config?: { quota_total?: unknown } }
        | undefined;
      const used = typeof row?.quota_usage === "number" ? row.quota_usage : 0;
      const total =
        typeof row?.config?.quota_total === "number" ? row.config.quota_total : 100;
      return { ok: true, data: { used, total } };
    },
    createCarouselContainer: ({ children, caption }, opts) =>
      graphPost(
        `/${options.igUserId}/media`,
        {
          media_type: "CAROUSEL",
          children: children.join(","),
          caption,
        },
        opts,
      ),
    publishContainer: (creationId, opts) =>
      graphPost(
        `/${options.igUserId}/media_publish`,
        {
          creation_id: creationId,
        },
        opts,
      ),
    getContainerStatus: async (containerId, opts) => {
      // Do not treat container `id` as an IG media id.
      const res = await graphGet(
        `/${containerId}`,
        "status_code,status",
        opts,
      );
      if (!res.ok) return res;
      return {
        ok: true,
        data: {
          status_code:
            typeof res.data.status_code === "string"
              ? res.data.status_code
              : undefined,
          status:
            typeof res.data.status === "string" ? res.data.status : undefined,
        },
      };
    },
    listRecentMedia: async (opts) => {
      const res = await graphGet(
        `/${options.igUserId}/media`,
        "id,caption,timestamp",
        opts,
      );
      if (!res.ok) return res;
      const rows = Array.isArray(res.data.data) ? (res.data.data as Record<string, unknown>[]) : [];
      return {
        ok: true,
        data: rows
          .filter((r) => typeof r.id === "string")
          .map((r) => ({
            id: r.id as string,
            caption: typeof r.caption === "string" ? r.caption : "",
            timestamp: typeof r.timestamp === "string" ? r.timestamp : null,
          })),
      };
    },
  };
}

/** Remaining time until a carousel/publish deadline; 0 when already elapsed. */
export function remainingBudgetMs(deadlineMs: number, now = Date.now()): number {
  return Math.max(0, deadlineMs - now);
}

export async function waitForContainerFinished(
  client: MetaClient,
  containerId: string,
  options?: {
    attempts?: number;
    delayMs?: number;
    /** Absolute epoch ms; polling/HTTP stop when this is reached. */
    deadlineMs?: number;
    sleep?: (ms: number) => Promise<void>;
    httpTimeoutMs?: number;
  },
): Promise<MetaClientResult<{ status_code: string }>> {
  const attempts = options?.attempts ?? 20;
  const delayMs = options?.delayMs ?? 2000;
  const httpTimeoutMs = options?.httpTimeoutMs ?? META_HTTP_TIMEOUT_MS;
  const sleep =
    options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let last = "UNKNOWN";
  for (let i = 0; i < attempts; i++) {
    if (options?.deadlineMs != null) {
      const remaining = remainingBudgetMs(options.deadlineMs);
      if (remaining <= 0) {
        return {
          ok: false,
          error: {
            code: "meta_container_timeout",
            message: `Media-container niet klaar binnen het tijdsbudget (laatste status: ${last}).`,
          },
        };
      }
    }

    const callTimeout =
      options?.deadlineMs != null
        ? Math.min(
            httpTimeoutMs,
            Math.max(1, remainingBudgetMs(options.deadlineMs)),
          )
        : httpTimeoutMs;

    const status = await client.getContainerStatus(containerId, {
      timeoutMs: callTimeout,
    });
    if (!status.ok) return status;
    last = status.data.status_code ?? status.data.status ?? "UNKNOWN";
    if (last === "FINISHED" || last === "PUBLISHED") {
      return { ok: true, data: { status_code: last } };
    }
    if (last === "ERROR" || last === "EXPIRED") {
      return {
        ok: false,
        error: {
          code: "meta_container_failed",
          message: `Media-container status: ${last}.`,
        },
      };
    }

    let sleepFor = delayMs;
    if (options?.deadlineMs != null) {
      const remaining = remainingBudgetMs(options.deadlineMs);
      if (remaining <= 0) {
        return {
          ok: false,
          error: {
            code: "meta_container_timeout",
            message: `Media-container niet klaar binnen het tijdsbudget (laatste status: ${last}).`,
          },
        };
      }
      sleepFor = Math.min(delayMs, remaining);
    }
    await sleep(sleepFor);
  }
  return {
    ok: false,
    error: {
      code: "meta_container_timeout",
      message: `Media-container niet klaar (laatste status: ${last}).`,
    },
  };
}

/** Map internal codes to short Dutch admin messages. */
export function humanMetaPublishError(code: string, detail?: string): string {
  const base: Record<string, string> = {
    disabled:
      "Publicatie staat uit. Zet INSTAGRAM_META_DRY_RUN=1 (test) of INSTAGRAM_META_PUBLISH_ENABLED=1 (live).",
    unauthorized: "Je bent niet ingelogd als beheerder.",
    not_approved:
      "Dit concept is nog niet goedgekeurd. Klik eerst op Goedkeuren.",
    content_mismatch:
      "Inhoud wijkt af van de goedgekeurde versie. Keur opnieuw goed.",
    event_drift:
      "Eventgegevens (titel/datum/locatie) zijn gewijzigd na goedkeuring. Keur opnieuw goed vóór publiceren.",
    missing_credentials:
      "INSTAGRAM_USER_ID of INSTAGRAM_ACCESS_TOKEN ontbreekt in de serveromgeving.",
    missing_signing_secret: "Signing-secret voor publieke media-URL ontbreekt.",
    already_published: "Dit concept is al gepubliceerd naar Instagram.",
    publish_in_progress: "Er loopt al een publicatie voor dit concept.",
    publish_uncertain:
      "Publicatie-uitkomst onzeker (Meta mogelijk al geaccepteerd). Slot blijft geblokkeerd — geen retry tot reconciliatie.",
    container_persist_failed:
      "Container-id kon niet in Neon worden opgeslagen; publicatie gestopt vóór Meta publish.",
    neon_unavailable: "Neon-database niet bereikbaar voor publicatielog.",
    durable_log_failed:
      "Meta lijkt te zijn gepubliceerd, maar Neon-log kon niet worden bevestigd. Controleer Instagram; geen automatische retry.",
    no_slides: "Concept heeft geen slides om te publiceren.",
    carousel_too_small: "Een carrousel heeft minstens 2 afbeeldingen nodig.",
    meta_auth:
      "Instagram-token ongeldig of verlopen. Zet een nieuw INSTAGRAM_ACCESS_TOKEN in Vercel.",
    meta_rate_limit: "Meta rate limit bereikt. Probeer later opnieuw.",
    meta_media_url:
      "Meta kon de afbeeldings-URL niet ophalen. Controleer publieke URL / signing.",
    meta_media_format:
      "Afbeeldingsformaat geweigerd door Meta (JPEG vereist).",
    meta_container_failed: "Meta wees de media-container af.",
    meta_publish_limit: "Instagram-publicatielimiet (24 uur) bereikt.",
    meta_container_timeout: "Meta media-container werd niet op tijd klaar.",
    meta_already_published:
      "Meta meldt dat deze container al gepubliceerd is (geen dubbele post).",
    meta_network: "Netwerkfout of timeout bij contact met Meta.",
    meta_graph_error: "Meta Graph API gaf een fout.",
    dry_run_blocked_by_live:
      "Er loopt nog een live publicatiepoging voor dit concept. Dry-run mag die niet vrijgeven.",
    recovery_in_progress: "Herstel van een eerdere publicatie loopt al.",
  };
  const msg = base[code] ?? "Publicatie mislukt.";
  if (detail && detail !== msg) return `${msg} ${detail}`;
  return msg;
}
