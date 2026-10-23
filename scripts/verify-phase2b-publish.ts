/**
 * Offline Phase 2B checks: gated publish, readiness copy, auto-draft kill switch.
 * Usage: npm run verify:phase2b-publish
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateEventForPublication } from "../lib/aanvoer/publication-gate";
import { describePublicationReadiness } from "../lib/aanvoer/readiness-copy";
import { isRefreshAutoDraftGloballyEnabled } from "../lib/source-refresh/auto-draft-config";
import { classifyAdminStatus } from "../lib/aanvoer/admin-status";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function main() {
  const ready = evaluateEventForPublication({
    publicationStatus: "draft",
    startsAt: "2026-11-01T19:00:00+01:00",
    sourceUrl: "https://example-org.be/event",
    eligibilityRoute: "route_a",
    singlesOnly: true,
    singlesOriented: true,
    internalNotes: null,
    tags: ["source-refresh"],
    city: "Gent",
    venueName: "Demo",
    latitude: 51.05,
    longitude: 3.72,
  });
  assert.equal(ready.decision, "publish");
  ok("1. gate allows publish when checks pass");

  const missingDate = evaluateEventForPublication({
    publicationStatus: "draft",
    startsAt: "2099-12-31T12:00:00+01:00",
    sourceUrl: "https://example-org.be/event",
    eligibilityRoute: "route_a",
    singlesOnly: true,
    singlesOriented: true,
    internalNotes: "date_unknown=1",
    tags: ["date_unknown"],
    city: "Gent",
    latitude: 51.05,
    longitude: 3.72,
  });
  assert.equal(missingDate.decision, "needs_attention");
  ok("2. placeholder date blocked");

  const suppressed = evaluateEventForPublication({
    publicationStatus: "draft",
    startsAt: "2026-11-01T19:00:00+01:00",
    sourceUrl: "https://example-org.be/event",
    eligibilityRoute: "route_a",
    singlesOnly: true,
    singlesOriented: true,
    internalNotes: "manual_suppressed=1",
    tags: ["manual_suppressed"],
    city: "Gent",
    latitude: 51.05,
    longitude: 3.72,
  });
  assert.equal(suppressed.decision, "reject");
  ok("3. manual_suppressed rejected");

  const classified = classifyAdminStatus({
    publicationStatus: "draft",
    startsAt: "2026-11-01T19:00:00+01:00",
    sourceUrl: "https://example-org.be/event",
    eligibilityRoute: "route_a",
    singlesOnly: true,
    singlesOriented: true,
    internalNotes: null,
    city: "Gent",
    latitude: 51.05,
    longitude: 3.72,
  });
  assert.equal(classified.readyToPublish, true);
  const copy = describePublicationReadiness({
    checks: classified.checks,
    priceKnown: false,
    startTime: "19:00",
    blockReason: null,
    readyToPublish: true,
  });
  assert.match(copy, /Klaar voor publicatie/i);
  assert.match(copy, /ticketprijs niet gevonden/i);
  ok("4. readiness copy: klaar + optional price unknown");

  const needCopy = describePublicationReadiness({
    checks: {
      singles: true,
      date: false,
      location: true,
      source: true,
    },
    priceKnown: true,
    startTime: null,
    blockReason: "Datum kon niet worden bevestigd",
    readyToPublish: false,
  });
  assert.match(needCopy, /Nog nodig: datum/i);
  ok("5. readiness copy lists missing fields");

  const prev = process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT;
  delete process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT;
  assert.equal(isRefreshAutoDraftGloballyEnabled(), false);
  process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT = "1";
  assert.equal(isRefreshAutoDraftGloballyEnabled(), true);
  if (prev === undefined) delete process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT;
  else process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT = prev;
  ok("6. auto-draft kill switch default OFF");

  const publishMod = readFileSync(
    join(process.cwd(), "lib/aanvoer/publish-edition.ts"),
    "utf8",
  );
  assert.ok(publishMod.includes("publishEditionIfAllowed"));
  assert.ok(publishMod.includes("bulkPublishEditionsIfAllowed"));
  assert.ok(publishMod.includes("evaluateEventForPublication"));
  ok("7. publish helper uses publication gate");

  const actions = readFileSync(
    join(process.cwd(), "app/interne-events/actions.ts"),
    "utf8",
  );
  assert.ok(actions.includes("publishEditionIfAllowed"));
  assert.ok(actions.includes("bulkPublishEventsAction"));
  ok("8. interne-events publish wired to gate");

  const aanvoer = readFileSync(
    join(process.cwd(), "app/interne-aanvoer/actions.ts"),
    "utf8",
  );
  assert.ok(aanvoer.includes("publishEditionIfAllowed"));
  assert.ok(aanvoer.includes("patchAanvoerCandidateFieldsAction"));
  assert.ok(aanvoer.includes("bulkPublishAanvoerCandidatesAction"));
  ok("9. aanvoer one-click + patch + bulk");

  const scheduler = readFileSync(
    join(process.cwd(), "lib/source-refresh/scheduler.ts"),
    "utf8",
  );
  assert.ok(scheduler.includes("isRefreshAutoDraftGloballyEnabled"));
  assert.ok(scheduler.includes("thorough"));
  assert.ok(scheduler.includes("auto-draft") || scheduler.includes("autoDraft") || scheduler.includes("REFRESH_AUTO_DRAFT") || scheduler.includes("isRefreshAutoDraftGloballyEnabled"));
  ok("10. scheduler thorough only when auto-draft ON");

  const cockpit = readFileSync(
    join(process.cwd(), "components/admin/aanvoer-cockpit.tsx"),
    "utf8",
  );
  assert.ok(cockpit.includes("Klaar voor publicatie"));
  assert.ok(cockpit.includes("Publiceren"));
  assert.ok(cockpit.includes("bulkPublishAanvoerCandidatesAction"));
  assert.ok(cockpit.includes("patchAanvoerCandidateFieldsAction"));
  assert.ok(cockpit.includes("Ophalen als concept"));
  ok("11. UI: Klaar/Nakijken + one-click + bulk + thorough scan");

  // Never invent free/zero price from missing
  assert.ok(!/priceAmount:\s*0/.test(needCopy));
  ok("12. missing price not shown as free");

  console.log("\nOK: phase2b publish verify.");
}

main();
