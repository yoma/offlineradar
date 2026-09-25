/**
 * Integration checks against OfflineRadar Neon (little-haze-16039117).
 * Requires .env.local with OFFLINERADAR_DATABASE_URL + project id.
 * Does not enable public submit and does not send mail / call Claude.
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getTipsSql,
} from "@/lib/tips/db";
import { isTipsSubmitEnabled, tipsStorageMode } from "@/lib/tips/config";
import { createTip, listTips, updateTipStatus } from "@/lib/tips/service";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

async function main() {
  process.env.OFFLINERADAR_TIPS_NEON_STORE = "1";
  process.env.OFFLINERADAR_TIPS_ADMIN = "1";
  delete process.env.OFFLINERADAR_TIPS_PUBLIC_SUBMIT;
  delete process.env.OFFLINERADAR_TIPS_LOCAL_STORE;

  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID !== expectedNeonProjectId()) {
    console.error("FAIL unexpected Neon project id");
    process.exit(1);
  }
  ok(`config targets OfflineRadar project ${expectedNeonProjectId()}`);

  const sql = getTipsSql();
  if (!sql) {
    console.error("FAIL no SQL client");
    process.exit(1);
  }

  const identity = await sql`
    SELECT current_database() AS db, current_user AS db_user
  `;
  const row = identity[0] as { db: string; db_user: string };
  if (row.db !== "offlineradar" || row.db_user !== "offlineradar_owner") {
    console.error(`FAIL unexpected session ${row.db}/${row.db_user}`);
    process.exit(1);
  }
  ok("SQL session is offlineradar / offlineradar_owner");

  const stamp = Date.now();
  const url = `https://example.com/offlineradar-neon-test/${stamp}`;

  const created = await createTip({
    url,
    note: "OR neon integration test tip",
    notifyRequested: false,
    email: null,
  });
  if (!created.ok) {
    console.error(`FAIL create: ${created.error}`);
    process.exit(1);
  }
  if (created.tip.email != null) {
    console.error("FAIL email stored without opt-in");
    process.exit(1);
  }
  ok("tip created in Neon without email");

  const again = await listTips();
  if (!again?.tips.some((tip) => tip.id === created.tip.id)) {
    console.error("FAIL tip missing after reload");
    process.exit(1);
  }
  ok("tip visible via listTips (simulates app restart read)");

  const dup = await createTip({
    url: `${url}/`,
    note: "duplicate note keep",
    notifyRequested: false,
  });
  if (!dup.ok || !dup.duplicate) {
    console.error("FAIL duplicate handling");
    process.exit(1);
  }
  if (!dup.tip.duplicateNotes.some((note) => note.includes("duplicate note keep"))) {
    console.error("FAIL duplicate note lost");
    process.exit(1);
  }
  ok("duplicate URL merges note");

  const approved = await updateTipStatus({
    tipId: created.tip.id,
    status: "approved_for_publication",
    decisionReason: "test approve without publish",
  });
  if (!approved.ok) {
    console.error("FAIL approve");
    process.exit(1);
  }
  const afterApprove = await listTips();
  const approvedTip = afterApprove?.tips.find((tip) => tip.id === created.tip.id);
  if (approvedTip?.status !== "approved_for_publication") {
    console.error("FAIL approve not persisted");
    process.exit(1);
  }
  ok("approved_for_publication persisted (not auto-published)");

  const sneaky = await createTip({
    url: `https://example.com/offlineradar-neon-test-mail/${stamp}`,
    notifyRequested: false,
    email: "should-not-store@example.com",
  });
  if (sneaky.ok) {
    console.error("FAIL accepted email without opt-in");
    process.exit(1);
  }
  ok("rejects email without notify opt-in");

  // Public capability remains gated unless explicit store flags in runtime.
  delete process.env.OFFLINERADAR_TIPS_NEON_STORE;
  if (isTipsSubmitEnabled() || tipsStorageMode() !== "disabled") {
    process.env.OFFLINERADAR_TIPS_NEON_STORE = "1";
    console.error("FAIL submit should be disabled without store flag");
    process.exit(1);
  }
  ok("submit disabled without OFFLINERADAR_TIPS_NEON_STORE");

  process.env.OFFLINERADAR_TIPS_NEON_STORE = "1";
  console.log("\nOK: Neon tip portal integration.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
