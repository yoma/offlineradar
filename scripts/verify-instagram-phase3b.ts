/**
 * Phase 3B release check: offline regressions (required) + optional Neon checks.
 * Skipped required DB checks → exit 2 (INCOMPLETE), never silent OK.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { buildInstagramConceptKey } from "@/lib/instagram/concept-key";
import { recordConceptApproval } from "@/lib/instagram/approvals";
import type { InstagramEventSnapshot } from "@/lib/instagram/event-snapshot";
import { readInstagramMetaConfig } from "@/lib/instagram/meta-config";
import { publishInstagramConcept } from "@/lib/instagram/publish";
import type { MetaClient } from "@/lib/instagram/meta-client";

function probeSnapshots(eventId: string): InstagramEventSnapshot[] {
  return [
    {
      id: eventId,
      title: "Verify probe event",
      startDate: "2026-10-24",
      startTime: "20:00",
      city: "Brussel",
      region: "Brussel",
      venue: "Probe",
      organizerName: "Verify",
      organizerId: null,
      organizerSlug: null,
      imageUrl: null,
      imageIsAtmosphere: false,
      shortDescription: "Probe blurb",
      description: null,
      category: "dating",
      subCategory: "",
      eligibilityAgeMin: 25,
      eligibilityAgeMax: 45,
      eligibilityAgeRule: "guideline",
      activities: ["speeddate"],
      tags: ["probe"],
    },
  ];
}

const skippedRequired: string[] = [];

function ok(label: string) {
  console.log(`OK: ${label}`);
}

function skipRequired(label: string, reason: string) {
  skippedRequired.push(`${label}: ${reason}`);
  console.log(`SKIP (required): ${label} — ${reason}`);
}

function runOffline(): void {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/verify-instagram-phase3b-offline.ts"],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    console.error("FAIL: offline Phase 3B regressions");
    process.exit(result.status ?? 1);
  }
  ok("offline regressions suite");
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

async function neonReady(): Promise<
  | { ok: true; sql: NonNullable<ReturnType<typeof import("@/lib/events/db").getEventsSql>> }
  | { ok: false; reason: string }
> {
  const { getEventsSql } = await import("@/lib/events/db");
  const sql = getEventsSql();
  if (!sql) return { ok: false, reason: "SQL unavailable" };
  try {
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('instagram_publishes', 'instagram_concept_approvals')
    `;
    if (tables.length < 2) {
      return {
        ok: false,
        reason: "run db:migrate:instagram-publishes + approvals (+ content-v2)",
      };
    }
    const cols = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'instagram_concept_approvals'
        AND column_name = 'content_fingerprint'
    `;
    if (cols.length === 0) {
      return {
        ok: false,
        reason: "run db:migrate:instagram-approvals-content-v2",
      };
    }
    return { ok: true, sql };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testApprovalContentOnNeon() {
  const db = await neonReady();
  if (!db.ok) {
    skipRequired("neon approval content gate", db.reason);
    return;
  }
  const { sql } = db;
  const eventId = `ig3b-appr-${Date.now()}`;
  const slides = [
    {
      kind: "deze_week" as const,
      label: "Overview",
      query: { kind: "deze_week", ids: eventId, period: "Deze week" },
    },
  ];
  const caption = "Goedgekeurde caption";
  const eventSnapshots = probeSnapshots(eventId);
  const recorded = await recordConceptApproval({
    format: "deze_week",
    eventIds: [eventId],
    caption,
    slides,
    eventSnapshots,
    approvedBy: "verify@test",
  });
  assert.equal(recorded.ok, true);

  await withEnvAsync(
    {
      INSTAGRAM_META_DRY_RUN: "1",
      INSTAGRAM_IMAGE_SIGNING_SECRET: "phase3b-test-secret",
      OFFLINERADAR_PUBLIC_BASE_URL: "https://dateofflinehub.be",
    },
    async () => {
      const bad = await publishInstagramConcept({
        draft: {
          format: "deze_week",
          eventIds: [eventId],
          caption: "Gewijzigd na goedkeuring",
          slides,
        },
        checkLiveEventDrift: false,
      });
      assert.equal(bad.ok, false);
      if (!bad.ok) assert.equal(bad.code, "content_mismatch");

      // Probe event ids are not in the live catalog → drift would block.
      // Disable live drift for this synthetic probe; offline R9 covers drift.
      const good = await publishInstagramConcept({
        draft: {
          format: "deze_week",
          eventIds: [eventId],
          caption,
          slides,
        },
        checkLiveEventDrift: false,
      });
      assert.equal(good.ok, true, good.ok ? "" : good.message);
      if (good.ok) assert.equal(good.mode, "dry_run");
    },
  );

  const conceptKey = buildInstagramConceptKey("deze_week", [eventId]);
  await sql`DELETE FROM instagram_publishes WHERE concept_key = ${conceptKey}`;
  await sql`DELETE FROM instagram_concept_approvals WHERE concept_key = ${conceptKey}`;
  ok("neon approval rejects caption drift; accepts exact content");
}

async function testNeonIdempotency() {
  const db = await neonReady();
  if (!db.ok) {
    skipRequired("neon idempotency", db.reason);
    return;
  }
  const { sql } = db;
  const eventId = `ig3b-idemp-${Date.now()}`;
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

  const slides = [
    {
      kind: "deze_week" as const,
      label: "Overview",
      query: { kind: "deze_week", ids: eventId, period: "Deze week" },
    },
  ];
  const caption = "Verify caption";
  await recordConceptApproval({
    format: "deze_week",
    eventIds: [eventId],
    caption,
    slides,
    eventSnapshots: probeSnapshots(eventId),
  });

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
        caption,
        slides,
      };
      const first = await publishInstagramConcept({
        draft,
        metaClient,
        publicBaseUrl: "https://dateofflinehub.be",
        checkLiveEventDrift: false,
      });
      assert.equal(first.ok, true, first.ok ? "" : first.message);
      const second = await publishInstagramConcept({
        draft,
        metaClient,
        publicBaseUrl: "https://dateofflinehub.be",
        checkLiveEventDrift: false,
      });
      assert.equal(second.ok, false);
      if (!second.ok) assert.equal(second.code, "already_published");
      assert.equal(publishCalls, 1);
    },
  );

  const conceptKey = buildInstagramConceptKey("deze_week", [eventId]);
  await sql`DELETE FROM instagram_publishes WHERE concept_key = ${conceptKey}`;
  await sql`DELETE FROM instagram_concept_approvals WHERE concept_key = ${conceptKey}`;
  ok("neon idempotency blocks duplicate Meta publish");
}

function testFlags() {
  const prevEn = process.env.INSTAGRAM_META_PUBLISH_ENABLED;
  const prevDry = process.env.INSTAGRAM_META_DRY_RUN;
  delete process.env.INSTAGRAM_META_PUBLISH_ENABLED;
  delete process.env.INSTAGRAM_META_DRY_RUN;
  assert.equal(readInstagramMetaConfig().mode, "disabled");
  process.env.INSTAGRAM_META_DRY_RUN = "1";
  assert.equal(readInstagramMetaConfig().mode, "dry_run");
  if (prevEn === undefined) delete process.env.INSTAGRAM_META_PUBLISH_ENABLED;
  else process.env.INSTAGRAM_META_PUBLISH_ENABLED = prevEn;
  if (prevDry === undefined) delete process.env.INSTAGRAM_META_DRY_RUN;
  else process.env.INSTAGRAM_META_DRY_RUN = prevDry;
  ok("feature flags default off");
}

async function main() {
  runOffline();
  testFlags();
  await testApprovalContentOnNeon();
  await testNeonIdempotency();

  if (skippedRequired.length > 0) {
    console.error("\nINCOMPLETE: required DB checks skipped:");
    for (const s of skippedRequired) console.error(` - ${s}`);
    console.error(
      "Release claim for Neon-backed publish safety is incomplete.",
    );
    process.exit(2);
  }

  console.log("\nOK: Instagram Phase 3B verify (offline + Neon).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
