/**
 * Public tip submit rate limiting via OfflineRadar Neon (shared durable store).
 * Never use in-memory counters on Vercel serverless.
 *
 * Privacy: store only HMAC-SHA256 of visitor IP with a server secret.
 * Fail closed on DB / config errors when public submit is active.
 */

import { createHmac } from "node:crypto";
import { getTipsSql } from "@/lib/tips/db";

export const PUBLIC_SUBMIT_RATE_LIMIT = {
  storage: "neon_shared_table",
  windowMinutes: 15,
  maxSubmits: 5,
  status: "active",
} as const;

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; error: string; status: 429 | 503 };

function rateLimitSecret(): string | null {
  const secret =
    process.env.OFFLINERADAR_RATE_LIMIT_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    null;
  return secret || null;
}

export function hashClientIp(ip: string): string | null {
  const secret = rateLimitSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(ip.trim().toLowerCase()).digest("hex");
}

/** Best-effort client IP on Vercel / proxies. Never trust for auth; only for soft rate limits. */
export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function windowStart(now = new Date()): Date {
  const ms = PUBLIC_SUBMIT_RATE_LIMIT.windowMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * Atomically increment the rate bucket for this IP hash.
 * Returns remaining allowance, or a deny / fail-closed error.
 */
export async function consumeTipSubmitRateLimit(
  request: Request,
): Promise<RateLimitResult> {
  const sql = getTipsSql();
  if (!sql) {
    return {
      ok: false,
      status: 503,
      error: "Tips zijn tijdelijk niet beschikbaar. Probeer het later opnieuw.",
    };
  }

  const ipHash = hashClientIp(clientIpFromRequest(request));
  if (!ipHash) {
    return {
      ok: false,
      status: 503,
      error: "Tips zijn tijdelijk niet beschikbaar. Probeer het later opnieuw.",
    };
  }

  const start = windowStart();

  try {
    // Drop stale windows (best-effort; ignore failures).
    await sql`
      DELETE FROM tip_submit_rate
      WHERE window_start < now() - interval '2 days'
    `;

    const rows = await sql`
      INSERT INTO tip_submit_rate (ip_hash, window_start, hit_count, updated_at)
      VALUES (${ipHash}, ${start.toISOString()}, 1, now())
      ON CONFLICT (ip_hash, window_start)
      DO UPDATE SET
        hit_count = tip_submit_rate.hit_count + 1,
        updated_at = now()
      RETURNING hit_count
    `;

    const hitCount = Number((rows[0] as { hit_count: number }).hit_count);
    if (!Number.isFinite(hitCount) || hitCount > PUBLIC_SUBMIT_RATE_LIMIT.maxSubmits) {
      return {
        ok: false,
        status: 429,
        error:
          "Je hebt te vaak een tip gestuurd. Probeer het over een kwartier opnieuw.",
      };
    }

    return {
      ok: true,
      remaining: Math.max(0, PUBLIC_SUBMIT_RATE_LIMIT.maxSubmits - hitCount),
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Tips zijn tijdelijk niet beschikbaar. Probeer het later opnieuw.",
    };
  }
}
