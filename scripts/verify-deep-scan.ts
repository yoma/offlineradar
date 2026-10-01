/**
 * FASE 26.16 deep verification — unit checks (no live network required).
 * Usage: npm run verify:deep-scan
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDeepSearchQueries,
  detectEssentialGaps,
  humanMissingDateReason,
  mergeDeepProposal,
  shouldRunDeepVerification,
  __test,
} from "../lib/aanvoer/deep-verify";
import { evaluateIntakeApproval } from "../lib/aanvoer/approval";
import { blankProposal, proposalToDraft } from "../lib/aanvoer/types";
import { classifyAdminStatus } from "../lib/aanvoer/admin-status";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function mustInclude(rel: string, needle: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(src.includes(needle), `missing ${needle} in ${rel}`);
}

const flirtPass1 = blankProposal({
  title: {
    value: "Flirt & Stride – The Breakfast Edition",
    status: "found",
    evidence: "title on page",
  },
  organizer: {
    value: "Flirt & Stride",
    status: "found",
    evidence: "brand",
  },
  city: { value: "Gent", status: "uncertain", evidence: null },
  startDate: { value: null, status: "unknown", evidence: null },
  venue: { value: null, status: "unknown", evidence: null },
  singlesOriented: {
    value: "true",
    status: "found",
    evidence: "singles running",
  },
  routeAdvice: "route_a",
  routeReason: "Singles running + social",
  sourceUrl: {
    value: "https://example.com/flirt-stride",
    status: "found",
    evidence: "input",
  },
  sourceKindHint: "website_first",
  needsSourceVerification: false,
});

assert.deepEqual(detectEssentialGaps(flirtPass1).sort(), ["date", "location"].sort());
assert.equal(shouldRunDeepVerification(flirtPass1), true);
ok("1 Flirt & Stride Pass1 gaps trigger deep scan");

const queries = buildDeepSearchQueries(flirtPass1);
assert.ok(queries.some((q) => /Flirt/i.test(q)));
assert.ok(queries.some((q) => /instagram/i.test(q) || /allevents/i.test(q)));
assert.ok(queries.length <= 5);
ok("2 multi query strategy");

const pass2 = blankProposal({
  title: flirtPass1.title,
  organizer: flirtPass1.organizer,
  startDate: {
    value: "2026-10-10",
    status: "found",
    evidence: "AllEvents + Instagram",
  },
  startTime: { value: "09:00", status: "found", evidence: "event page" },
  endTime: { value: "12:30", status: "found", evidence: "event page" },
  city: { value: "Gent", status: "found", evidence: "Alix" },
  venue: {
    value: "Alix – Maison d'Amis",
    status: "found",
    evidence: "venue page",
  },
  singlesOriented: flirtPass1.singlesOriented,
  routeAdvice: "route_a",
  routeReason: "confirmed singles",
  sourceUrl: flirtPass1.sourceUrl,
  sourceKindHint: "website_first",
  needsSourceVerification: false,
});

const merged = mergeDeepProposal(flirtPass1, pass2);
assert.equal(merged.proposal.startDate.value, "2026-10-10");
assert.ok(merged.fieldsConfirmed.includes("date"));
assert.ok(merged.fieldsConfirmed.includes("location"));
assert.equal(merged.conflicts.length, 0);

const draft = proposalToDraft(merged.proposal);
const gate = evaluateIntakeApproval(draft, {
  needsSourceVerification: false,
  routeAdvice: "route_a",
  aiFailed: false,
  deepScan: {
    triggered: true,
    reason: "gaps",
    queries,
    sourcesChecked: [{ url: "https://allevents.in/x", ok: true }],
    fieldsConfirmed: merged.fieldsConfirmed,
    conflicts: [],
    timestamp: new Date().toISOString(),
  },
});
assert.equal(gate.canPublish, true);
ok("3 Flirt merge + publish gate");

const conflictPass2 = blankProposal({
  ...pass2,
  startDate: {
    value: "2026-10-17",
    status: "found",
    evidence: "other listing",
  },
});
const withDate = blankProposal({
  ...flirtPass1,
  startDate: {
    value: "2026-10-10",
    status: "found",
    evidence: "first",
  },
});
const conflicted = mergeDeepProposal(withDate, conflictPass2);
assert.ok(conflicted.conflicts.some((c) => /datum/i.test(c)));
assert.equal(conflicted.proposal.startDate.status, "uncertain");
ok("4 date conflict → uncertain");

const missingAfterDeep = evaluateIntakeApproval(
  proposalToDraft(flirtPass1),
  {
    needsSourceVerification: false,
    routeAdvice: "route_a",
    aiFailed: false,
    deepScan: {
      triggered: true,
      reason: "date missing",
      queries: [],
      sourcesChecked: [],
      fieldsConfirmed: [],
      conflicts: [],
      timestamp: new Date().toISOString(),
    },
  },
);
assert.ok(
  missingAfterDeep.reviewReasons.some((r) =>
    /uitgebreid zoeken/i.test(r),
  ),
);
assert.match(
  humanMissingDateReason({
    triggered: true,
    reason: "",
    queries: [],
    sourcesChecked: [],
    fieldsConfirmed: [],
    conflicts: [],
    timestamp: "",
  }),
  /uitgebreid zoeken/,
);
ok("5 deep-fail reason copy");

const complete = blankProposal({
  title: { value: "Complete Event", status: "found", evidence: "x" },
  organizer: { value: "Org", status: "found", evidence: "x" },
  startDate: { value: "2026-11-01", status: "found", evidence: "x" },
  city: { value: "Antwerpen", status: "found", evidence: "x" },
  venue: { value: "Zaal", status: "found", evidence: "x" },
  singlesOnly: { value: "true", status: "found", evidence: "x" },
  routeAdvice: "route_a",
  routeReason: "ok",
  sourceUrl: { value: "https://example.com/e", status: "found", evidence: "x" },
  sourceKindHint: "website_first",
  needsSourceVerification: false,
});
assert.equal(shouldRunDeepVerification(complete), false);
ok("6 fast path skips deep scan when complete");

const priceUnknown = blankProposal({
  ...complete,
  priceNotes: { value: null, status: "unknown", evidence: null },
});
assert.equal(shouldRunDeepVerification(priceUnknown), false);
ok("7 price unknown does not trigger deep scan");

assert.ok(
  __test.harvestLinksFromHtml(
    `<a href="/events/foo">x</a><a href="https://allevents.in/gent/bar">y</a>`,
    "https://example.com/",
  ).length >= 1,
);
ok("8 HTML link harvest");

const classified = classifyAdminStatus({
  publicationStatus: "draft",
  startsAt: "2099-12-31T12:00:00+01:00",
  sourceUrl: "https://example.com",
  eligibilityRoute: "route_a",
  singlesOnly: true,
  singlesOriented: true,
  internalNotes: "deep_scan_at=2026-10-01T12:00:00.000Z\ndate_unknown=1",
  tags: ["date_unknown"],
  city: "Gent",
});
assert.equal(classified.status, "aandacht_nodig");
assert.match(classified.reason ?? "", /uitgebreid zoeken/);
ok("9 admin status uses deep-scan copy");

mustInclude("lib/aanvoer/deep-verify.ts", "web_search_20250305");
mustInclude("lib/aanvoer/deep-verify.ts", "DEEP_SCAN_MAX_FETCHES");
mustInclude("app/interne-aanvoer/actions.ts", "runDeepVerification");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Opnieuw laten zoeken");
mustInclude("lib/aanvoer/dedupe.ts", "Vergelijkbare titel");
ok("10 wiring strings");

// Padeldate-style: identity known, date missing → must deep-scan
const padel = blankProposal({
  title: {
    value: "Padeldate 3.0 — The Sircle",
    status: "found",
    evidence: "listing",
  },
  organizer: { value: "The Sircle", status: "found", evidence: "x" },
  city: { value: "Antwerpen", status: "found", evidence: "x" },
  startDate: { value: null, status: "unknown", evidence: null },
  singlesOriented: { value: "true", status: "found", evidence: "x" },
  routeAdvice: "route_a",
  routeReason: "singles padel",
  sourceUrl: {
    value: "https://example.com/padeldate",
    status: "found",
    evidence: "x",
  },
  sourceKindHint: "website_first",
  needsSourceVerification: false,
});
assert.ok(detectEssentialGaps(padel).includes("date"));
assert.equal(shouldRunDeepVerification(padel), true);
ok("11 Padeldate missing date triggers deep scan");

console.log("\nAll deep-scan checks passed.");
