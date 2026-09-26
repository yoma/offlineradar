/**
 * Tipflow phase 11 unit checks (no paid AI, no real mail).
 * Usage: npx tsx scripts/verify-tipflow.ts
 */
import assert from "node:assert/strict";
import {
  canCreateConceptFromTipStatus,
  canTransitionTipStatus,
  tipStatusTransitionError,
} from "@/lib/tips/status-guards";
import {
  buildTipStatusEmail,
  emailKindForStatus,
  sendTipEmail,
} from "@/lib/tips/email";
import { resolvePublicEventImage } from "@/lib/image-compatibility";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function main() {
  assert.equal(canTransitionTipStatus("received", "approved_for_publication"), true);
  assert.equal(canTransitionTipStatus("rejected", "approved_for_publication"), false);
  assert.equal(canTransitionTipStatus("approved_for_publication", "published"), true);
  assert.ok(tipStatusTransitionError("rejected", "published"));
  ok("status transition guards");

  assert.equal(canCreateConceptFromTipStatus("approved_for_publication"), true);
  assert.equal(canCreateConceptFromTipStatus("rejected"), false);
  assert.equal(canCreateConceptFromTipStatus("received"), false);
  ok("concept only from approved_for_publication");

  assert.equal(emailKindForStatus("rejected"), "rejected");
  assert.equal(emailKindForStatus("needs_info"), "needs_info");
  assert.equal(emailKindForStatus("approved_for_publication"), "approved_prep");
  assert.equal(emailKindForStatus("published"), "published");

  const publishedNoUrl = buildTipStatusEmail({
    tipId: "t",
    status: "published",
    email: "x@y.z",
    publishedAbsoluteUrl: null,
  });
  assert.equal(publishedNoUrl, null);
  ok("published mail requires live URL");

  const rejected = buildTipStatusEmail({
    tipId: "t",
    status: "rejected",
    email: "x@y.z",
    reason: "niet singles",
  });
  assert.ok(rejected);
  assert.equal(rejected!.idempotencyKey, "tip:t:mail:rejected");
  ok("rejected mail + idempotency key");

  void sendTipEmail(rejected!).then((r) => {
    assert.equal(r.sent, false);
    assert.equal(r.reason, "provider_not_configured");
    ok("mail provider stub not configured");

    const published = buildTipStatusEmail({
      tipId: "t",
      status: "published",
      email: "x@y.z",
      publishedAbsoluteUrl: "https://example.com/event/x",
      linkedEventId: "ev",
      eventTitle: "X",
    });
    assert.ok(published);
    assert.equal(
      published!.idempotencyKey,
      "tip:t:mail:published:event:ev",
    );
    ok("published mail idempotency includes event id");

    const img = resolvePublicEventImage(
      {
        category: "dating",
        activities: [],
        title: "Tip concept zonder beeld",
      },
      null,
      true,
    );
    assert.equal(img.keptAtmosphere, true);
    assert.ok(img.url);
    ok("concept without image uses safe fallback");

    console.log("\nOK: tipflow verify passed.");
  });
}

main();
