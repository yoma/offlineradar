/**
 * FASE 26.6 Admin Quick Intake — structural + unit checks.
 * Usage: npm run verify:admin-intake
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

mustInclude("app/interne-aanvoer/page.tsx", "resolveTipsAdminAccess");
mustInclude("components/admin/interne-admin-nav.tsx", "Aanvoer");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Bewaar als bron");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Maak event-kandidaat");
mustNotInclude("app/interne-aanvoer/aanvoer-client.tsx", ">Publiceer");
mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Geen directe publicatie");
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
ok("4 UI/security/migration strings");

console.log("\nAll admin-intake checks passed.");
