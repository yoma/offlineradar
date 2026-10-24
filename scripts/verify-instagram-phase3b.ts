/**
 * Phase 3B: Meta publish wiring — unit + optional Neon checks.
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
import { publishInstagramConcept } from "@/lib/instagram/publish";
import {
  createInstagramMediaTicket,
  verifyInstagramMediaTicket,
} from "@/lib/instagram/signed-media";

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

function testConceptKey() {
  const a = buildInstagramConceptKey("binnenkort", ["b", "a"]);
  const b = buildInstagramConceptKey("binnenkort", ["a", "b", "a"]);
  const c = buildInstagramConceptKey("nieuw", ["a", "b"]);
  assert.equal(a, b, "concept key ignores order/dupes");
  assert.notEqual(a, c, "format changes key");
  assert.equal(a.length, 64);
  ok("1. concept key stable + unique per format");
}

function testFlags() {
  withEnv(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: undefined,
      INSTAGRAM_META_DRY_RUN: undefined,
    },
    () => {
      assert.equal(readInstagramMetaConfig().mode, "disabled");
    },
  );
  withEnv(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: undefined,
      INSTAGRAM_META_DRY_RUN: "1",
    },
    () => {
      assert.equal(readInstagramMetaConfig().mode, "dry_run");
    },
  );
  withEnv(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: "1",
      INSTAGRAM_META_DRY_RUN: undefined,
      META_IG_USER_ID: "123",
      META_PAGE_ACCESS_TOKEN: "tok",
    },
    () => {
      const cfg = readInstagramMetaConfig();
      assert.equal(cfg.mode, "live");
      assert.equal(cfg.missingForLive.length, 0);
    },
  );
  withEnv(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: "1",
      INSTAGRAM_META_DRY_RUN: "1",
    },
    () => {
      // Dry-run wins so accidental live is harder.
      assert.equal(readInstagramMetaConfig().mode, "dry_run");
    },
  );
  ok("2. feature flags default off; dry-run overrides live");
}

function testSignedMedia() {
  withEnv({ INSTAGRAM_IMAGE_SIGNING_SECRET: "phase3b-test-secret" }, () => {
    const created = createInstagramMediaTicket("deze_week", {
      kind: "deze_week",
      ids: "e1,e2",
      period: "Deze week",
    });
    assert.ok("token" in created);
    const verified = verifyInstagramMediaTicket(
      (created as { token: string }).token,
    );
    assert.equal(verified.ok, true);
    if (verified.ok) {
      assert.equal(verified.ticket.kind, "deze_week");
      assert.equal(verified.ticket.q.ids, "e1,e2");
    }
    const bad = verifyInstagramMediaTicket("not.a.token");
    assert.equal(bad.ok, false);
  });
  ok("3. signed media tickets verify + reject tamper");
}

async function testMetaClientMock() {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/media_publish")) {
      return new Response(JSON.stringify({ id: "media_9" }), { status: 200 });
    }
    if (url.includes("/media") && !url.includes("fields=")) {
      return new Response(JSON.stringify({ id: "container_1" }), {
        status: 200,
      });
    }
    if (url.includes("fields=status_code")) {
      return new Response(JSON.stringify({ status_code: "FINISHED" }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ error: { message: "nope" } }), {
      status: 400,
    });
  };

  const client = createMetaClient({
    igUserId: "ig1",
    accessToken: "token",
    graphApiVersion: "v22.0",
    graphHost: "graph.facebook.com",
    fetchImpl,
  });

  const created = await client.createImageContainer({
    imageUrl: "https://example.com/a.jpg",
    caption: "hi",
  });
  assert.equal(created.ok, true);
  const ready = await waitForContainerFinished(client, "container_1", {
    attempts: 2,
    delayMs: 1,
    sleep: async () => {},
  });
  assert.equal(ready.ok, true);
  const published = await client.publishContainer("container_1");
  assert.equal(published.ok, true);
  if (published.ok) assert.equal(published.data.id, "media_9");
  assert.ok(calls.some((u) => u.includes("access_token=token")));
  assert.ok(!calls.some((u) => u.includes("NEXT_PUBLIC")));
  ok("4. Meta client create → status → publish (mock)");
}

async function testDisabledPublish() {
  await withEnvAsync(
    {
      INSTAGRAM_META_PUBLISH_ENABLED: undefined,
      INSTAGRAM_META_DRY_RUN: undefined,
    },
    async () => {
      const res = await publishInstagramConcept({
        draft: {
          format: "deze_week",
          eventIds: ["e-verify-1"],
          caption: "test",
          slides: [
            {
              kind: "deze_week",
              label: "x",
              query: { kind: "deze_week", ids: "e-verify-1" },
            },
          ],
        },
      });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, "disabled");
        assert.match(res.message, /uit/i);
      }
    },
  );
  ok("5. publish blocked when flags off (clear NL error)");
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

async function testLiveIdempotencyWithMockMeta() {
  // Requires Neon + migration. Skip soft if unavailable.
  const { getEventsSql } = await import("@/lib/events/db");
  const sql = getEventsSql();
  if (!sql) {
    console.log("SKIP: 6. neon idempotency (SQL unavailable)");
    return;
  }

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'instagram_publishes'
  `;
  if (tables.length === 0) {
    console.log("SKIP: 6. neon idempotency (run db:migrate:instagram-publishes)");
    return;
  }

  const eventId = `ig3b-verify-${Date.now()}`;
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
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(first.ok, true, first.ok ? "" : first.message);
      if (first.ok) {
        assert.equal(first.mode, "live");
        assert.ok(first.publish.metaMediaId);
      }

      const second = await publishInstagramConcept({
        draft,
        metaClient,
        publicBaseUrl: "https://dateofflinehub.be",
      });
      assert.equal(second.ok, false);
      if (!second.ok) assert.equal(second.code, "already_published");
      assert.equal(publishCalls, 1, "Meta publish path called once");
    },
  );

  // cleanup probe row(s)
  await sql`DELETE FROM instagram_publishes WHERE event_ids::text LIKE ${"%" + eventId + "%"}`;
  ok("6. neon idempotency blocks duplicate Meta publish");
}

function testHumanErrors() {
  assert.match(humanMetaPublishError("disabled"), /INSTAGRAM_META/);
  assert.match(humanMetaPublishError("already_published"), /al gepubliceerd/i);
  assert.match(humanMetaPublishError("meta_auth"), /token/i);
  ok("7. Dutch error messages");
}

async function main() {
  testConceptKey();
  testFlags();
  testSignedMedia();
  await testMetaClientMock();
  await testDisabledPublish();
  await testLiveIdempotencyWithMockMeta();
  testHumanErrors();
  console.log("\nOK: Instagram Phase 3B verify.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
