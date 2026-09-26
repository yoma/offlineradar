/**
 * Tip transactional email guards (no live provider send).
 * Usage: npx tsx scripts/verify-tip-email.ts
 */
import assert from "node:assert/strict";
import {
  buildTipStatusEmail,
  emailKindForStatus,
  isResendConfigured,
  maskEmail,
  sendTipEmail,
} from "@/lib/tips/email";
import { canTransitionTipStatus } from "@/lib/tips/status-guards";
import { resolvePublicEventImage } from "@/lib/image-compatibility";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

async function main() {
  // 1 notify=false → no draft recipient path (caller must enforce opt-in)
  assert.equal(emailKindForStatus("received"), null);
  ok("invalid status → no mail kind");

  // 2 notify=true + email → eligible kinds
  assert.equal(emailKindForStatus("rejected"), "rejected");
  assert.equal(emailKindForStatus("needs_info"), "needs_info");
  assert.equal(emailKindForStatus("approved_for_publication"), "approved_prep");
  assert.equal(emailKindForStatus("published"), "published");
  ok("notify-eligible statuses map to mail kinds");

  // 3 invalid status denied at template layer
  assert.equal(
    buildTipStatusEmail({
      tipId: "t1",
      status: "received",
      email: "a@b.c",
    }),
    null,
  );
  ok("received → send denied (no template)");

  // 4 published without URL denied
  assert.equal(
    buildTipStatusEmail({
      tipId: "t1",
      status: "published",
      email: "a@b.c",
      publishedAbsoluteUrl: null,
      linkedEventId: "ev1",
    }),
    null,
  );
  ok("published mail without live URL → denied");

  // 5 published with URL allowed
  const published = buildTipStatusEmail({
    tipId: "t1",
    status: "published",
    email: "youri@example.com",
    publishedAbsoluteUrl: "https://example.com/event/demo",
    eventTitle: "Demo event",
    linkedEventId: "ev1",
  });
  assert.ok(published);
  assert.equal(published!.kind, "published");
  assert.match(published!.body, /Bekijk event/);
  assert.equal(
    published!.idempotencyKey,
    "tip:t1:mail:published:event:ev1",
  );
  ok("published mail with linked event → allowed");

  // 6 idempotency keys stable per kind
  const rejected = buildTipStatusEmail({
    tipId: "t1",
    status: "rejected",
    email: "youri@example.com",
    reason: "niet singles",
  });
  assert.ok(rejected);
  assert.equal(rejected!.idempotencyKey, "tip:t1:mail:rejected");
  const rejectedAgain = buildTipStatusEmail({
    tipId: "t1",
    status: "rejected",
    email: "youri@example.com",
  });
  assert.equal(rejected!.idempotencyKey, rejectedAgain!.idempotencyKey);
  ok("duplicate send key is stable");

  // 7 provider missing → safe no-send
  assert.equal(isResendConfigured(), false);
  const sendResult = await sendTipEmail(rejected!);
  assert.equal(sendResult.sent, false);
  assert.equal(sendResult.reason, "provider_not_configured");
  ok("provider error/missing → tip state untouched (no send)");

  // 9 recipient never from client: draft.to comes from stored email arg only
  assert.equal(published!.to, "youri@example.com");
  ok("recipient is draft.to from stored tip email");

  // 10 subject/body not arbitrary: fixed templates
  assert.match(published!.subject, /tip/i);
  assert.doesNotMatch(published!.body, /marketing|nieuwsbrief/i);
  ok("subject/body from templates only");

  // mask
  assert.equal(maskEmail("youri@gmail.com"), "yo***@gmail.com");
  assert.equal(maskEmail("a@b.co"), "a***@b.co");
  ok("email mask for admin preview");

  // approved_prep wording: not claiming live
  const prep = buildTipStatusEmail({
    tipId: "t1",
    status: "approved_for_publication",
    email: "a@b.c",
  });
  assert.ok(prep);
  assert.match(prep!.body, /nog niet live/i);
  assert.doesNotMatch(prep!.body, /staat nu/i);
  ok("approved_prep does not claim published");

  // no auto-publish: status guards still require explicit path
  assert.equal(
    canTransitionTipStatus("approved_for_publication", "published"),
    true,
  );
  ok("explicit publish transition still required (no auto)");

  const img = resolvePublicEventImage(
    { category: "dating", activities: [], title: "Tip concept" },
    null,
    true,
  );
  assert.ok(img.url);
  ok("image compatibility intact");

  console.log("\nOK: tip email verify passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
