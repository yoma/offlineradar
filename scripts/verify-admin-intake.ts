/**
 * FASE 26.15 Admin aanvoer — structural + unit checks.
 * Usage: npm run verify:admin-intake
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  classifyAdminStatus,
  isPlaceholderStartsAt,
  isManuallySuppressed,
} from "../lib/aanvoer/admin-status";
import { evaluateIntakeApproval } from "../lib/aanvoer/approval";
import { evaluateEventForPublication } from "../lib/aanvoer/publication-gate";
import { validateIntakeImage } from "../lib/aanvoer/assets";
import { USER_SUPPLIED_MANDATORY_FUTURE_SCAN } from "../lib/aanvoer/future-discovery";
import { blankProposal, proposalToDraft } from "../lib/aanvoer/types";
import { withUserSuppliedProvenance } from "../lib/discovery/user-supplied";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function mustInclude(rel: string, needle: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(src.includes(needle), `missing ${needle} in ${rel}`);
}

function mustNotInclude(rel: string, needle: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(!src.includes(needle), `unexpected ${needle} in ${rel}`);
}

assert.equal(
  validateIntakeImage({ mimeType: "image/png", byteSize: 100 }).ok,
  true,
);
assert.equal(
  validateIntakeImage({ mimeType: "application/pdf", byteSize: 100 }).ok,
  false,
);
assert.equal(
  validateIntakeImage({ mimeType: "image/jpeg", byteSize: 5_000_000 }).ok,
  false,
);
ok("1 upload mime/size validation");

const notes = withUserSuppliedProvenance(
  "test",
  USER_SUPPLIED_MANDATORY_FUTURE_SCAN,
);
assert.ok(notes.includes("discovered_by=user"));
assert.ok(notes.includes(USER_SUPPLIED_MANDATORY_FUTURE_SCAN));
ok("2 discovered_by=user + mandatory future scan note");

const proposal2 = blankProposal({
  title: { value: "Karaoke", status: "found", evidence: "Karaoke night" },
  needsSourceVerification: true,
  aiFailed: true,
  aiError: "no key",
});
const draft = proposalToDraft(proposal2);
assert.equal(draft.title, "Karaoke");
assert.equal(proposal2.needsSourceVerification, true);
ok("3 AI failure still yields editable draft");

const gate = evaluateIntakeApproval(
  {
    ...draft,
    title: "Singles Karaoke",
    startDate: "2026-10-15",
    sourceUrl: "https://example.com/event",
    routeAdvice: "route_a",
    singlesOriented: "true",
  },
  {
    needsSourceVerification: false,
    routeAdvice: "route_a",
    aiFailed: false,
  },
);
assert.equal(gate.canPublish, true);
ok("4 approval gate allows clear Route A event");

const blocked = evaluateIntakeApproval(draft, {
  needsSourceVerification: true,
  routeAdvice: "needs_review",
  aiFailed: true,
});
assert.equal(blocked.canPublish, false);
assert.ok(blocked.reviewReasons.length > 0);
ok("5 incomplete intake needs attention");

assert.equal(isPlaceholderStartsAt("2099-12-31T12:00:00+01:00"), true);
assert.equal(isPlaceholderStartsAt("2026-10-15T19:00:00+02:00"), false);

const placeholderClass = classifyAdminStatus({
  publicationStatus: "draft",
  startsAt: "2099-12-31T12:00:00+01:00",
  sourceUrl: null,
  eligibilityRoute: "route_b",
  singlesOnly: null,
  singlesOriented: true,
  internalNotes: "date_unknown=1",
  tags: ["date_unknown"],
});
assert.equal(placeholderClass.status, "aandacht_nodig");
assert.equal(placeholderClass.readyToPublish, false);
assert.equal(placeholderClass.displayDate, null);
assert.match(placeholderClass.reason ?? "", /Datum/);

const readyClass = classifyAdminStatus({
  publicationStatus: "draft",
  startsAt: "2026-11-10T19:00:00+01:00",
  sourceUrl: "https://example.com/e",
  eligibilityRoute: "route_a",
  singlesOnly: true,
  singlesOriented: true,
  internalNotes: "",
  tags: [],
  city: "Gent",
});
assert.equal(readyClass.readyToPublish, true);
assert.equal(readyClass.status, "aandacht_nodig"); // bucket unused; auto-publish consumes

const pubDecision = evaluateEventForPublication({
  publicationStatus: "draft",
  startsAt: "2026-11-10T19:00:00+01:00",
  sourceUrl: "https://example.com/e",
  eligibilityRoute: "route_a",
  singlesOnly: true,
  singlesOriented: true,
  internalNotes: "",
  tags: [],
  city: "Gent",
});
assert.equal(pubDecision.decision, "publish");

const publishedClass = classifyAdminStatus({
  publicationStatus: "published",
  startsAt: "2026-11-10T19:00:00+01:00",
  sourceUrl: "https://example.com/e",
  eligibilityRoute: "route_a",
  singlesOnly: true,
  singlesOriented: true,
  internalNotes: "",
});
assert.equal(publishedClass.status, "toegevoegd");

assert.equal(
  isManuallySuppressed(["manual_suppressed"], "Handmatig weggehaald: Duplicate"),
  true,
);
const suppressed = classifyAdminStatus({
  publicationStatus: "rejected",
  startsAt: "2026-11-10T19:00:00+01:00",
  sourceUrl: "https://example.com/e",
  eligibilityRoute: "route_a",
  singlesOnly: true,
  singlesOriented: true,
  internalNotes: "Handmatig weggehaald: Duplicate\nmanual_suppressed=1",
  tags: ["manual_suppressed"],
});
assert.equal(suppressed.status, "niet_toegevoegd");
assert.match(suppressed.reason ?? "", /Handmatig/);
ok("5b admin status classifier + publication gate + suppress");

mustInclude("app/interne-aanvoer/page.tsx", "resolveTipsAdminAccess");
mustInclude("components/admin/interne-admin-nav.tsx", "Aanvoer");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Toevoegen aan DateOfflineHub");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Aanpassen");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Niet toevoegen");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Analyseer event");
mustNotInclude("app/interne-aanvoer/aanvoer-client.tsx", "Bron + event voorbereiden");
mustNotInclude("app/interne-aanvoer/aanvoer-client.tsx", "Maak event-kandidaat");
mustNotInclude("components/admin/aanvoer-cockpit.tsx", "Klaar om toe te voegen");
mustNotInclude("components/admin/aanvoer-cockpit.tsx", "Te bekijken");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Jouw aandacht nodig");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Toegevoegd");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Van DateOfflineHub halen");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Zoek event of organisator");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Bekijk AI-details");
mustInclude("lib/events/neon-store.ts", "manual_suppressed");
mustInclude("lib/events/neon-store.ts", "removeEditionFromHub");
mustInclude("lib/aanvoer/publication-gate.ts", "evaluateEventForPublication");
mustInclude("app/interne-aanvoer/actions.ts", "approveIntakeAction");
mustInclude("lib/aanvoer/save.ts", 'publicationStatus: "draft"');
mustInclude("lib/aanvoer/save.ts", "source_checked_at niet gezet");
mustInclude("lib/aanvoer/save.ts", "nooit public image");
mustInclude("lib/aanvoer/save.ts", "date_unknown");
mustInclude(
  "app/api/interne-aanvoer/asset/[id]/route.ts",
  "private, no-store",
);
mustInclude("lib/aanvoer/extract.ts", "geen instructie");
mustInclude("lib/aanvoer/future-discovery.ts", "mandatory future discovery");
mustInclude("db/migrations/20260929_admin_intake_v1.sql", "admin_intake_assets");
ok("6 simplified UX + security/migration strings");

console.log("\nAll admin-intake checks passed.");
