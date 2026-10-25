/**
 * Instagram access token storage + automatic refresh (Instagram Login).
 *
 * - Seeded from INSTAGRAM_ACCESS_TOKEN the first time (and again whenever the
 *   env value changes), then kept AES-256-GCM encrypted in instagram_settings.
 * - Refreshed via graph.instagram.com/refresh_access_token about every 50 days
 *   (long-lived tokens live 60 days).
 *
 * The plain token is never logged, returned to the UI or put in error text.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import { ensureInstagramQueueSchema } from "@/lib/instagram/queue-schema";

const DAY_MS = 86_400_000;
/** Refresh once the token is this old (when Meta gave no expiry). */
export const TOKEN_REFRESH_AFTER_DAYS = 50;
/** Meta refuses to refresh tokens younger than 24h. */
const TOKEN_MIN_AGE_MS = DAY_MS;

export type InstagramTokenStatus = {
  configured: boolean;
  stored: boolean;
  refreshedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
};

type SettingsRow = {
  token_ciphertext: string | null;
  token_source_hash: string | null;
  token_refreshed_at: string | Date | null;
  token_expires_at: string | Date | null;
  token_last_error: string | null;
};

function envToken(): string | null {
  return process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || null;
}

function encryptionKey(): Buffer | null {
  const secret =
    process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    null;
  if (!secret) return null;
  return createHash("sha256").update(`instagram-token:${secret}`).digest();
}

function sourceHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function encryptToken(token: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, body].map((p) =>
    typeof p === "string" ? p : p.toString("base64url"),
  ).join(".");
}

export function decryptToken(payload: string, key: Buffer): string | null {
  const [v, iv, tag, body] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Remove anything that looks like a token from text we store or show. */
export function scrubSecrets(text: string): string {
  let out = text;
  const token = envToken();
  if (token) out = out.split(token).join("[token]");
  return out
    .replace(/access_token=[^&\s"']+/gi, "access_token=[token]")
    .replace(/\b(IG|EA)[A-Za-z0-9_-]{40,}\b/g, "[token]")
    .slice(0, 500);
}

async function readRow(): Promise<SettingsRow | null> {
  const sql = getEventsSql();
  if (!sql || !(await ensureInstagramQueueSchema())) return null;
  const rows = (await sql`
    SELECT token_ciphertext, token_source_hash, token_refreshed_at,
           token_expires_at, token_last_error
    FROM instagram_settings WHERE id = 1
  `) as SettingsRow[];
  return rows[0] ?? null;
}

async function storeToken(args: {
  token: string;
  sourceHash?: string;
  refreshedAt: Date;
  expiresAt: Date | null;
}): Promise<boolean> {
  const sql = getEventsSql();
  const key = encryptionKey();
  if (!sql || !key) return false;
  const ciphertext = encryptToken(args.token, key);
  await sql`
    UPDATE instagram_settings SET
      token_ciphertext = ${ciphertext},
      token_source_hash = COALESCE(${args.sourceHash ?? null}, token_source_hash),
      token_refreshed_at = ${args.refreshedAt.toISOString()}::timestamptz,
      token_expires_at = ${args.expiresAt?.toISOString() ?? null}::timestamptz,
      token_last_error = NULL,
      updated_at = now()
    WHERE id = 1
  `;
  return true;
}

/**
 * Current access token: the stored one, or the env value on first use / when
 * the env value was replaced. Null when nothing is configured.
 */
export async function getInstagramAccessToken(): Promise<string | null> {
  const fromEnv = envToken();
  let row: SettingsRow | null = null;
  try {
    row = await readRow();
  } catch (error) {
    console.warn(
      "[instagram/token] settings read failed",
      scrubSecrets(error instanceof Error ? error.message : String(error)),
    );
  }

  const key = encryptionKey();
  const envHash = fromEnv ? sourceHash(fromEnv) : null;
  const envChanged = Boolean(envHash && row?.token_source_hash !== envHash);

  if (row?.token_ciphertext && key && !envChanged) {
    const token = decryptToken(row.token_ciphertext, key);
    if (token) return token;
  }

  if (!fromEnv) return null;
  if (row && key) {
    try {
      // Age unknown: count from now and refresh after the first 24h.
      await storeToken({
        token: fromEnv,
        sourceHash: envHash!,
        refreshedAt: new Date(),
        expiresAt: null,
      });
    } catch (error) {
      console.warn(
        "[instagram/token] could not store token",
        scrubSecrets(error instanceof Error ? error.message : String(error)),
      );
    }
  }
  return fromEnv;
}

export function tokenNeedsRefresh(
  status: { refreshedAt: string | null; expiresAt: string | null },
  now = new Date(),
): boolean {
  const nowMs = now.getTime();
  if (status.expiresAt) {
    // ~10 days before a 60-day expiry ≈ every 50 days.
    const expiresMs = Date.parse(status.expiresAt);
    const refreshedMs = status.refreshedAt
      ? Date.parse(status.refreshedAt)
      : 0;
    return (
      expiresMs - nowMs < 10 * DAY_MS && nowMs - refreshedMs >= TOKEN_MIN_AGE_MS
    );
  }
  if (!status.refreshedAt) return true;
  // Unknown expiry (seeded from env): refresh once Meta allows it, so we learn
  // the real expiry. After that the expiry rule above applies.
  return nowMs - Date.parse(status.refreshedAt) >= TOKEN_MIN_AGE_MS;
}

export async function getInstagramTokenStatus(): Promise<InstagramTokenStatus> {
  let row: SettingsRow | null = null;
  try {
    row = await readRow();
  } catch {
    row = null;
  }
  return {
    configured: Boolean(envToken() || row?.token_ciphertext),
    stored: Boolean(row?.token_ciphertext),
    refreshedAt: toIso(row?.token_refreshed_at ?? null),
    expiresAt: toIso(row?.token_expires_at ?? null),
    lastError: row?.token_last_error ?? null,
  };
}

export type RefreshOutcome =
  | { status: "skipped"; reason: string }
  | { status: "refreshed"; expiresAt: string | null }
  | { status: "failed"; message: string };

/** Refresh the stored token when it is due. Safe to call on every cron run. */
export async function refreshInstagramTokenIfDue(options?: {
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<RefreshOutcome> {
  const now = options?.now ?? new Date();
  const token = await getInstagramAccessToken();
  if (!token) return { status: "skipped", reason: "no_token" };
  if (!encryptionKey()) {
    return { status: "skipped", reason: "no_encryption_key" };
  }
  const status = await getInstagramTokenStatus();
  if (!status.stored) return { status: "skipped", reason: "not_stored" };
  if (!tokenNeedsRefresh(status, now)) {
    return { status: "skipped", reason: "not_due" };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);

  let message: string;
  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    } | null;
    if (res.ok && json?.access_token) {
      const expiresAt =
        typeof json.expires_in === "number" && json.expires_in > 0
          ? new Date(now.getTime() + json.expires_in * 1000)
          : null;
      await storeToken({
        token: json.access_token,
        refreshedAt: now,
        expiresAt,
      });
      return { status: "refreshed", expiresAt: expiresAt?.toISOString() ?? null };
    }
    message = `HTTP ${res.status}: ${json?.error?.message ?? "geen nieuw token ontvangen"}`;
  } catch (error) {
    // Never include the request URL: it carries the token.
    message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Timeout bij Instagram."
        : "Netwerkfout bij Instagram.";
  }

  const safe = scrubSecrets(message);
  const sql = getEventsSql();
  if (sql) {
    await sql`
      UPDATE instagram_settings
      SET token_last_error = ${safe}, updated_at = now()
      WHERE id = 1
    `.catch(() => undefined);
  }
  console.warn("[instagram/token] refresh failed:", safe);
  return { status: "failed", message: safe };
}
