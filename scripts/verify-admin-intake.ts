/**
 * FASE 26.12 Admin Quick Intake — structural + unit checks.
 * Usage: npm run verify:admin-intake
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { evaluateIntakeApproval } from "../lib/aanvoer/approval";
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

const proposal = blankProposal({
  title: { value: "Karaoke", status: "found", evidence: "Karaoke night" },
  needsSourceVerification: true,
  aiFailed: true,
  aiError: "no key",
});
const draft = proposalToDraft(proposal);
assert.equal(draft.title, "Karaoke");
assert.equal(proposal.needsSourceVerification, true);
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
ok("5 incomplete intake stays under Te bekijken");

mustInclude("app/interne-aanvoer/page.tsx", "resolveTipsAdminAccess");
mustInclude("components/admin/interne-admin-nav.tsx", "Aanvoer");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Goedkeuren & toevoegen");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Iets aanpassen");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Niet toevoegen");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Analyseer event");
mustNotInclude("app/interne-aanvoer/aanvoer-client.tsx", "Bron + event voorbereiden");
mustNotInclude("app/interne-aanvoer/aanvoer-client.tsx", "Maak event-kandidaat");
mustInclude("app/interne-aanvoer/actions.ts", "approveIntakeAction");
mustInclude("lib/aanvoer/save.ts", 'publicationStatus: "draft"');
mustInclude("lib/aanvoer/save.ts", "source_checked_at niet gezet");
mustInclude("lib/aanvoer/save.ts", "nooit public image");
mustInclude(
  "app/api/interne-aanvoer/asset/[id]/route.ts",
  "private, no-store",
);
mustInclude("lib/aanvoer/extract.ts", "geen instructie");
mustInclude("lib/aanvoer/future-discovery.ts", "mandatory future discovery");
mustInclude("db/migrations/20260929_admin_intake_v1.sql", "admin_intake_assets");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Te bekijken");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Toegevoegd");
ok("6 simplified UX + security/migration strings");

console.log("\nAll admin-intake checks passed.");
