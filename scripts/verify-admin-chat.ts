/**
 * Admin chat wiring invariants (no live Anthropic / Neon).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let failed = 0;
function mustInclude(file: string, needle: string) {
  const full = path.join(process.cwd(), file);
  const text = readFileSync(full, "utf8");
  if (!text.includes(needle)) {
    failed++;
    console.error(`FAIL ${file} missing: ${needle}`);
  } else {
    console.log(`OK  ${file} has ${needle.slice(0, 48)}`);
  }
}

mustInclude("lib/admin-chat/agent.ts", "assess_url");
mustInclude("lib/admin-chat/agent.ts", "scan_source");
mustInclude("lib/admin-chat/tools.ts", "toolAssessUrl");
mustInclude("lib/admin-chat/tools.ts", "runAdminIntakeExtract");
mustInclude("lib/admin-chat/tools.ts", "saveIntakeAsEventCandidate");
mustInclude("lib/admin-chat/tools.ts", "startSourceRefresh");
mustInclude("lib/admin-chat/tools.ts", "mode: input.thorough");
mustInclude("app/api/interne-admin-chat/route.ts", "resolveTipsAdminAccess");
mustInclude("components/admin/admin-chat-panel.tsx", "/api/interne-admin-chat");
mustInclude("components/admin/admin-chat-panel.tsx", "Past dit in ons kraam");
mustInclude("components/admin/aanvoer-cockpit.tsx", "AdminChatPanel");
mustInclude("lib/tips/url.ts", "coerceToHttpUrl");
mustInclude("lib/admin-chat/agent.ts", "roep DIRECT assess_url");

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAdmin chat wiring OK.");
