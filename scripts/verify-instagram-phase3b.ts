/**
 * Phase 3B: Meta publish wiring — focused review checks.
 * Never places a real Instagram post (uses mocks / dry-run).
 */
import assert from "node:assert/strict";
import { buildInstagramConceptKey } from "@/lib/instagram/concept-key";
import {
  createMetaClient,
  humanMetaPublishError,
  waitForContainerFinished,
  type MetaClient,
} from "@/lib/instagram/meta-client";
import { readInstagramMetaConfig } from "@/lib/instagram/meta-config";
import {
  publishInstagramConcept,
  publishLiveToMeta,
} from "@/lib/instagram/publish";
import {
  INSTAGRAM_MEDIA_TICKET_TTL_SEC,
  createInstagramMediaTicket,
  verifyInstagramMediaTicket,
} from "@/lib/instagram/signed-media";
import { isPublishPendingStale } from "@/lib/instagram/publish-store";

function ok(label: string) {
  console.log(`OK: ${label}`);
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function withEnvAsync(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function testConceptKey() {
  const a = buildInstagramConceptKey("binnenkort", ["b", "a"]);
  const b = buildInstagramConceptKey("binnenkort", ["a", "b", "a"]);
  const c = buildInstagramConceptKey("nieuw", ["a", "b"]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  ok("1. concept key stable + unique per format");
}

function testFlags() {
  withEnv(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: undefined,
      INSTAGRAM_META_DRY_RUN: undefined,
    },
    () => assert.equal(readInstagramMetaConfig().mode, "disabled"),
  );
  withEnv(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: "1",
      INSTAGRAM_META_DRY_RUN: "1",
    },
    () => assert.equal(readInstagramMetaConfig().mode, "dry_run"),
  );
  ok("2. feature flags default off; dry-run overrides live");
}

function testSignedMediaTtl() {
  assert.ok(
    INSTAGRAM_MEDIA_TICKET_TTL_SEC >= 6 * 60 * 60,
    "TTL must be ≥ 6h for Meta carousel fetches",
  );
  withEnv({ INSTAGRAM_IMAGE_SIGNING_SECRET: "phase3b-test-secret" }, () => {
    const now = Date.now();
    const created = createInstagramMediaTicket(
      "deze_week",
      { ids: "e1,e2", period: "Deze week" },
      now,
    );
    assert.ok("token" in created);
    const token = (created as { token: string }).token;
    const verified = verifyInstagramMediaTicket(token, now);
    assert.equal(verified.ok, true);
    if (verified.ok) {
      assert.ok(
        verified.ticket.exp >= Math.floor(now / 1000) + 6 * 60 * 60 - 5,
      );
    }
    // Still valid after 5 hours
    const mid = verifyInstagramMediaTicket(token, now + 5 * 60 * 60 * 1000);
    assert.equal(mid.ok, true);
    // Expired after 7 hours
    const late = verifyInstagramMediaTicket(token, now + 7 * 60 * 60 * 1000);
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.error, "expired");
    assert.equal(verifyInstagramMediaTicket("tampered.sig").ok, false);
  });
  ok("3. signed JPEG tickets: 6h TTL, reject expired/tampered");
}

async function testMetaClientNoTokenInUrl() {
  const urls: string[] = [];
  const bodies: string[] = [];
  const headers: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    bodies.push(String(init?.body ?? ""));
    const h = init?.headers as Record<string, string> | undefined;
    headers.push(h?.Authorization ?? "");
    if (url.includes("media_publish") || url.endsWith("/media")) {
      return new Response(JSON.stringify({ id: "container_1" }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ status_code: "FINISHED", id: "c1" }), {
      status: 200,
    });
  };

  const client = createMetaClient({
    igUserId: "ig1",
    accessToken: "super-secret-token",
    graphApiVersion: "v22.0",
    graphHost: "graph.facebook.com",
    fetchImpl,
  });

  await client.createImageContainer({
    imageUrl: "https://example.com/a.jpg",
    caption: "hi",
  });
  await client.getContainerStatus("container_1");
  await client.publishContainer("container_1");

  assert.ok(urls.every((u) => !u.includes("super-secret-token")));
  assert.ok(urls.every((u) => !u.includes("access_token=")));
  assert.ok(bodies.some((b) => b.includes("access_token=super-secret-token")));
  assert.ok(headers.some((h) => h.includes("Bearer super-secret-token")));
  ok("4. Meta tokens never appear in request URLs");
}

async function testCarouselMultiImage() {
  const calls: string[] = [];
  const client: MetaClient = {
    createImageContainer: async ({ isCarouselItem }) => {
      calls.push(isCarouselItem ? "child" : "single");
      return { ok: true, data: { id: `child_${calls.length}` } };
    },
    createCarouselContainer: async ({ children, caption }) => {
      calls.push(`carousel:${children.length}:${caption}`);
      assert.equal(children.length, 3);
      return { ok: true, data: { id: "carousel_1" } };
    },
    publishContainer: async (id) => {
      calls.push(`publish:${id}`);
      return { ok: true, data: { id: "media_carousel" } };
    },
    getContainerStatus: async () => ({
      ok: true,
      data: { status_code: "FINISHED" },
    }),
  };

  const res = await publishLiveToMeta({
    client,
    caption: "Carrousel caption",
    imageUrls: [
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
    ],
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.containerId, "carousel_1");
    assert.equal(res.mediaId, "media_carousel");
  }
  assert.deepEqual(
    calls.filter((c) => c === "child"),
    ["child", "child", "child"],
  );
  assert.ok(calls.includes("carousel:3:Carrousel caption"));
  assert.ok(calls.includes("publish:carousel_1"));
  ok("5. carousel: 3 children → CAROUSEL parent → publish");
}

async function testDryRunNoMetaHttp() {
  let fetchCalls = 0;
  const fetchImpl: typeof fetch = async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 500 });
  };
  // Even if someone wired a client, dry-run path must not use it.
  const metaClient = createMetaClient({
    igUserId: "ig1",
    accessToken: "tok",
    graphApiVersion: "v22.0",
    graphHost: "graph.facebook.com",
    fetchImpl,
  });

  await withEnvAsync(
    {
      INSTAGRAM_META_DRY_RUN: "1",
      INSTAGRAM_META_PUBLISH_ENABLED: undefined,
      INSTAGRAM_IMAGE_SIGNING_SECRET: "phase3b-test-secret",
      OFFLINERADAR_PUBLIC_BASE_URL: "https://dateofflinehub.be",
    },
    async () => {
      const { getEventsSql } = await import("@/lib/events/db");
      const sql = getEventsSql();
      if (!sql) {
        console.log("SKIP: 6. dry-run (SQL unavailable)");
        return;
      }
      const eventId = `dry-${Date.now()}`;
      const res = await publishInstagramConcept({
        draft: {
          format: "deze_week",
          eventIds: [eventId],
          caption: "dry",
          slides: [
            {
              kind: "deze_week",
              label: "x",
              query: { kind: "deze_week", ids: eventId },
            },
          ],
        },
        metaClient,
        skipApprovalCheck: true,
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(res.ok, true, res.ok ? "" : res.message);
      if (res.ok) assert.equal(res.mode, "dry_run");
      assert.equal(fetchCalls, 0, "dry-run must not call Meta HTTP");
      await sql`DELETE FROM instagram_publishes WHERE event_ids::text LIKE ${"%" + eventId + "%"}`;
    },
  );
  ok("6. dry-run: zero Meta HTTP calls");
}

async function testApprovalGate() {
  await withEnvAsync(
    {
      INSTAGRAM_META_DRY_RUN: "1",
      INSTAGRAM_IMAGE_SIGNING_SECRET: "phase3b-test-secret",
    },
    async () => {
      const res = await publishInstagramConcept({
        draft: {
          format: "deze_week",
          eventIds: [`unapproved-${Date.now()}`],
          caption: "x",
          slides: [
            {
              kind: "deze_week",
              label: "x",
              query: { kind: "deze_week", ids: "x" },
            },
          ],
        },
        // intentionally NO skipApprovalCheck
      });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, "not_approved");
        assert.match(res.message, /goedkeur/i);
      }
    },
  );
  ok("7. publish blocked without concept approval");
}

async function testIdempotencyAndLostAck() {
  const { getEventsSql } = await import("@/lib/events/db");
  const sql = getEventsSql();
  if (!sql) {
    console.log("SKIP: 8. idempotency (SQL unavailable)");
    return;
  }

  const eventId = `ig3b-ack-${Date.now()}`;
  let publishCalls = 0;
  const metaClient: MetaClient = {
    createImageContainer: async () => {
      publishCalls += 1;
      return { ok: true, data: { id: `c-${publishCalls}` } };
    },
    createCarouselContainer: async () => ({
      ok: true,
      data: { id: "carousel" },
    }),
    publishContainer: async () => ({
      ok: true,
      data: { id: `m-${publishCalls}` },
    }),
    getContainerStatus: async () => ({
      ok: true,
      data: { status_code: "FINISHED" },
    }),
  };

  await withEnvAsync(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: "1",
      INSTAGRAM_META_DRY_RUN: undefined,
      META_IG_USER_ID: "ig-test",
      META_PAGE_ACCESS_TOKEN: "tok-test",
      INSTAGRAM_IMAGE_SIGNING_SECRET: "phase3b-test-secret",
      OFFLINERADAR_PUBLIC_BASE_URL: "https://dateofflinehub.be",
    },
    async () => {
      const draft = {
        format: "deze_week" as const,
        eventIds: [eventId],
        caption: "Verify caption",
        slides: [
          {
            kind: "deze_week" as const,
            label: "Overview",
            query: { kind: "deze_week", ids: eventId, period: "Deze week" },
          },
        ],
      };

      const first = await publishInstagramConcept({
        draft,
        metaClient,
        skipApprovalCheck: true,
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(first.ok, true, first.ok ? "" : first.message);

      const second = await publishInstagramConcept({
        draft,
        metaClient,
        skipApprovalCheck: true,
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(second.ok, false);
      if (!second.ok) assert.equal(second.code, "already_published");
      assert.equal(publishCalls, 1);

      // Simulate lost-ack: pending row with container id, no media id, stale.
      const eventId2 = `ig3b-stale-${Date.now()}`;
      const conceptKey = buildInstagramConceptKey("deze_week", [eventId2]);
      const staleId = crypto.randomUUID();
      const staleAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      await sql`
        INSERT INTO instagram_publishes (
          id, concept_key, format, event_ids, caption, slide_count,
          status, dry_run, meta_container_id, created_at, updated_at
        ) VALUES (
          ${staleId},
          ${conceptKey},
          'deze_week',
          ${JSON.stringify([eventId2])},
          'stale',
          1,
          'pending',
          false,
          'container_stale',
          ${staleAt}::timestamptz,
          ${staleAt}::timestamptz
        )
      `;

      assert.equal(
        isPublishPendingStale({
          id: staleId,
          conceptKey,
          format: "deze_week",
          eventIds: [eventId2],
          caption: "stale",
          slideCount: 1,
          status: "pending",
          dryRun: false,
          metaContainerId: "container_stale",
          metaMediaId: null,
          errorCode: null,
          errorMessage: null,
          requestedBy: null,
          createdAt: staleAt,
          updatedAt: staleAt,
          finishedAt: null,
        }),
        true,
      );

      let resumePublishes = 0;
      const resumeClient: MetaClient = {
        createImageContainer: async () => ({
          ok: true,
          data: { id: "should-not-create" },
        }),
        createCarouselContainer: async () => ({
          ok: true,
          data: { id: "should-not" },
        }),
        publishContainer: async (id) => {
          resumePublishes += 1;
          assert.equal(id, "container_stale");
          return { ok: true, data: { id: "media_recovered" } };
        },
        getContainerStatus: async () => ({
          ok: true,
          data: { status_code: "FINISHED" },
        }),
      };

      const recovered = await publishInstagramConcept({
        draft: {
          format: "deze_week",
          eventIds: [eventId2],
          caption: "stale",
          slides: [
            {
              kind: "deze_week",
              label: "x",
              query: { kind: "deze_week", ids: eventId2 },
            },
          ],
        },
        metaClient: resumeClient,
        skipApprovalCheck: true,
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(recovered.ok, true, recovered.ok ? "" : recovered.message);
      if (recovered.ok) {
        assert.equal(recovered.publish.metaMediaId, "media_recovered");
      }
      assert.equal(resumePublishes, 1, "resume only media_publish once");
    },
  );

  await sql`DELETE FROM instagram_publishes WHERE event_ids::text LIKE ${"%ig3b-ack-%"} OR event_ids::text LIKE ${"%ig3b-stale-%"}`;
  ok("8. idempotency + stale pending resume (no duplicate create)");
}

async function testFailedFreesSlot() {
  const { getEventsSql } = await import("@/lib/events/db");
  const sql = getEventsSql();
  if (!sql) {
    console.log("SKIP: 9. failed frees slot");
    return;
  }

  const eventId = `ig3b-fail-${Date.now()}`;
  let attempts = 0;
  const metaClient: MetaClient = {
    createImageContainer: async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false,
          error: { code: "meta_media_url", message: "bad url" },
        };
      }
      return { ok: true, data: { id: "c_ok" } };
    },
    createCarouselContainer: async () => ({ ok: true, data: { id: "x" } }),
    publishContainer: async () => ({ ok: true, data: { id: "m_ok" } }),
    getContainerStatus: async () => ({
      ok: true,
      data: { status_code: "FINISHED" },
    }),
  };

  await withEnvAsync(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: "1",
      INSTAGRAM_META_DRY_RUN: undefined,
      META_IG_USER_ID: "ig",
      META_PAGE_ACCESS_TOKEN: "tok",
      INSTAGRAM_IMAGE_SIGNING_SECRET: "phase3b-test-secret",
      OFFLINERADAR_PUBLIC_BASE_URL: "https://dateofflinehub.be",
    },
    async () => {
      const draft = {
        format: "deze_week" as const,
        eventIds: [eventId],
        caption: "fail then ok",
        slides: [
          {
            kind: "deze_week" as const,
            label: "x",
            query: { kind: "deze_week", ids: eventId },
          },
        ],
      };
      const first = await publishInstagramConcept({
        draft,
        metaClient,
        skipApprovalCheck: true,
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(first.ok, false);
      const second = await publishInstagramConcept({
        draft,
        metaClient,
        skipApprovalCheck: true,
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(second.ok, true, second.ok ? "" : second.message);
    },
  );
  await sql`DELETE FROM instagram_publishes WHERE event_ids::text LIKE ${"%" + eventId + "%"}`;
  ok("9. failed publish frees slot for retry");
}

function testHumanErrors() {
  assert.match(humanMetaPublishError("not_approved"), /goedkeur/i);
  assert.match(humanMetaPublishError("already_published"), /al gepubliceerd/i);
  ok("10. Dutch error messages");
}

async function testWaitFinished() {
  const client = createMetaClient({
    igUserId: "ig",
    accessToken: "t",
    graphApiVersion: "v22.0",
    graphHost: "graph.facebook.com",
    fetchImpl: async () =>
      new Response(JSON.stringify({ status_code: "FINISHED" }), {
        status: 200,
      }),
  });
  const ready = await waitForContainerFinished(client, "c1", {
    attempts: 2,
    delayMs: 1,
    sleep: async () => {},
  });
  assert.equal(ready.ok, true);
  ok("11. container wait accepts FINISHED");
}

async function main() {
  testConceptKey();
  testFlags();
  testSignedMediaTtl();
  await testMetaClientNoTokenInUrl();
  await testCarouselMultiImage();
  await testDryRunNoMetaHttp();
  await testApprovalGate();
  await testIdempotencyAndLostAck();
  await testFailedFreesSlot();
  testHumanErrors();
  await testWaitFinished();
  console.log("\nOK: Instagram Phase 3B verify.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
