/**
 * Offline Phase 3B regressions (no Neon, no real Meta HTTP).
 * Always required for release readiness of publish safety.
 */
import assert from "node:assert/strict";
import {
  buildInstagramConceptKey,
  buildInstagramContentFingerprint,
  slideEventIdsMatchConcept,
} from "@/lib/instagram/concept-key";
import { createMetaClient } from "@/lib/instagram/meta-client";
import {
  canReleasePendingForStatus,
  isAmbiguousPostPublishError,
  META_CAROUSEL_TOTAL_BUDGET_MS,
  META_HTTP_TIMEOUT_MS,
} from "@/lib/instagram/publish-policy";
import {
  publishInstagramConcept,
  publishLiveToMeta,
  type PublishCollaborators,
} from "@/lib/instagram/publish";
import type { InstagramPublishRow } from "@/lib/instagram/publish-store";
import {
  INSTAGRAM_MEDIA_TICKET_TTL_SEC,
  createInstagramMediaTicket,
  verifyInstagramMediaTicket,
} from "@/lib/instagram/signed-media";

function ok(label: string) {
  console.log(`OK: ${label}`);
}

type Row = InstagramPublishRow;

function makeStore() {
  const rows: Row[] = [];
  let failPersist = false;

  const asRow = (partial: Partial<Row> & Pick<Row, "conceptKey" | "format">): Row => ({
    id: partial.id ?? String(rows.length + 1),
    conceptKey: partial.conceptKey,
    format: partial.format,
    eventIds: partial.eventIds ?? ["e1"],
    caption: partial.caption ?? "c",
    slideCount: partial.slideCount ?? 1,
    status: partial.status ?? "pending",
    dryRun: partial.dryRun ?? false,
    metaContainerId: partial.metaContainerId ?? null,
    metaMediaId: partial.metaMediaId ?? null,
    errorCode: partial.errorCode ?? null,
    errorMessage: partial.errorMessage ?? null,
    contentFingerprint: partial.contentFingerprint ?? null,
    recoveryLeaseUntil: partial.recoveryLeaseUntil ?? null,
    requestedBy: partial.requestedBy ?? null,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    finishedAt: partial.finishedAt ?? null,
  });

  const deps: Partial<PublishCollaborators> = {
    claimPublishAttempt: async (input) => {
      const existing = rows.find(
        (r) =>
          r.conceptKey === input.conceptKey &&
          ["pending", "uncertain", "published"].includes(r.status),
      );
      if (existing) return { ok: true as const, row: { ...existing }, created: false };
      const row = asRow({
        conceptKey: input.conceptKey,
        format: input.format,
        eventIds: input.eventIds,
        caption: input.caption,
        slideCount: input.slideCount,
        dryRun: input.dryRun,
        contentFingerprint: input.contentFingerprint ?? null,
        status: "pending",
      });
      rows.push(row);
      return { ok: true as const, row: { ...row }, created: true };
    },
    persistContainerIdBeforePublish: async (id, containerId) => {
      if (failPersist) return null;
      const row = rows.find((r) => r.id === id);
      if (!row || row.status !== "pending") return null;
      row.metaContainerId = containerId;
      row.updatedAt = new Date().toISOString();
      return { ...row };
    },
    finishPublishAttempt: async (id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (!row || !["pending", "uncertain"].includes(row.status)) return null;
      Object.assign(row, {
        status: patch.status,
        metaContainerId: patch.metaContainerId ?? row.metaContainerId,
        metaMediaId:
          patch.metaMediaId !== undefined ? patch.metaMediaId : row.metaMediaId,
        errorCode: patch.errorCode ?? null,
        errorMessage: patch.errorMessage ?? null,
        updatedAt: new Date().toISOString(),
        finishedAt: ["published", "failed", "dry_run"].includes(patch.status)
          ? new Date().toISOString()
          : null,
      });
      return { ...row };
    },
    markPublishUncertain: async (id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (!row || !["pending", "uncertain"].includes(row.status)) return null;
      row.status = "uncertain";
      row.metaContainerId = patch.metaContainerId ?? row.metaContainerId;
      row.errorCode = patch.errorCode;
      row.errorMessage = patch.errorMessage;
      row.updatedAt = new Date().toISOString();
      row.finishedAt = null;
      return { ...row };
    },
    acquireRecoveryLease: async (id) => {
      const row = rows.find((r) => r.id === id);
      if (!row || !["pending", "uncertain"].includes(row.status)) return null;
      if (
        row.recoveryLeaseUntil &&
        Date.parse(row.recoveryLeaseUntil) > Date.now()
      ) {
        return null;
      }
      row.recoveryLeaseUntil = new Date(Date.now() + 60_000).toISOString();
      row.updatedAt = new Date().toISOString();
      return { ...row };
    },
    findActivePublish: async (conceptKey) => {
      const row = rows.find(
        (r) =>
          r.conceptKey === conceptKey &&
          ["pending", "uncertain", "published"].includes(r.status),
      );
      return row ? { ...row } : null;
    },
    assertConceptContentApproved: async () => ({
      ok: true as const,
      conceptKey: "x",
      contentFingerprint: "y",
    }),
    recordConceptEventIds: async () => ({ stored: "neon" as const, count: 1 }),
  };

  return {
    rows,
    deps,
    setFailPersist: (v: boolean) => {
      failPersist = v;
    },
    reset: () => {
      rows.length = 0;
      failPersist = false;
    },
  };
}

function draft(caption = "approved") {
  return {
    format: "deze_week" as const,
    eventIds: ["e1"],
    caption,
    slides: [
      {
        kind: "deze_week" as const,
        label: "one",
        query: { ids: "e1" },
      },
    ],
  };
}

async function withLiveEnv(fn: () => Promise<void>) {
  const prev = { ...process.env };
  process.env.INSTAGRAM_META_PUBLISH_ENABLED = "1";
  delete process.env.INSTAGRAM_META_DRY_RUN;
  process.env.META_IG_USER_ID = "ig";
  process.env.META_PAGE_ACCESS_TOKEN = "tok";
  process.env.INSTAGRAM_IMAGE_SIGNING_SECRET = "offline-secret";
  try {
    await fn();
  } finally {
    process.env = prev;
  }
}

async function testLostAckKeepsSlot() {
  await withLiveEnv(async () => {
    const store = makeStore();
    let creates = 0;
    let posts = 0;
    const client = {
      createImageContainer: async () => {
        creates += 1;
        return { ok: true as const, data: { id: `c${creates}` } };
      },
      createCarouselContainer: async () => {
        throw new Error("unused");
      },
      getContainerStatus: async () => ({
        ok: true as const,
        data: { status_code: "FINISHED" },
      }),
      publishContainer: async () => {
        posts += 1;
        return {
          ok: false as const,
          error: {
            code: "meta_network",
            message: "ack lost after accepted publish",
          },
        };
      },
    };

    const input = {
      draft: draft(),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      skipApprovalCheck: true,
      deps: store.deps,
    };

    const r1 = await publishInstagramConcept(input);
    assert.equal(r1.ok, false);
    if (!r1.ok) assert.equal(r1.code, "publish_uncertain");
    assert.equal(store.rows[0]?.status, "uncertain");
    assert.equal(store.rows[0]?.metaContainerId, "c1");

    const r2 = await publishInstagramConcept(input);
    assert.equal(r2.ok, false);
    if (!r2.ok) {
      assert.ok(
        r2.code === "publish_uncertain" || r2.code === "publish_in_progress",
      );
    }
    assert.equal(creates, 1, "must not create a second container");
    assert.equal(posts, 1, "must not call media_publish again while uncertain");
  });
  ok("R1. lost publish ack → uncertain slot, no duplicate container");
}

async function testPersistRequiredBeforePublish() {
  await withLiveEnv(async () => {
    const store = makeStore();
    store.setFailPersist(true);
    let posts = 0;
    const client = {
      createImageContainer: async () => ({
        ok: true as const,
        data: { id: "c1" },
      }),
      createCarouselContainer: async () => {
        throw new Error("unused");
      },
      getContainerStatus: async () => ({
        ok: true as const,
        data: { status_code: "FINISHED" },
      }),
      publishContainer: async () => {
        posts += 1;
        return { ok: true as const, data: { id: "m1" } };
      },
    };
    const r = await publishInstagramConcept({
      draft: draft(),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      skipApprovalCheck: true,
      deps: store.deps,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "container_persist_failed");
    assert.equal(posts, 0, "media_publish must not run without Neon persist");
  });
  ok("R2. persist null → stop before media_publish");
}

async function testDryRunDoesNotFreeLive() {
  await withLiveEnv(async () => {
    const store = makeStore();
    let creates = 0;
    const client = {
      createImageContainer: async () => {
        creates += 1;
        return { ok: true as const, data: { id: `c${creates}` } };
      },
      createCarouselContainer: async () => {
        throw new Error("unused");
      },
      getContainerStatus: async () => ({
        ok: false as const,
        error: { code: "meta_network", message: "offline" },
      }),
      publishContainer: async () => ({
        ok: false as const,
        error: { code: "meta_network", message: "ack lost" },
      }),
    };

    await publishInstagramConcept({
      draft: draft(),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      skipApprovalCheck: true,
      deps: store.deps,
    });
    store.rows[0]!.status = "pending";
    store.rows[0]!.updatedAt = new Date(0).toISOString();
    store.rows[0]!.dryRun = false;

    process.env.INSTAGRAM_META_DRY_RUN = "1";
    const r = await publishInstagramConcept({
      draft: draft(),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      skipApprovalCheck: true,
      deps: store.deps,
    });
    delete process.env.INSTAGRAM_META_DRY_RUN;

    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "dry_run_blocked_by_live");
    assert.equal(store.rows[0]!.status, "pending");
    assert.equal(store.rows.length, 1, "no replacement dry_run row");
  });
  ok("R3. dry-run cannot free unresolved live pending");
}

async function testStatusLookupKeepsBlocked() {
  await withLiveEnv(async () => {
    const store = makeStore();
    let creates = 0;
    const client = {
      createImageContainer: async () => {
        creates += 1;
        return { ok: true as const, data: { id: `c${creates}` } };
      },
      createCarouselContainer: async () => {
        throw new Error("unused");
      },
      getContainerStatus: async () => ({
        ok: false as const,
        error: { code: "meta_network", message: "offline" },
      }),
      publishContainer: async () => ({
        ok: false as const,
        error: { code: "meta_network", message: "ack lost" },
      }),
    };
    await publishInstagramConcept({
      draft: draft(),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      skipApprovalCheck: true,
      deps: store.deps,
    });
    store.rows[0]!.status = "uncertain";
    store.rows[0]!.updatedAt = new Date(0).toISOString();
    const before = creates;
    const r = await publishInstagramConcept({
      draft: draft(),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      skipApprovalCheck: true,
      deps: store.deps,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "publish_uncertain");
    assert.equal(creates, before, "no replacement container on status failure");
  });
  ok("R4. status lookup failure keeps slot blocked");
}

async function testContentFingerprintApproval() {
  const base = {
    format: "deze_week" as const,
    eventIds: ["e1", "e2"],
    caption: "Hello",
    slides: [
      {
        kind: "deze_week" as const,
        label: "x",
        query: { ids: "e1,e2" },
      },
    ],
  };
  const a = buildInstagramContentFingerprint(base);
  const b = buildInstagramContentFingerprint({
    ...base,
    caption: "Changed",
  });
  const c = buildInstagramContentFingerprint({
    ...base,
    slides: [
      {
        kind: "deze_week",
        label: "x",
        query: { ids: "e2,e1" },
      },
    ],
  });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(
    slideEventIdsMatchConcept(["e1"], [
      { kind: "deze_week", label: "x", query: { ids: "other" } },
    ]),
    false,
  );
  // concept key ignores order; content fingerprint does not for ids list order in slides
  assert.equal(
    buildInstagramConceptKey("deze_week", ["e2", "e1"]),
    buildInstagramConceptKey("deze_week", ["e1", "e2"]),
  );
  ok("R5. content fingerprint binds caption/slides; separate from concept key");
}

async function testNoFakeMediaId() {
  await withLiveEnv(async () => {
    const store = makeStore();
    const client = {
      createImageContainer: async () => ({
        ok: true as const,
        data: { id: "container_only" },
      }),
      createCarouselContainer: async () => {
        throw new Error("unused");
      },
      getContainerStatus: async () => ({
        ok: true as const,
        data: { status_code: "PUBLISHED" },
      }),
      publishContainer: async () => ({
        ok: false as const,
        error: {
          code: "meta_already_published",
          message: "already published",
        },
      }),
    };
    // First create uncertain with container
    store.rows.push({
      id: "1",
      conceptKey: buildInstagramConceptKey("deze_week", ["e1"]),
      format: "deze_week",
      eventIds: ["e1"],
      caption: "approved",
      slideCount: 1,
      status: "uncertain",
      dryRun: false,
      metaContainerId: "container_only",
      metaMediaId: null,
      errorCode: "publish_uncertain",
      errorMessage: "x",
      contentFingerprint: null,
      recoveryLeaseUntil: null,
      requestedBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      finishedAt: null,
    });
    const r = await publishInstagramConcept({
      draft: draft(),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      skipApprovalCheck: true,
      deps: store.deps,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.publish.metaMediaId, null);
      assert.notEqual(r.publish.metaMediaId, "container_only");
      assert.ok(!String(r.publish.metaMediaId ?? "").startsWith("published:"));
    }
  });
  ok("R6. PUBLISHED without media id → null, never container/fake id");
}

async function testCarouselAndTimeouts() {
  assert.ok(META_HTTP_TIMEOUT_MS >= 5_000);
  assert.ok(META_CAROUSEL_TOTAL_BUDGET_MS >= 60_000);
  assert.ok(INSTAGRAM_MEDIA_TICKET_TTL_SEC >= 6 * 60 * 60);

  const calls: string[] = [];
  const client = {
    createImageContainer: async ({ isCarouselItem }: { isCarouselItem?: boolean }) => {
      calls.push(isCarouselItem ? "child" : "single");
      return { ok: true as const, data: { id: `child_${calls.length}` } };
    },
    createCarouselContainer: async ({
      children,
    }: {
      children: string[];
      caption: string;
    }) => {
      calls.push(`carousel:${children.length}`);
      return { ok: true as const, data: { id: "carousel_1" } };
    },
    publishContainer: async (id: string) => {
      calls.push(`publish:${id}`);
      return { ok: true as const, data: { id: "media_1" } };
    },
    getContainerStatus: async () => ({
      ok: true as const,
      data: { status_code: "FINISHED" },
    }),
  };
  const res = await publishLiveToMeta({
    client,
    caption: "cap",
    imageUrls: ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"],
  });
  assert.equal(res.ok, true);
  assert.deepEqual(
    calls.filter((c) => c === "child"),
    ["child", "child", "child"],
  );

  // Token not in URL
  const urls: string[] = [];
  const bodies: string[] = [];
  const meta = createMetaClient({
    igUserId: "ig",
    accessToken: "secret-token",
    graphApiVersion: "v22.0",
    graphHost: "graph.facebook.com",
    timeoutMs: 50,
    fetchImpl: async (input, init) => {
      urls.push(String(input));
      bodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    },
  });
  await meta.createImageContainer({ imageUrl: "https://x/a.jpg" });
  assert.ok(urls.every((u) => !u.includes("secret-token")));
  assert.ok(bodies.some((b) => b.includes("access_token=secret-token")));

  assert.equal(isAmbiguousPostPublishError("meta_network"), true);
  assert.equal(
    canReleasePendingForStatus({
      statusOk: false,
      hasContainerId: true,
      mode: "live",
      rowIsLiveAttempt: true,
    }),
    "keep_blocked",
  );

  withEnvSecret(() => {
    const now = Date.now();
    const t = createInstagramMediaTicket("deze_week", { ids: "e1" }, now);
    assert.ok("token" in t);
    assert.equal(
      verifyInstagramMediaTicket((t as { token: string }).token, now + 5 * 3600_000)
        .ok,
      true,
    );
  });

  ok("R7. carousel path + timeouts + policy helpers + JWT TTL");
}

function withEnvSecret(fn: () => void) {
  const prev = process.env.INSTAGRAM_IMAGE_SIGNING_SECRET;
  process.env.INSTAGRAM_IMAGE_SIGNING_SECRET = "offline-secret";
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.INSTAGRAM_IMAGE_SIGNING_SECRET;
    else process.env.INSTAGRAM_IMAGE_SIGNING_SECRET = prev;
  }
}

async function testParallelRecoveryLease() {
  await withLiveEnv(async () => {
    const store = makeStore();
    store.rows.push({
      id: "lease-1",
      conceptKey: buildInstagramConceptKey("deze_week", ["e1"]),
      format: "deze_week",
      eventIds: ["e1"],
      caption: "approved",
      slideCount: 1,
      status: "uncertain",
      dryRun: false,
      metaContainerId: "c1",
      metaMediaId: null,
      errorCode: "publish_uncertain",
      errorMessage: "x",
      contentFingerprint: null,
      recoveryLeaseUntil: null,
      requestedBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      finishedAt: null,
    });
    const client = {
      createImageContainer: async () => ({
        ok: true as const,
        data: { id: "nope" },
      }),
      createCarouselContainer: async () => {
        throw new Error("unused");
      },
      getContainerStatus: async () => ({
        ok: true as const,
        data: { status_code: "IN_PROGRESS" },
      }),
      publishContainer: async () => ({
        ok: true as const,
        data: { id: "m" },
      }),
    };
    const [a, b] = await Promise.all([
      publishInstagramConcept({
        draft: draft(),
        metaClient: client,
        publicBaseUrl: "https://example.invalid",
        skipApprovalCheck: true,
        deps: store.deps,
      }),
      publishInstagramConcept({
        draft: draft(),
        metaClient: client,
        publicBaseUrl: "https://example.invalid",
        skipApprovalCheck: true,
        deps: store.deps,
      }),
    ]);
    const codes = [a, b].map((r) => (r.ok ? "ok" : r.code));
    assert.ok(codes.includes("publish_uncertain") || codes.includes("recovery_in_progress"));
    assert.ok(!codes.includes("ok") || codes.filter((c) => c === "ok").length <= 1);
  });
  ok("R8. parallel recovery: lease prevents double recovery");
}

async function main() {
  await testLostAckKeepsSlot();
  await testPersistRequiredBeforePublish();
  await testDryRunDoesNotFreeLive();
  await testStatusLookupKeepsBlocked();
  await testContentFingerprintApproval();
  await testNoFakeMediaId();
  await testCarouselAndTimeouts();
  await testParallelRecoveryLease();
  console.log("\nOK: Instagram Phase 3B offline regressions.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
