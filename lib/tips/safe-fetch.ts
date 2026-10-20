/**
 * SSRF-aware fetch for tip source pages (server-side only).
 * Reuses tip URL validation; re-validates every redirect hop.
 */

import { createHash } from "node:crypto";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";

/** Align with source-refresh HTML ceiling so Wix/large listing pages work. */
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
/** HopToDate / Tomeeto often exceed 4 hops (CDN → locale → trailing slash). */
const MAX_REDIRECTS = 8;

/**
 * Browser-like UA: ticket platforms (Billetto, Eventbrite, …) block custom
 * bot UAs via CloudFront/WAF. We still only fetch public HTML for admin review.
 */
const FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function looksLikeBotBlockPage(status: number, body: string): boolean {
  if (status === 403 || status === 429) return true;
  if (status !== 200) return false;
  const sample = body.slice(0, 2_000);
  return (
    /Request blocked|The request could not be satisfied|Access Denied|Just a moment\.\.\.|cf-browser-verification|attention required/i.test(
      sample,
    ) && sample.length < 4_000
  );
}

export type SafeFetchResult =
  | {
      ok: true;
      finalUrl: string;
      contentType: string | null;
      /** Plain text for LLM / tip screening. */
      text: string;
      /** Raw HTML for link harvest + JSON-LD (empty when source was plain text). */
      html: string;
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

/**
 * SSRF check for fetch hops without stripping trailing slashes.
 * Some hosts (HopToDate) 301 between `/path` and `/path/` forever if the
 * client normalizes the slash away — same approach as safe-fetch-html.
 */
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
        error: "Te veel redirects vanaf de tip-URL.",
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
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
          "User-Agent": FETCH_USER_AGENT,
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
        current = new URL(location, validated.url).toString();
        continue;
      }

      if (response.status === 403 || response.status === 429) {
        return {
          ok: false,
          code: "blocked",
          error:
            "Deze site blokkeert automatische ophalen. Open de link zelf en gebruik “Info plakken”, of probeer opnieuw.",
        };
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

      const raw = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      if (looksLikeBotBlockPage(response.status, raw)) {
        return {
          ok: false,
          code: "blocked",
          error:
            "Deze site blokkeert automatische ophalen. Open de link zelf en gebruik “Info plakken”, of probeer opnieuw.",
        };
      }
      const looksHtml = /<html[\s>]|<body[\s>]|<script[\s>]|<div[\s>]/i.test(raw);
      const plain = looksHtml
        ? htmlToPlainishText(raw)
        : raw.replace(/\s+/g, " ").trim().slice(0, 40_000);
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
        finalUrl: validated.url,
        contentType,
        text: plain,
        html: looksHtml ? raw : "",
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
