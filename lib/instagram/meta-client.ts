/**
 * Minimal Instagram Graph API client (Facebook Login / Page token path).
 * No cron. Caller gates live calls behind feature flags.
 */

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

export type MetaClient = {
  createImageContainer: (args: {
    imageUrl: string;
    caption?: string;
    isCarouselItem?: boolean;
  }) => Promise<MetaClientResult<{ id: string }>>;
  createCarouselContainer: (args: {
    children: string[];
    caption: string;
  }) => Promise<MetaClientResult<{ id: string }>>;
  publishContainer: (creationId: string) => Promise<
    MetaClientResult<{ id: string }>
  >;
  getContainerStatus: (containerId: string) => Promise<
    MetaClientResult<{ status_code?: string; status?: string }>
  >;
};

export type MetaClientOptions = {
  igUserId: string;
  accessToken: string;
  graphApiVersion: string;
  graphHost: string;
  fetchImpl?: typeof fetch;
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
  let code = "meta_graph_error";
  if (httpStatus === 401 || metaCode === 190) code = "meta_auth";
  else if (metaCode === 4 || metaCode === 17 || metaCode === 32)
    code = "meta_rate_limit";
  else if (metaCode === 36003 || metaSubcode === 2207003)
    code = "meta_media_url";
  else if (metaCode === 9007 || metaSubcode === 2207027)
    code = "meta_media_format";
  return { code, message, httpStatus, metaCode, metaSubcode };
}

export function createMetaClient(options: MetaClientOptions): MetaClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = `https://${options.graphHost}/${options.graphApiVersion}`;

  async function graphPost(
    path: string,
    body: Record<string, string>,
  ): Promise<MetaClientResult<{ id: string }>> {
    const url = new URL(`${base}${path}`);
    url.searchParams.set("access_token", options.accessToken);
    for (const [k, v] of Object.entries(body)) {
      url.searchParams.set(k, v);
    }
    try {
      const res = await fetchImpl(url.toString(), { method: "POST" });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        return { ok: false, error: mapMetaError(json, res.status) };
      }
      const id = (json as { id?: string } | null)?.id;
      if (!id) {
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

  async function graphGet(
    path: string,
    fields: string,
  ): Promise<MetaClientResult<Record<string, unknown>>> {
    const url = new URL(`${base}${path}`);
    url.searchParams.set("access_token", options.accessToken);
    url.searchParams.set("fields", fields);
    try {
      const res = await fetchImpl(url.toString(), { method: "GET" });
      const json = (await res.json().catch(() => null)) as unknown;
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
    createImageContainer: ({ imageUrl, caption, isCarouselItem }) => {
      const body: Record<string, string> = { image_url: imageUrl };
      if (caption) body.caption = caption;
      if (isCarouselItem) body.is_carousel_item = "true";
      return graphPost(`/${options.igUserId}/media`, body);
    },
    createCarouselContainer: ({ children, caption }) =>
      graphPost(`/${options.igUserId}/media`, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
      }),
    publishContainer: (creationId) =>
      graphPost(`/${options.igUserId}/media_publish`, {
        creation_id: creationId,
      }),
    getContainerStatus: async (containerId) => {
      const res = await graphGet(`/${containerId}`, "status_code,status");
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
  };
}

export async function waitForContainerFinished(
  client: MetaClient,
  containerId: string,
  options?: {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<MetaClientResult<{ status_code: string }>> {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 1500;
  const sleep =
    options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let last = "UNKNOWN";
  for (let i = 0; i < attempts; i++) {
    const status = await client.getContainerStatus(containerId);
    if (!status.ok) return status;
    last = status.data.status_code ?? status.data.status ?? "UNKNOWN";
    if (last === "FINISHED") {
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
    await sleep(delayMs);
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
    missing_credentials: "Meta-credentials ontbreken in de serveromgeving.",
    missing_signing_secret: "Signing-secret voor publieke media-URL ontbreekt.",
    already_published: "Dit concept is al gepubliceerd naar Instagram.",
    publish_in_progress: "Er loopt al een publicatie voor dit concept.",
    neon_unavailable: "Neon-database niet bereikbaar voor publicatielog.",
    no_slides: "Concept heeft geen slides om te publiceren.",
    meta_auth: "Meta-token ongeldig of verlopen. Vernieuw META_PAGE_ACCESS_TOKEN.",
    meta_rate_limit: "Meta rate limit bereikt. Probeer later opnieuw.",
    meta_media_url:
      "Meta kon de afbeeldings-URL niet ophalen. Controleer publieke URL / signing.",
    meta_media_format:
      "Afbeeldingsformaat geweigerd door Meta (JPEG vereist).",
    meta_container_failed: "Meta wees de media-container af.",
    meta_container_timeout: "Meta media-container werd niet op tijd klaar.",
    meta_network: "Netwerkfout bij contact met Meta.",
    meta_graph_error: "Meta Graph API gaf een fout.",
  };
  const msg = base[code] ?? "Publicatie mislukt.";
  if (detail && detail !== msg) return `${msg} ${detail}`;
  return msg;
}
