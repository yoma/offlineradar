/**
 * SSRF-aware HTML fetch for source refresh (server-side only).
 * Returns raw HTML for deterministic parsers (unlike tip plain-text fetch).
 *
 * Trailing slashes are preserved: some hosts (HopToDate) 301 between
 * `/path` and `/path/` forever if the client strips the slash.
 */
import { createHash } from "node:crypto";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 6;

export type SafeHtmlFetchResult =
  | {
      ok: true;
      finalUrl: string;
      contentType: string | null;
      html: string;
      httpStatus: number;
      contentHash: string;
    }
  | {
      ok: false;
      error: string;
      code: "invalid_url" | "blocked" | "unavailable" | "too_large" | "unsupported";
      httpStatus?: number;
    };

function isAllowedContentType(value: string | null): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower.includes("text/html") ||
    lower.includes("application/xhtml") ||
    lower.includes("text/plain")
  );
}

/** Security validation without stripping trailing slashes. */
function validateFetchUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const tip = validateAndNormalizeTipUrl(raw);
  if (!tip.ok) return tip;
  try {
    const parsed = new URL(raw.trim());
    parsed.hash = "";
    const host = parsed.hostname.toLowerCase();
    const port =
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
        ? ""
        : parsed.port
          ? `:${parsed.port}`
          : "";
    return {
      ok: true,
      url: `${parsed.protocol}//${host}${port}${parsed.pathname}${parsed.search}`,
    };
  } catch {
    return { ok: false, error: "Ongeldige URL." };
  }
}

export async function safeFetchHtmlSource(
  rawUrl: string,
): Promise<SafeHtmlFetchResult> {
  let current = rawUrl;
  const seen = new Set<string>();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = validateFetchUrl(current);
    if (!validated.ok) {
      return { ok: false, code: "invalid_url", error: validated.error };
    }
    if (seen.has(validated.url)) {
      return {
        ok: false,
        code: "blocked",
        error: "Redirect-lus gedetecteerd bij bron-URL.",
      };
    }
    seen.add(validated.url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(validated.url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "User-Agent":
            "DateOfflineHubSourceRefresh/1.0 (+https://dateofflinehub.vercel.app)",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            ok: false,
            code: "unavailable",
            httpStatus: response.status,
            error: "Bron gaf een redirect zonder bestemming.",
          };
        }
        current = new URL(location, validated.url).toString();
        continue;
      }

      if (response.status === 403 || response.status === 429) {
        return {
          ok: false,
          code: "blocked",
          httpStatus: response.status,
          error: `Bron blokkeerde de request (HTTP ${response.status}).`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          code: "unavailable",
          httpStatus: response.status,
          error: `Bron niet bereikbaar (HTTP ${response.status}).`,
        };
      }

      const contentType = response.headers.get("content-type");
      if (!isAllowedContentType(contentType)) {
        return {
          ok: false,
          code: "unsupported",
          httpStatus: response.status,
          error: "Bron gaf geen leesbare HTML terug.",
        };
      }

      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
        return {
          ok: false,
          code: "too_large",
          httpStatus: response.status,
          error: "Bronpagina is te groot om veilig te lezen.",
        };
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) {
        return {
          ok: false,
          code: "too_large",
          httpStatus: response.status,
          error: "Bronpagina is te groot om veilig te lezen.",
        };
      }

      const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      if (html.trim().length < 80) {
        return {
          ok: false,
          code: "unavailable",
          httpStatus: response.status,
          error: "Bronpagina bevatte te weinig HTML.",
        };
      }

      return {
        ok: true,
        finalUrl: validated.url,
        contentType,
        html,
        httpStatus: response.status,
        contentHash: createHash("sha256").update(html).digest("hex"),
      };
    } catch {
      return {
        ok: false,
        code: "unavailable",
        error: "Bron kon niet worden opgehaald (timeout of netwerk).",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    code: "blocked",
    error: "Te veel redirects vanaf de bron-URL.",
  };
}
