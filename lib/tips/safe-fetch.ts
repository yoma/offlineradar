/**
 * SSRF-aware fetch for tip source pages (server-side only).
 * Reuses tip URL validation; re-validates every redirect hop.
 */

import { createHash } from "node:crypto";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";

const MAX_BYTES = 750_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;

export type SafeFetchResult =
  | {
      ok: true;
      finalUrl: string;
      contentType: string | null;
      text: string;
      contentHash: string;
    }
  | {
      ok: false;
      error: string;
      code: "invalid_url" | "blocked" | "unavailable" | "too_large" | "unsupported";
    };

function isAllowedContentType(value: string | null): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower.includes("text/html") ||
    lower.includes("text/plain") ||
    lower.includes("application/xhtml") ||
    lower.includes("application/json") ||
    lower.includes("text/xml") ||
    lower.includes("application/xml")
  );
}

/** Strip scripts/styles roughly and collapse whitespace for model input. */
export function htmlToPlainishText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40_000);
}

export async function safeFetchTipSource(rawUrl: string): Promise<SafeFetchResult> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = validateAndNormalizeTipUrl(current);
    if (!validated.ok) {
      return { ok: false, code: "invalid_url", error: validated.error };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(validated.normalizedUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "User-Agent": "OfflineRadarTipReview/1.0 (+https://offlineradar.vercel.app)",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            ok: false,
            code: "unavailable",
            error: "Bron gaf een redirect zonder bestemming.",
          };
        }
        current = new URL(location, validated.normalizedUrl).toString();
        continue;
      }

      if (!response.ok) {
        return {
          ok: false,
          code: "unavailable",
          error: `Bron niet bereikbaar (HTTP ${response.status}).`,
        };
      }

      const contentType = response.headers.get("content-type");
      if (!isAllowedContentType(contentType)) {
        return {
          ok: false,
          code: "unsupported",
          error: "Bron gaf geen leesbare tekst/HTML terug.",
        };
      }

      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
        return {
          ok: false,
          code: "too_large",
          error: "Bronpagina is te groot om veilig te lezen.",
        };
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) {
        return {
          ok: false,
          code: "too_large",
          error: "Bronpagina is te groot om veilig te lezen.",
        };
      }

      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      const plain = htmlToPlainishText(text);
      if (plain.length < 40) {
        return {
          ok: false,
          code: "unavailable",
          error: "Bronpagina bevatte te weinig leesbare tekst.",
        };
      }

      const contentHash = createHash("sha256").update(plain).digest("hex");
      return {
        ok: true,
        finalUrl: validated.normalizedUrl,
        contentType,
        text: plain,
        contentHash,
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
    error: "Te veel redirects vanaf de tip-URL.",
  };
}
