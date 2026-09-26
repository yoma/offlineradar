/**
 * Fase 14 discovery provenance + playbook invariants.
 * Usage: npm run verify:phase14-discovery
 */
import assert from "node:assert/strict";
import {
  isUserSuppliedNotes,
  USER_SUPPLIED_TAG,
  withUserSuppliedProvenance,
} from "../lib/discovery/user-supplied";
import {
  PHASE14_REJECTED,
  PHASE14_RESEARCHED_CANDIDATE_NAMES,
  PHASE14_SOURCE_UPSERTS,
  PHASE14_TOMEETO_DRAFTS,
  PHASE14_USER_SUPPLIED_AUDIT,
} from "../data/pilot/phase14-discovery-sources";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function main() {
  assert.ok(PHASE14_USER_SUPPLIED_AUDIT.some((r) => r.name === "Tomeeto" && r.missed));
  assert.ok(PHASE14_USER_SUPPLIED_AUDIT.some((r) => r.name === "The Sircle" && r.wasInMap));
  assert.ok(
    PHASE14_USER_SUPPLIED_AUDIT.some((r) => r.name.includes("Farm Date") && r.wasInMap),
  );
  ok("1. user-supplied audit covers Tomeeto/Sircle/Farm Date");

  const tomeeto = PHASE14_SOURCE_UPSERTS.find((s) => s.name === "Tomeeto");
  assert.ok(tomeeto);
  assert.equal(tomeeto.status, "active");
  assert.ok(isUserSuppliedNotes(tomeeto.notes));
  ok("2. Tomeeto Source Map upsert is active + user-supplied");

  assert.ok(PHASE14_TOMEETO_DRAFTS.length >= 8);
  assert.ok(PHASE14_TOMEETO_DRAFTS.every((d) => d.startDate >= "2026-09-23"));
  ok("3. Tomeeto draft seeds are future editions");

  assert.ok(PHASE14_RESEARCHED_CANDIDATE_NAMES.length >= 30);
  assert.ok(PHASE14_REJECTED.length >= 3);
  ok("4. research volume + rejected list present");

  const tagged = withUserSuppliedProvenance("test note");
  assert.ok(tagged.includes(USER_SUPPLIED_TAG));
  assert.ok(isUserSuppliedNotes(tagged));
  assert.equal(
    withUserSuppliedProvenance(tagged),
    tagged,
    "idempotent provenance",
  );
  ok("5. user-supplied provenance helper");

  const playbook = readFileSync(
    join(process.cwd(), "docs/discovery-playbook.md"),
    "utf8",
  );
  assert.ok(playbook.includes("REGIO × TAAL × FORMAT × KANAAL"));
  assert.ok(playbook.includes("Tomeeto"));
  assert.ok(playbook.includes("discovered_by=user"));
  assert.ok(playbook.includes("Anti-patterns"));
  ok("6. discovery playbook document");

  assert.ok(/geen[^\n]*auto-publish/i.test(playbook));
  ok("7. playbook forbids auto-publish");

  console.log("\nOK: phase14 discovery verify.");
}

main();
