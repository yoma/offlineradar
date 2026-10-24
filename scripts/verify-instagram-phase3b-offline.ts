/**
 * Offline Phase 3B regressions (no Neon, no real Meta HTTP).
 * Always required for release readiness of publish safety.
 */
import assert from "node:assert/strict";
import {
  packApprovalSlides,
  unpackApprovalSlides,
} from "@/lib/instagram/approvals";
import {
  buildInstagramConceptKey,
  buildInstagramContentFingerprint,
  slideEventIdsMatchConcept,
} from "@/lib/instagram/concept-key";
import {
  eventsFromSnapshots,
  liveEventsMatchSnapshots,
  snapshotFromEvent,
  type InstagramEventSnapshot,
} from "@/lib/instagram/event-snapshot";
import {
  createMetaClient,
  remainingBudgetMs,
  waitForContainerFinished,
} from "@/lib/instagram/meta-client";
import { imageForEvent } from "@/lib/instagram/mood";
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
import type { Event } from "@/types/event";

function ok(label: string) {
  console.log(`OK: ${label}`);
}

type Row = InstagramPublishRow;

function sampleSnapshots(
  overrides: Partial<InstagramEventSnapshot> = {},
): InstagramEventSnapshot[] {
  const first: InstagramEventSnapshot = {
    id: overrides.id ?? "e1",
    title: overrides.title ?? "Speeddate Brussel",
    startDate: overrides.startDate ?? "2026-10-24",
    startTime:
      overrides.startTime !== undefined ? overrides.startTime : "20:00",
    city: overrides.city ?? "Brussel",
    region: overrides.region ?? "Brussel",
    venue: overrides.venue !== undefined ? overrides.venue : "Café Central",
    organizerName: overrides.organizerName ?? "Org",
    organizerId:
      overrides.organizerId !== undefined ? overrides.organizerId : "org-1",
    organizerSlug:
      overrides.organizerSlug !== undefined
        ? overrides.organizerSlug
        : "org-1",
    imageUrl:
      overrides.imageUrl !== undefined
        ? overrides.imageUrl
        : "https://example.invalid/a.jpg",
    imageIsAtmosphere:
      overrides.imageIsAtmosphere !== undefined
        ? overrides.imageIsAtmosphere
        : false,
    shortDescription:
      overrides.shortDescription !== undefined
        ? overrides.shortDescription
        : "Gezellige avond voor singles 28-40",
    description:
      overrides.description !== undefined
        ? overrides.description
        : "Lange beschrijving van de speeddate.",
    category: overrides.category ?? "dating",
    subCategory: overrides.subCategory ?? "speeddate",
    eligibilityAgeMin:
      overrides.eligibilityAgeMin !== undefined
        ? overrides.eligibilityAgeMin
        : 28,
    eligibilityAgeMax:
      overrides.eligibilityAgeMax !== undefined
        ? overrides.eligibilityAgeMax
        : 40,
    eligibilityAgeRule: overrides.eligibilityAgeRule ?? "guideline",
    activities: overrides.activities ?? ["speeddate"],
    tags: overrides.tags ?? ["singles", "brussel"],
  };
  return [
    first,
    {
      id: "e2",
      title: "Walk Antwerpen",
      startDate: "2026-10-25",
      startTime: null,
      city: "Antwerpen",
      region: "Antwerpen",
      venue: null,
      organizerName: "Org2",
      organizerId: null,
      organizerSlug: null,
      imageUrl: null,
      imageIsAtmosphere: true,
      shortDescription: "Wandeling in het park",
      description: null,
      category: "meet_new_people",
      subCategory: "wandelen",
      eligibilityAgeMin: 25,
      eligibilityAgeMax: 45,
      eligibilityAgeRule: "strict",
      activities: ["wandelen", "outdoor"],
      tags: ["antwerpen"],
    },
  ];
}

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
      contentFingerprint: "y".repeat(32),
      eventSnapshots: sampleSnapshots({ id: "e1" }).slice(0, 1),
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
    eventSnapshots: sampleSnapshots(),
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
  const d = buildInstagramContentFingerprint({
    ...base,
    eventSnapshots: sampleSnapshots({ title: "Nieuwe titel" }),
  });
  const e = buildInstagramContentFingerprint({
    ...base,
    eventSnapshots: sampleSnapshots({ startDate: "2026-11-01" }),
  });
  const f = buildInstagramContentFingerprint({
    ...base,
    eventSnapshots: sampleSnapshots({ city: "Gent" }),
  });
  const g = buildInstagramContentFingerprint({
    ...base,
    eventSnapshots: sampleSnapshots({ shortDescription: "Andere blurb" }),
  });
  const h = buildInstagramContentFingerprint({
    ...base,
    eventSnapshots: sampleSnapshots({ eligibilityAgeMin: 30 }),
  });
  const i = buildInstagramContentFingerprint({
    ...base,
    eventSnapshots: sampleSnapshots({ activities: ["eten"] }),
  });
  const crlf = buildInstagramContentFingerprint({
    ...base,
    caption: "Hello\r\nWorld",
  });
  const lf = buildInstagramContentFingerprint({
    ...base,
    caption: "Hello\nWorld",
  });
  assert.equal(
    crlf,
    lf,
    "FormData CRLF captions must match server LF captions",
  );
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.notEqual(a, e);
  assert.notEqual(a, f);
  assert.notEqual(a, g);
  assert.notEqual(a, h);
  assert.notEqual(a, i);
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
  ok("R5. content fingerprint binds caption/slides/event snapshots; separate from concept key");
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

  // Carousel budget: polling stops when deadline is reached.
  let polls = 0;
  const budgetClient = {
    createImageContainer: async () => ({
      ok: true as const,
      data: { id: "c" },
    }),
    createCarouselContainer: async () => ({
      ok: true as const,
      data: { id: "c" },
    }),
    publishContainer: async () => ({
      ok: true as const,
      data: { id: "m" },
    }),
    getContainerStatus: async () => {
      polls += 1;
      return {
        ok: true as const,
        data: { status_code: "IN_PROGRESS" },
      };
    },
  };
  const deadlineMs = Date.now() + 40;
  const waited = await waitForContainerFinished(budgetClient, "c1", {
    attempts: 20,
    delayMs: 5,
    deadlineMs,
    sleep: async (ms) => {
      await new Promise((r) => setTimeout(r, Math.max(ms, 45)));
    },
  });
  assert.equal(waited.ok, false);
  if (!waited.ok) assert.equal(waited.error.code, "meta_container_timeout");
  assert.ok(polls >= 1 && polls <= 3, `expected few polls, got ${polls}`);
  assert.equal(remainingBudgetMs(Date.now() - 1), 0);

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
    const fp = "f".repeat(32);
    const t = createInstagramMediaTicket("deze_week", { ids: "e1" }, fp, now);
    assert.ok("token" in t);
    const verified = verifyInstagramMediaTicket(
      (t as { token: string }).token,
      now + 5 * 3600_000,
    );
    assert.equal(verified.ok, true);
    if (verified.ok) {
      assert.equal(verified.ticket.v, 2);
      assert.equal(verified.ticket.fp, fp);
    }
    const legacy = createInstagramMediaTicket(
      "deze_week",
      { ids: "e1" },
      "",
      now,
    );
    assert.ok("error" in legacy);
  });

  ok("R7. carousel path + timeouts + policy helpers + JWT TTL + fp ticket");
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

async function testEventSnapshotDriftAndFrozenRender() {
  const approved = sampleSnapshots();
  const packed = packApprovalSlides(
    [{ kind: "deze_week", label: "x", query: { ids: "e1,e2" } }],
    approved,
  );
  const unpacked = unpackApprovalSlides(packed);
  assert.ok(unpacked);
  assert.equal(unpacked!.v, 2);
  assert.equal(unpacked!.eventSnapshots[0]!.title, "Speeddate Brussel");

  // Legacy array slides cannot authorize frozen render.
  assert.equal(unpackApprovalSlides([{ kind: "deze_week" }]), null);

  const frozen = eventsFromSnapshots(approved);
  assert.equal(frozen[0]!.title, "Speeddate Brussel");
  assert.equal(frozen[0]!.city, "Brussel");
  assert.equal(frozen[0]!.region, "Brussel");
  assert.equal(frozen[0]!.startDate, "2026-10-24");
  assert.equal(frozen[0]!.shortDescription, "Gezellige avond voor singles 28-40");
  assert.equal(frozen[0]!.eligibilityAgeMin, 28);
  assert.equal(frozen[0]!.eligibilityAgeMax, 40);
  assert.equal(frozen[0]!.eligibilityAgeRule, "guideline");
  assert.deepEqual(frozen[0]!.activities, ["speeddate"]);
  assert.equal(frozen[0]!.venue, "Café Central");
  assert.equal(frozen[0]!.imageUrl, "https://example.invalid/a.jpg");
  assert.equal(frozen[0]!.imageIsAtmosphere, false);

  // Distinct frozen render/image inputs produce distinct website-visible picks.
  const dinnerSnap = sampleSnapshots({
    title: "Dinner night",
    subCategory: "eten",
    tags: [],
    activities: ["eten"],
    eligibilityAgeMin: 18,
    eligibilityAgeMax: 99,
    shortDescription: "Eten met singles",
    imageUrl: null,
    imageIsAtmosphere: true,
  })[0]!;
  const approvedImage = imageForEvent(frozen[0]!);
  const dinnerImage = imageForEvent(eventsFromSnapshots([dinnerSnap])[0]!);
  assert.notEqual(approvedImage.url, dinnerImage.url);
  // Late Meta path keeps the approved pick from frozen snapshots.
  assert.equal(
    imageForEvent(eventsFromSnapshots(approved)[0]!).url,
    approvedImage.url,
  );

  const liveOk: Event[] = frozen.map((e) => ({ ...e }));
  assert.equal(liveEventsMatchSnapshots(liveOk, approved, ["e1", "e2"]), true);

  const liveTitleDrift: Event[] = frozen.map((e, i) =>
    i === 0 ? { ...e, title: "Gewijzigde titel" } : e,
  );
  assert.equal(
    liveEventsMatchSnapshots(liveTitleDrift, approved, ["e1", "e2"]),
    false,
  );

  const liveDateDrift: Event[] = frozen.map((e, i) =>
    i === 0 ? { ...e, startDate: "2026-12-01" } : e,
  );
  assert.equal(
    liveEventsMatchSnapshots(liveDateDrift, approved, ["e1", "e2"]),
    false,
  );

  const liveCityDrift: Event[] = frozen.map((e, i) =>
    i === 0 ? { ...e, city: "Gent" } : e,
  );
  assert.equal(
    liveEventsMatchSnapshots(liveCityDrift, approved, ["e1", "e2"]),
    false,
  );

  // Snapshot from a mutated live event must not equal the approved snapshot.
  const mutated = snapshotFromEvent(liveTitleDrift[0]!);
  assert.notEqual(mutated.title, approved[0]!.title);

  // Late Meta fetch path: ticket fp → frozen catalog (not live drift).
  withEnvSecret(() => {
    const fp = buildInstagramContentFingerprint({
      format: "deze_week",
      eventIds: ["e1", "e2"],
      caption: "Hello",
      slides: [
        { kind: "deze_week", label: "x", query: { ids: "e1,e2" } },
      ],
      eventSnapshots: approved,
    });
    const ticket = createInstagramMediaTicket(
      "deze_week",
      { ids: "e1,e2" },
      fp,
    );
    assert.ok("token" in ticket);
    const verified = verifyInstagramMediaTicket(
      (ticket as { token: string }).token,
    );
    assert.equal(verified.ok, true);
    if (verified.ok) {
      // Simulate public-media: load approval by fp, render from snapshots
      // even if "live" catalog already drifted.
      assert.equal(verified.ticket.fp, fp);
      const fromApproval = eventsFromSnapshots(unpacked!.eventSnapshots);
      assert.equal(fromApproval[0]!.title, "Speeddate Brussel");
      assert.notEqual(fromApproval[0]!.title, liveTitleDrift[0]!.title);
      assert.equal(fromApproval[0]!.city, "Brussel");
      assert.equal(fromApproval[0]!.startDate, "2026-10-24");
      assert.equal(
        fromApproval[0]!.shortDescription,
        "Gezellige avond voor singles 28-40",
      );
      assert.deepEqual(fromApproval[0]!.activities, ["speeddate"]);
      assert.equal(fromApproval[0]!.eligibilityAgeMin, 28);
      assert.equal(fromApproval[0]!.eligibilityAgeMax, 40);
      assert.equal(imageForEvent(fromApproval[0]!).url, approvedImage.url);
      assert.notEqual(imageForEvent(fromApproval[0]!).url, dinnerImage.url);
    }
  });

  ok("R9. event snapshots freeze title/date/city/age/blurb/activity/image; Meta late fetch uses fp");
}

async function testRecoveryBlocksFingerprintMismatch() {
  await withLiveEnv(async () => {
    const store = makeStore();
    const approvedFp = "a".repeat(32);
    const oldFp = "b".repeat(32);
    let publishCalls = 0;
    store.rows.push({
      id: "old-1",
      conceptKey: buildInstagramConceptKey("deze_week", ["e1"]),
      format: "deze_week",
      eventIds: ["e1"],
      caption: "old caption",
      slideCount: 1,
      status: "pending",
      dryRun: false,
      metaContainerId: "old_container",
      metaMediaId: null,
      errorCode: null,
      errorMessage: null,
      contentFingerprint: oldFp,
      recoveryLeaseUntil: null,
      requestedBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      finishedAt: null,
    });
    store.deps.assertConceptContentApproved = async () => ({
      ok: true as const,
      conceptKey: buildInstagramConceptKey("deze_week", ["e1"]),
      contentFingerprint: approvedFp,
      eventSnapshots: sampleSnapshots().slice(0, 1),
    });
    const client = {
      createImageContainer: async () => ({
        ok: true as const,
        data: { id: "new_c" },
      }),
      createCarouselContainer: async () => {
        throw new Error("unused");
      },
      getContainerStatus: async () => ({
        ok: true as const,
        data: { status_code: "FINISHED" },
      }),
      publishContainer: async () => {
        publishCalls += 1;
        return { ok: true as const, data: { id: "media_should_not" } };
      },
    };

    // Caption / slides / events changed vs old attempt fingerprint.
    const r = await publishInstagramConcept({
      draft: {
        ...draft("new caption after re-approval"),
        slides: [
          {
            kind: "deze_week",
            label: "one",
            query: { ids: "e1", note: "changed" },
          },
        ],
      },
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      deps: store.deps,
      checkLiveEventDrift: false,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "content_mismatch");
    assert.equal(publishCalls, 0, "must not media_publish old FINISHED container");
    assert.equal(store.rows[0]!.status, "pending");
    assert.equal(store.rows[0]!.metaContainerId, "old_container");

    // Matching fingerprint may resume FINISHED → publish.
    store.rows[0]!.contentFingerprint = approvedFp;
    store.rows[0]!.recoveryLeaseUntil = null;
    store.rows[0]!.updatedAt = new Date(0).toISOString();
    const r2 = await publishInstagramConcept({
      draft: draft("new caption after re-approval"),
      metaClient: client,
      publicBaseUrl: "https://example.invalid",
      deps: store.deps,
      checkLiveEventDrift: false,
    });
    assert.equal(r2.ok, true);
    assert.equal(publishCalls, 1);

    // PUBLISHED reconcile still works without matching fingerprint (no republish).
    publishCalls = 0;
    store.reset();
    store.rows.push({
      id: "pub-1",
      conceptKey: buildInstagramConceptKey("deze_week", ["e1"]),
      format: "deze_week",
      eventIds: ["e1"],
      caption: "old",
      slideCount: 1,
      status: "uncertain",
      dryRun: false,
      metaContainerId: "already_live",
      metaMediaId: null,
      errorCode: "publish_uncertain",
      errorMessage: "x",
      contentFingerprint: "z".repeat(32),
      recoveryLeaseUntil: null,
      requestedBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      finishedAt: null,
    });
    store.deps.assertConceptContentApproved = async () => ({
      ok: true as const,
      conceptKey: buildInstagramConceptKey("deze_week", ["e1"]),
      contentFingerprint: approvedFp,
      eventSnapshots: sampleSnapshots().slice(0, 1),
    });
    const publishedClient = {
      ...client,
      getContainerStatus: async () => ({
        ok: true as const,
        data: { status_code: "PUBLISHED" },
      }),
      publishContainer: async () => {
        publishCalls += 1;
        return { ok: true as const, data: { id: "m" } };
      },
    };
    const r3 = await publishInstagramConcept({
      draft: draft("latest approved"),
      metaClient: publishedClient,
      publicBaseUrl: "https://example.invalid",
      deps: store.deps,
      checkLiveEventDrift: false,
    });
    assert.equal(r3.ok, true);
    assert.equal(publishCalls, 0, "PUBLISHED reconcile must not call media_publish");
    if (r3.ok) {
      assert.equal(r3.publish.status, "published");
      assert.equal(r3.publish.metaMediaId, null);
    }
  });
  ok("R11. recovery resumes media_publish only when stored fingerprint matches approval");
}

async function testPublishBlocksWhenApprovalMissingSnapshots() {
  await withLiveEnv(async () => {
    const store = makeStore();
    store.deps.assertConceptContentApproved = async () => ({
      ok: false as const,
      code: "content_mismatch" as const,
      message: "Goedkeuring mist event-snapshots",
    });
    const r = await publishInstagramConcept({
      draft: draft(),
      publicBaseUrl: "https://example.invalid",
      deps: store.deps,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "content_mismatch");
    assert.equal(store.rows.length, 0, "no claim when approval rejects");
  });
  ok("R10. publish blocked when approval lacks event snapshots");
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
  await testEventSnapshotDriftAndFrozenRender();
  await testPublishBlocksWhenApprovalMissingSnapshots();
  await testRecoveryBlocksFingerprintMismatch();
  console.log("\nOK: Instagram Phase 3B offline regressions.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
