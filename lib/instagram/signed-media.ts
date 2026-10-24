/**
 * Short-lived signed tickets so Meta can fetch JPEG slides without admin cookies.
 * Tokens are HMAC-signed; never put Meta credentials in the URL.
 *
 * v2 tickets carry a content fingerprint so rendering uses frozen approved
 * event snapshots instead of the live catalog.
 */

import {
  createHmac,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
import type { InstagramRenderKind } from "@/lib/instagram/render";

export const INSTAGRAM_PUBLIC_MEDIA_PATH = "/api/instagram/public-media";
/**
 * Meta curls each image_url when creating containers (and may retry).
 * Carousel publishes create multiple children + wait for FINISHED; keep
 * tickets valid well beyond a single serverless invocation.
 * IG containers themselves expire after 24h — 6h is a safe middle ground.
 */
export const INSTAGRAM_MEDIA_TICKET_TTL_SEC = 6 * 60 * 60;

export type InstagramMediaTicket = {
  v: 2;
  exp: number;
  kind: InstagramRenderKind;
  /** Same query fields as admin /api/instagram/image (minus kind). */
  q: Record<string, string>;
  /** Approval content fingerprint — required for frozen event render. */
  fp: string;
  n: string;
};

function signingSecret(): string | null {
  return (
    process.env.INSTAGRAM_IMAGE_SIGNING_SECRET?.trim() ||
    process.env.OFFLINERADAR_RATE_LIMIT_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    null
  );
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function signPayload(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function createInstagramMediaTicket(
  kind: InstagramRenderKind,
  query: Record<string, string>,
  contentFingerprint: string,
  now = Date.now(),
): { token: string } | { error: string } {
  const secret = signingSecret();
  if (!secret) {
    return {
      error:
        "Geen signing-secret (INSTAGRAM_IMAGE_SIGNING_SECRET of AUTH_SECRET).",
    };
  }
  const fp = contentFingerprint.trim();
  if (fp.length < 16) {
    return { error: "content_fingerprint ontbreekt voor publieke media-ticket." };
  }
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k === "kind") continue;
    if (typeof v === "string" && v.length > 0) q[k] = v.slice(0, 500);
  }
  const ticket: InstagramMediaTicket = {
    v: 2,
    exp: Math.floor(now / 1000) + INSTAGRAM_MEDIA_TICKET_TTL_SEC,
    kind,
    q,
    fp,
    n: randomBytes(8).toString("hex"),
  };
  const payloadB64 = b64url(JSON.stringify(ticket));
  const sig = signPayload(payloadB64, secret);
  return { token: `${payloadB64}.${sig}` };
}

export function verifyInstagramMediaTicket(
  token: string,
  now = Date.now(),
):
  | { ok: true; ticket: InstagramMediaTicket }
  | { ok: false; error: string } {
  const secret = signingSecret();
  if (!secret) return { ok: false, error: "signing_secret_missing" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "invalid_token" };
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { ok: false, error: "invalid_token" };
  const expected = signPayload(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "bad_signature" };
  }
  try {
    const parsed = JSON.parse(
      fromB64url(payloadB64).toString("utf8"),
    ) as InstagramMediaTicket & { v?: number };
    if (parsed?.v !== 2 || !parsed.kind || typeof parsed.exp !== "number") {
      return { ok: false, error: "invalid_payload" };
    }
    if (!parsed.fp || typeof parsed.fp !== "string") {
      return { ok: false, error: "missing_fingerprint" };
    }
    if (parsed.exp < Math.floor(now / 1000)) {
      return { ok: false, error: "expired" };
    }
    return { ok: true, ticket: parsed as InstagramMediaTicket };
  } catch {
    return { ok: false, error: "invalid_payload" };
  }
}

export function buildPublicMediaUrl(
  baseUrl: string,
  token: string,
): string {
  const root = baseUrl.replace(/\/$/, "");
  return `${root}${INSTAGRAM_PUBLIC_MEDIA_PATH}?t=${encodeURIComponent(token)}`;
}
