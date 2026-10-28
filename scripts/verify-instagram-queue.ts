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
import { toInstagramJpeg } from "../lib/instagram/queue-media";
import {
  nextDailyPostTime,
  prepareContainers,
  upcomingQueueSlots,
} from "../lib/instagram/queue-runner";
import type { MetaClient } from "../lib/instagram/meta-client";
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
  assert.equal(config.publishExplicitlyOff, false, "queue posts by default");
  process.env.INSTAGRAM_META_PUBLISH_ENABLED = "0";
  assert.equal(readInstagramMetaConfig().publishExplicitlyOff, true, "emergency stop");
  delete process.env.INSTAGRAM_META_PUBLISH_ENABLED;

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
    "2026-10-26T17:30|deze_week",
    "2026-10-27T11:00|promo",
    "2026-10-28T17:30|nieuw",
    "2026-10-29T11:00|promo",
    "2026-10-30T17:30|binnenkort",
    "2026-10-31T17:30|event",
    "2026-11-01T11:00|promo",
  ]);
  assert.equal(slots[6]!.at.toISOString(), "2026-11-01T10:00:00.000Z", "promo 11:00 CET");
  // One post per day, never two on the same day.
  const days = keys.map((k) => k.slice(0, 10));
  assert.equal(new Set(days).size, days.length, "one slot per day");
  assert.equal(slots[0]!.at.toISOString(), "2026-10-26T16:30:00.000Z", "17:30 CET");
  const tooClose = upcomingQueueSlots(new Date("2026-10-26T15:00:00Z"));
  assert.ok(!tooClose.some((s) => s.slotKey.startsWith("2026-10-26")), "needs 6h lead");

  assert.equal(
    nextDailyPostTime(new Date("2026-10-26T10:00:00Z")).toISOString(),
    "2026-10-26T16:30:00.000Z",
    "before 17:30 → tonight",
  );
  assert.equal(
    nextDailyPostTime(new Date("2026-10-26T18:00:00Z")).toISOString(),
    "2026-10-27T16:30:00.000Z",
    "after 17:30 → tomorrow",
  );

  // --- carousel containers: parallel children, then parent ------------------
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let n = 0;
  const fake: MetaClient = {
    createImageContainer: async ({ isCarouselItem, caption }) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      calls.push(isCarouselItem ? "child" : `single:${caption}`);
      return { ok: true, data: { id: `c${++n}` } };
    },
    createCarouselContainer: async ({ children, caption }) => {
      calls.push(`carousel:${children.length}:${caption}`);
      return { ok: true, data: { id: "parent" } };
    },
    publishContainer: async () => ({ ok: true, data: { id: "media" } }),
    getContainerStatus: async () => ({ ok: true, data: { status_code: "FINISHED" } }),
  };
  const carousel = await prepareContainers({
    client: fake,
    caption: "hallo",
    imageUrls: ["a", "b", "c", "d", "e", "f", "g"],
    deadlineMs: Date.now() + 10_000,
  });
  assert.deepEqual(carousel, { ok: true, containerId: "parent" });
  assert.equal(calls.filter((c) => c === "child").length, 7);
  assert.equal(calls.at(-1), "carousel:7:hallo");
  assert.ok(maxInFlight > 1, "children are created in parallel");
  const single = await prepareContainers({
    client: fake,
    caption: "één",
    imageUrls: ["a"],
    deadlineMs: Date.now() + 10_000,
  });
  assert.equal(single.ok, true);
  assert.equal(calls.at(-1), "single:één");
  const failing: MetaClient = {
    ...fake,
    getContainerStatus: async () => ({ ok: true, data: { status_code: "ERROR" } }),
  };
  const failed = await prepareContainers({
    client: failing,
    caption: "x",
    imageUrls: ["a", "b"],
    deadlineMs: Date.now() + 10_000,
  });
  assert.equal(failed.ok, false, "container error stops before publish");

  // --- Saturday spotlight: fresh event, 2–28 days ahead -------------------
  const { pickSpotlightEvent } = await import("../lib/instagram/drafts");
  const spot = (id: string, startDate: string) =>
    ({
      id,
      slug: id,
      title: id,
      startDate,
      startTime: "19:00",
      city: "Gent",
      region: "Oost-Vlaanderen",
      capacityStatus: "available",
      activities: [],
    }) as unknown as Parameters<typeof pickSpotlightEvent>[0][number];
  const postAt = new Date("2026-10-31T16:30:00Z");
  const pool = [
    spot("tomorrow", "2026-11-01"),
    spot("used", "2026-11-04"),
    spot("good", "2026-11-06"),
    spot("later", "2026-11-10"),
  ];
  assert.equal(pickSpotlightEvent(pool, postAt, new Set(["used"]))?.id, "good");
  assert.equal(
    pickSpotlightEvent([spot("tomorrow", "2026-11-01")], postAt, new Set())?.id,
    "tomorrow",
    "falls back to any fresh event",
  );
  assert.equal(pickSpotlightEvent(pool.slice(1, 2), postAt, new Set(["used"])), null);

  // --- captions send people to the website ---------------------------------
  const { buildInstagramCaption, buildSingleEventCaption } = await import(
    "../lib/instagram/captions"
  );
  const ev = {
    id: "e1",
    slug: "speeddate-gent",
    title: "Speeddate Gent",
    startDate: "2026-11-07",
    startTime: "19:00",
    city: "Gent",
    organizerName: "Org",
    shortDescription: "",
    activities: ["speeddate"],
    eligibilityAgeMin: null,
    eligibilityAgeMax: null,
    price: null,
  } as unknown as Parameters<typeof buildSingleEventCaption>[0];
  const singleCaption = buildSingleEventCaption(ev).text;
  assert.ok(singleCaption.includes("dateofflinehub.be"), singleCaption);
  for (const format of ["binnenkort", "deze_week", "nieuw"] as const) {
    const text = buildInstagramCaption(format, [ev], "november").text;
    assert.ok(text.includes("dateofflinehub.be"), `${format}: ${text}`);
    assert.ok(!text.includes("/instagram"), `${format}: ${text}`);
  }

  // --- reel publish: long wait allowed, lost answers confirmed -------------
  const { createMetaClient } = await import("../lib/instagram/meta-client");
  const slow = createMetaClient({
    igUserId: "ig",
    accessToken: "tok",
    graphApiVersion: "v24.0",
    graphHost: "graph.instagram.com",
    timeoutMs: 50,
    fetchImpl: async (_input, init) => {
      await new Promise((r, reject) => {
        const t = setTimeout(r, 150);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
        });
      });
      return new Response(JSON.stringify({ id: "media1" }), { status: 200 });
    },
  });
  assert.equal((await slow.publishContainer("c1")).ok, false, "default cap still applies");
  assert.equal((await slow.publishContainer("c1", { longTimeoutMs: 1_000 })).ok, true, "long wait for reels");

  const { confirmPublishedLater } = await import("../lib/instagram/queue-runner");
  const statusSeq = (codes: string[]): MetaClient => {
    let i = 0;
    return {
      ...fake,
      getContainerStatus: async () => ({
        ok: true,
        data: { status_code: codes[Math.min(i++, codes.length - 1)] },
      }),
    };
  };
  assert.equal(
    await confirmPublishedLater(statusSeq(["FINISHED", "PUBLISHED"]), "c", Date.now() + 15_000),
    true,
    "lost answer but reel is live",
  );
  assert.equal(
    await confirmPublishedLater(statusSeq(["ERROR"]), "c", Date.now() + 15_000),
    false,
  );

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

  console.log("OK: Instagram queue offline checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
