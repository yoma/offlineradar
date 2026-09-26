/**
 * Invariants for event reports ("Geen singlesevent? Meld het").
 * Usage: npm run verify:event-reports
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import {
  EVENT_REPORT_DEDUPE_HOURS,
  EVENT_REPORT_RATE_LIMIT,
  submitEventReport,
  updateOpenReportsForEdition,
  listEventReportSummaries,
} from "../lib/events/reports";

function ok(msg: string) {
  console.log(`ok  ${msg}`);
}

function fakeRequest(ip = "203.0.113.77"): Request {
  return new Request("https://offlineradar.vercel.app/api/events/x/report", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      "content-type": "application/json",
    },
  });
}

async function main() {
  const check = assertOfflineRadarDbConfig();
  assert.equal(check.ok, true, "db config");
  assert.equal(
    process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim(),
    expectedNeonProjectId(),
  );
  const sql = getEventsSql();
  assert.ok(sql, "sql");

  const tipBefore = await sql!`SELECT count(*)::int AS n FROM tips`;
  const tipBeforeN = (tipBefore[0] as { n: number }).n;

  const pub = (await sql!`
    SELECT id, publication_status, slug FROM event_editions
    WHERE publication_status = 'published'
    ORDER BY starts_at ASC
    LIMIT 1
  `) as { id: string; publication_status: string; slug: string }[];
  assert.ok(pub[0], "need at least one published event");
  const editionId = pub[0].id;

  const under = (await sql!`
    SELECT id FROM event_editions
    WHERE publication_status = 'under_review'
    LIMIT 1
  `) as { id: string }[];

  // Clean prior test rows for this edition from this verify run
  await sql!`DELETE FROM event_reports WHERE event_edition_id = ${editionId} AND resolution_note = 'verify-event-reports'`;

  const statusBefore = (
    await sql!`
      SELECT publication_status FROM event_editions WHERE id = ${editionId}
    `
  )[0] as { publication_status: string };

  const first = await submitEventReport({
    eventEditionId: editionId,
    request: fakeRequest("198.51.100.42"),
  });
  assert.equal(first.ok, true, "published report ok");
  if (first.ok) assert.equal(first.created, true, "first creates");
  ok("published event report works");

  // Tag for cleanup / admin update path later
  await sql!`
    UPDATE event_reports
    SET resolution_note = 'verify-event-reports'
    WHERE event_edition_id = ${editionId}
      AND status = 'new'
      AND created_at > now() - interval '1 minute'
  `;

  const dup = await submitEventReport({
    eventEditionId: editionId,
    request: fakeRequest("198.51.100.42"),
  });
  assert.equal(dup.ok, true, "duplicate still ok");
  if (dup.ok) assert.equal(dup.created, false, "duplicate not created");
  const countDup = (await sql!`
    SELECT count(*)::int AS n FROM event_reports
    WHERE event_edition_id = ${editionId}
      AND resolution_note = 'verify-event-reports'
  `)[0] as { n: number };
  assert.equal(Number(countDup.n), 1, "still one row after dup");
  ok("duplicate protection works");

  if (under[0]) {
    const unpublished = await submitEventReport({
      eventEditionId: under[0].id,
      request: fakeRequest("198.51.100.99"),
    });
    assert.equal(unpublished.ok, false, "under_review rejected");
    if (!unpublished.ok) assert.equal(unpublished.status, 404);
    ok("unpublished event report geweigerd");
  } else {
    ok("unpublished event report geweigerd (skipped: no under_review)");
  }

  const badId = await submitEventReport({
    eventEditionId: "not-a-uuid",
    request: fakeRequest("198.51.100.55"),
  });
  assert.equal(badId.ok, false);
  ok("invalid id rejected");

  // Rate limit: burn remaining slots quickly with unique IPs would not hit;
  // instead assert constants and that a denied path exists.
  assert.equal(EVENT_REPORT_RATE_LIMIT.maxReports, 10);
  assert.equal(EVENT_REPORT_DEDUPE_HOURS, 24);
  ok("rate limit config present");

  const cols = (await sql!`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'event_reports'
  `) as { column_name: string }[];
  const names = new Set(cols.map((c) => c.column_name));
  assert.equal(names.has("reporter_hash"), true);
  assert.equal(names.has("ip"), false);
  assert.equal(names.has("email"), false);
  assert.equal(names.has("name"), false);
  ok("raw IP / PII columns absent");

  const statusAfter = (
    await sql!`
      SELECT publication_status FROM event_editions WHERE id = ${editionId}
    `
  )[0] as { publication_status: string };
  assert.equal(
    statusAfter.publication_status,
    statusBefore.publication_status,
    "publication unchanged",
  );
  ok("eventstatus verandert nooit door report");

  const summaries = await listEventReportSummaries();
  assert.ok(
    summaries.some((s) => s.eventEditionId === editionId && s.openCount >= 1),
    "admin sees open count",
  );
  ok("admin ziet report count");

  const updated = await updateOpenReportsForEdition({
    eventEditionId: editionId,
    status: "dismissed",
    reviewedBy: "verify-script",
    resolutionNote: "verify-event-reports dismissed",
  });
  assert.ok(updated >= 1, "dismiss open reports");
  const openAfter = (await sql!`
    SELECT count(*)::int AS n FROM event_reports
    WHERE event_edition_id = ${editionId}
      AND status IN ('new', 'reviewing')
  `)[0] as { n: number };
  assert.equal(Number(openAfter.n), 0);
  ok("admin can dismissed/resolved");

  // Public API route exists and returns minimal shape (source check)
  const routeSrc = readFileSync(
    path.join(process.cwd(), "app/api/events/[id]/report/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /ok:\s*true/);
  assert.equal(routeSrc.includes("reporter_hash"), false);
  assert.equal(routeSrc.includes("openCount"), false);
  ok("public API lekt niets (source)");

  const cardSrc = readFileSync(
    path.join(process.cwd(), "components/events/event-card.tsx"),
    "utf8",
  );
  assert.match(cardSrc, /ReportSinglesCta/);
  assert.match(cardSrc, /stopPropagation|ReportSinglesCta/);
  const ctaSrc = readFileSync(
    path.join(process.cwd(), "components/events/report-singles-cta.tsx"),
    "utf8",
  );
  assert.match(ctaSrc, /stopPropagation/);
  assert.match(ctaSrc, /Ja, meld dit/);
  ok("card CTA uses stopPropagation");

  const tipAfter = await sql!`SELECT count(*)::int AS n FROM tips`;
  assert.equal((tipAfter[0] as { n: number }).n, tipBeforeN);
  ok("tips intact");

  const pubCount = (await sql!`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `)[0] as { n: number };
  assert.ok(Number(pubCount.n) >= 40, "catalog intact");
  ok("catalogus intact");

  // Cleanup verify rows
  await sql!`
    DELETE FROM event_reports
    WHERE resolution_note LIKE 'verify-event-reports%'
  `;

  console.log("\nOK: event reports invariants.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
