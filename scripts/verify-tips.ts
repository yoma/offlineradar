import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildTipStatusEmail, emailKindForStatus } from "@/lib/tips/email";
import { createTip, updateTipStatus } from "@/lib/tips/service";
import { emptyAiPrepPlaceholder, findReusableAiPrep } from "@/lib/tips/ai-prep";
import { isValidEmail, validateAndNormalizeTipUrl } from "@/lib/tips/url";
import type { TipAiPrep } from "@/types/tips";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

async function withLocalStore<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "or-tips-"));
  const previousStore = process.env.OFFLINERADAR_TIPS_LOCAL_STORE;
  const previousPath = process.env.OFFLINERADAR_TIPS_LOCAL_PATH;
  process.env.OFFLINERADAR_TIPS_LOCAL_STORE = "1";
  process.env.OFFLINERADAR_TIPS_LOCAL_PATH = path.join(dir, "store.json");
  try {
    return await fn();
  } finally {
    if (previousStore === undefined) delete process.env.OFFLINERADAR_TIPS_LOCAL_STORE;
    else process.env.OFFLINERADAR_TIPS_LOCAL_STORE = previousStore;
    if (previousPath === undefined) delete process.env.OFFLINERADAR_TIPS_LOCAL_PATH;
    else process.env.OFFLINERADAR_TIPS_LOCAL_PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  {
    const good = validateAndNormalizeTipUrl(
      "https://Example.com/events/singles/?ref=1#x",
    );
    assert.equal(good.ok, true);
    if (good.ok) {
      assert.equal(good.normalizedUrl, "https://example.com/events/singles?ref=1");
    }
    ok("URL normalize host/path/hash");
  }

  {
    const bad = validateAndNormalizeTipUrl("https://127.0.0.1/secret");
    assert.equal(bad.ok, false);
    ok("URL blocks loopback");
  }

  {
    const tooLong = validateAndNormalizeTipUrl(`https://example.com/${"a".repeat(2100)}`);
    assert.equal(tooLong.ok, false);
    ok("URL rejects excessive length");
  }

  {
    const bad = validateAndNormalizeTipUrl("ftp://example.com/x");
    assert.equal(bad.ok, false);
    ok("URL blocks non-http(s)");
  }

  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("nope"), false);
  ok("email validation");

  assert.equal(emailKindForStatus("published"), "published");
  assert.equal(emailKindForStatus("approved_for_publication"), null);
  ok("no publish-claim mail for approved_for_publication");

  const draft = buildTipStatusEmail({
    tipId: "t1",
    status: "published",
    email: "a@b.co",
    publishedAbsoluteUrl: "https://offlineradar.example/event/x",
  });
  assert.ok(draft);
  assert.match(draft!.body, /staat nu op OfflineRadar/i);
  assert.match(draft!.body, /https:\/\/offlineradar\.example\/event\/x/);
  ok("published email includes link only when provided");

  const rejected = buildTipStatusEmail({
    tipId: "t1",
    status: "rejected",
    email: "a@b.co",
    reason: "Niet singlesgericht.",
  });
  assert.ok(rejected);
  assert.match(rejected!.body, /niet op in OfflineRadar/i);
  assert.match(rejected!.body, /Niet singlesgericht/);
  ok("rejected email includes reason");

  await withLocalStore(async () => {
    const blockedEmail = await createTip({
      url: "https://example.com/singles-night",
      notifyRequested: false,
      email: "sneaky@example.com",
    });
    assert.equal(blockedEmail.ok, false);
    ok("rejects email without notify opt-in");

    const created = await createTip({
      url: "https://example.com/singles-night",
      note: "eerste tip",
      notifyRequested: true,
      email: "tipper@example.com",
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("expected create");
    assert.equal(created.tip.status, "received");
    assert.equal(created.tip.email, "tipper@example.com");
    ok("creates tip with durable local store");

    const dup = await createTip({
      url: "https://example.com/singles-night/",
      note: "tweede toelichting",
      notifyRequested: false,
    });
    assert.equal(dup.ok, true);
    if (!dup.ok) throw new Error("expected dup");
    assert.equal(dup.duplicate, true);
    assert.ok(dup.tip.duplicateNotes.some((n) => n.includes("tweede toelichting")));
    ok("duplicate merges note without losing data");

    const approved = await updateTipStatus({
      tipId: created.tip.id,
      status: "approved_for_publication",
      decisionReason: "Route A ok",
    });
    assert.equal(approved.ok, true);
    ok("approved_for_publication separate from published");

    const published = await updateTipStatus({
      tipId: created.tip.id,
      status: "published",
      decisionReason: "Expliciet publiceren",
      publishedEventPath: "/event/demo",
    });
    assert.equal(published.ok, true);
    ok("explicit publish step works");

    const prep = emptyAiPrepPlaceholder(created.tip);
    assert.equal(prep.suggestsListable, null);
    prep.sourceContentHash = "abc";
    prep.routeSuggestion = "route_a_supported";
    prep.routeReason = "test";
    const map = new Map<string, TipAiPrep | null>([[created.tip.id, prep]]);
    const reused = findReusableAiPrep(
      [created.tip],
      map,
      created.tip.normalizedUrl,
      "abc",
    );
    assert.ok(reused);
    ok("ai prep reuse lookup by content hash");
  });

  // Without local store flag, createTip must refuse (no fake success).
  {
    const previous = process.env.OFFLINERADAR_TIPS_LOCAL_STORE;
    delete process.env.OFFLINERADAR_TIPS_LOCAL_STORE;
    const refused = await createTip({
      url: "https://example.com/x",
      notifyRequested: false,
    });
    assert.equal(refused.ok, false);
    if (refused.ok) throw new Error("expected refuse");
    assert.equal(refused.code, "storage_disabled");
    if (previous !== undefined) process.env.OFFLINERADAR_TIPS_LOCAL_STORE = previous;
    ok("no durable store => no fake success");
  }

  console.log("\nOK: tip portal invariants.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
