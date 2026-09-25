/**
 * URL normalization + SSRF-oriented safety checks for tip submissions.
 * Server must re-validate; never trust the client alone.
 */

const BLOCKED_HOST_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".lan",
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIpv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (isPrivateIpv4(host)) return true;
  // IPv6 localhost / link-local (basic)
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  return false;
}

export type UrlValidationResult =
  | { ok: true; originalUrl: string; normalizedUrl: string }
  | { ok: false; error: string };

/**
 * Validate visitor URL: must be public http(s), no credentials, no private hosts.
 */
const MAX_URL_LENGTH = 2048;

export function validateAndNormalizeTipUrl(raw: string): UrlValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Plak een link naar de activiteit." };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: "Deze link is te lang." };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, error: "De link mag geen spaties bevatten." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "Dit lijkt geen geldige link. Gebruik een volledige http(s)-URL.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "Alleen http- of https-links zijn toegestaan.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: "Links met gebruikersnaam of wachtwoord zijn niet toegestaan.",
    };
  }

  if (!parsed.hostname || isBlockedHost(parsed.hostname)) {
    return {
      ok: false,
      error: "Deze link wijst niet naar een toegestane publieke website.",
    };
  }

  // Drop hash; keep path/query (often edition-specific).
  parsed.hash = "";
  // Normalize host casing; strip default ports.
  const host = parsed.hostname.toLowerCase();
  const port =
    (parsed.protocol === "https:" && parsed.port === "443") ||
    (parsed.protocol === "http:" && parsed.port === "80")
      ? ""
      : parsed.port
        ? `:${parsed.port}`
        : "";

  let pathname = parsed.pathname || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const normalized = `${parsed.protocol}//${host}${port}${pathname}${parsed.search}`;

  return {
    ok: true,
    originalUrl: trimmed,
    normalizedUrl: normalized,
  };
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 5 || email.length > 254) return false;
  // Practical validation; full RFC is unnecessary.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
