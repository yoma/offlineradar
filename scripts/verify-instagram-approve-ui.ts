/**
 * Focused checks: approval UI hydrates stored content_fingerprint and
 * surfaces approve errors (no Meta publish, no Neon writes).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { approveInstagramConceptErrorMessage } from "@/app/interne-instagram/actions";

function ok(label: string) {
  console.log(`OK  ${label}`);
}

const root = process.cwd();
const page = readFileSync(
  path.join(root, "app/interne-instagram/page.tsx"),
  "utf8",
);
const client = readFileSync(
  path.join(root, "components/admin/instagram-preview-client.tsx"),
  "utf8",
);
const actions = readFileSync(
  path.join(root, "app/interne-instagram/actions.ts"),
  "utf8",
);

assert.ok(
  page.includes("assertConceptContentApproved"),
  "page must hydrate approvals via content fingerprint check",
);
assert.ok(
  page.includes("approvedByFormat"),
  "page must pass approvedByFormat to the client",
);
ok("1. server hydrates approval status per draft");

assert.ok(client.includes("initialApproved"));
assert.ok(
  client.includes('"Goedgekeurd"'),
  "approved state must show lasting Goedgekeurd label",
);
assert.ok(client.includes("approveError"));
assert.ok(client.includes("setApproveError"));
assert.ok(client.includes("res.message"));
assert.ok(
  !client.includes('setPublishError("Goedkeuren mislukt'),
  "approve failures must not be dumped into publishError silently",
);
assert.ok(
  client.includes("Instagram-publicatie staat apart uitgeschakeld"),
  "approved + publish-disabled must be explicit",
);
ok("2. client shows persistent Goedgekeurd + separate approve errors");

assert.ok(actions.includes("approveInstagramConceptErrorMessage"));
assert.ok(actions.includes("message: approveInstagramConceptErrorMessage"));
assert.ok(actions.includes("Concept goedgekeurd en opgeslagen."));
ok("3. approve action returns Dutch message on success and failure");

assert.equal(
  approveInstagramConceptErrorMessage("unauthorized"),
  "Je bent niet ingelogd als beheerder.",
);
assert.equal(
  approveInstagramConceptErrorMessage("invalid_concept"),
  "Concept is onvolledig (events, caption of slides ontbreken).",
);
assert.equal(
  approveInstagramConceptErrorMessage("catalog_unavailable"),
  "Catalogus kon niet worden geladen. Probeer opnieuw.",
);
assert.match(
  approveInstagramConceptErrorMessage("events_missing", "evt-1"),
  /evt-1/,
);
assert.match(
  approveInstagramConceptErrorMessage("approval_store_failed", "neon_unavailable"),
  /neon_unavailable/,
);
assert.equal(
  approveInstagramConceptErrorMessage("mystery"),
  "Goedkeuren mislukt — probeer opnieuw.",
);
ok("4. approve error message helper covers known codes");

assert.ok(
  !page.includes("INSTAGRAM_META_PUBLISH_ENABLED"),
  "page must not force-enable Meta publish",
);
assert.ok(
  client.includes('publishMode === "disabled"'),
  "client still gates publish on feature flag",
);
ok("5. Instagram publish remains feature-flag gated");

console.log("\nOK: Instagram approve UI verify.");
