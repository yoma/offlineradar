/**
 * Offline checks for the Instagram post queue (no Neon, no Meta HTTP).
 * Usage: npm run verify:instagram-queue
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  fromBrusselsLocalInput,
  toBrusselsLocalInput,
} from "../lib/instagram/queue-time";
import { toInstagramJpeg, ingestExternalImage } from "../lib/instagram/queue-media";
import { upcomingQueueSlots } from "../lib/instagram/queue-runner";
import { publicMediaUrl, normalizeCaption } from "../lib/instagram/queue";
import {
  decryptToken,
  encryptToken,
  scrubSecrets,
  tokenNeedsRefresh,
} from "../lib/instagram/token-store";
import { readInstagramMetaConfig } from "../lib/instagram/meta-config";

const DAY = 86_400_000;

async function main() {
  // --- token encryption -----------------------------------------------------
  const key = randomBytes(32);
  const token = "IGAAT" + "x".repeat(150);
  const sealed = encryptToken(token, key);
  assert.ok(!sealed.includes(token), "ciphertext must not contain the token");
  assert.equal(decryptToken(sealed, key), token);
  assert.equal(decryptToken(sealed, randomBytes(32)), null, "wrong key fails");
  assert.equal(decryptToken("garbage", key), null);

  // --- secrets never leak into messages ------------------------------------
  process.env.INSTAGRAM_ACCESS_TOKEN = token;
  const leaked = scrubSecrets(
    `fetch failed https://graph.instagram.com/x?access_token=${token}&a=1 and ${token}`,
  );
  assert.ok(!leaked.includes(token), leaked);
  assert.ok(!leaked.includes("IGAAT"), leaked);

  // --- refresh schedule (~50 days) ------------------------------------------
  const now = new Date("2026-10-25T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
  const inDays = (d: number) => new Date(now.getTime() + d * DAY).toISOString();
  assert.equal(tokenNeedsRefresh({ refreshedAt: ago(0.5), expiresAt: null }, now), false, "<24h old");
  assert.equal(tokenNeedsRefresh({ refreshedAt: ago(2), expiresAt: null }, now), true, "unknown expiry");
  assert.equal(tokenNeedsRefresh({ refreshedAt: ago(10), expiresAt: inDays(50) }, now), false);
  assert.equal(tokenNeedsRefresh({ refreshedAt: ago(50), expiresAt: inDays(10) }, now), false, "boundary");
  assert.equal(tokenNeedsRefresh({ refreshedAt: ago(51), expiresAt: inDays(9) }, now), true);

  // --- config: Instagram Login host + env names ------------------------------
  process.env.INSTAGRAM_USER_ID = "17841452044721453";
  const config = readInstagramMetaConfig();
  assert.equal(config.graphHost, "graph.instagram.com");
  assert.equal(config.igUserId, "17841452044721453");
  assert.deepEqual(config.missingForLive, []);

  // --- Brussels time conversion (incl. DST) ---------------------------------
  for (const iso of [
    "2026-07-01T17:00:00.000Z", // summer, 19:00 local
    "2026-12-01T18:00:00.000Z", // winter, 19:00 local
    "2026-03-29T01:30:00.000Z", // just after spring-forward
  ]) {
    const local = toBrusselsLocalInput(iso);
    assert.equal(fromBrusselsLocalInput(local)?.toISOString(), iso, local);
  }
  assert.equal(toBrusselsLocalInput("2026-07-01T17:00:00.000Z"), "2026-07-01T19:00");
  assert.equal(fromBrusselsLocalInput("2026-12-01T19:00")?.toISOString(), "2026-12-01T18:00:00.000Z");
  assert.equal(fromBrusselsLocalInput("nonsense"), null);

  // --- weekly proposal slots ------------------------------------------------
  const slots = upcomingQueueSlots(new Date("2026-10-26T08:00:00Z")); // Monday 09:00
  const keys = slots.map((s) => s.slotKey);
  assert.deepEqual(keys, [
    "2026-10-26T19:00|deze_week",
    "2026-10-28T19:00|nieuw",
    "2026-10-30T17:00|binnenkort",
  ]);
  assert.equal(slots[0]!.at.toISOString(), "2026-10-26T18:00:00.000Z", "19:00 CET");
  const tooClose = upcomingQueueSlots(new Date("2026-10-26T15:00:00Z"));
  assert.ok(!tooClose.some((s) => s.slotKey.startsWith("2026-10-26")), "needs 6h lead");

  // --- public media URL + caption ------------------------------------------
  assert.equal(
    publicMediaUrl("a".repeat(32), "https://dateofflinehub.be/"),
    `https://dateofflinehub.be/api/instagram/media/${"a".repeat(32)}.jpg`,
  );
  assert.equal(normalizeCaption("  a\r\nb  "), "a\nb");
  assert.equal(normalizeCaption("x".repeat(3000)).length, 2200);

  // --- JPEG conversion: format + aspect ratio limits --------------------------
  const png = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 4, background: "#67283a" } })
      .png()
      .toBuffer();
  for (const [w, h, ratio] of [
    [1000, 2000, 0.8], // too tall → 4:5
    [3000, 1000, 1.91], // too wide → 1.91:1
    [1080, 1350, 0.8], // already fine
  ] as const) {
    const jpeg = await toInstagramJpeg(await png(w, h));
    const meta = await sharp(jpeg).metadata();
    assert.equal(meta.format, "jpeg");
    assert.ok(meta.width! <= 1440);
    assert.ok(Math.abs(meta.width! / meta.height! - ratio) < 0.01, `${w}x${h}`);
    assert.ok(jpeg.byteLength < 8 * 1024 * 1024);
  }

  // --- external images: https only, must be an image ------------------------
  await assert.rejects(ingestExternalImage("http://example.com/a.jpg"), /https/);
  const fakeFetch = (async () =>
    new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
  await assert.rejects(ingestExternalImage("https://example.com/a", fakeFetch), /Geen afbeelding/);
  const pngBytes = await png(800, 800);
  const imageFetch = (async () =>
    new Response(new Uint8Array(pngBytes), { headers: { "content-type": "image/png" } })) as typeof fetch;
  const ingested = await ingestExternalImage("https://example.com/a.png", imageFetch);
  assert.equal((await sharp(ingested).metadata()).format, "jpeg");

  console.log("OK: Instagram queue offline checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
