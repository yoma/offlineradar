/**
 * FASE 26.17 — Plak info intake checks.
 * Usage: npx tsx scripts/verify-paste-info.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  INTAKE_MAX_TEXT_CHARS,
  extractUrlsFromPastedText,
  preferredSourceUrlFromPaste,
  validatePastedIntakeText,
} from "../lib/aanvoer/paste-info";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function mustInclude(rel: string, needle: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(src.includes(needle), `missing ${needle} in ${rel}`);
}

assert.equal(validatePastedIntakeText(""), "Plak eerst info over het event.");
assert.equal(validatePastedIntakeText("   "), "Plak eerst info over het event.");
assert.equal(validatePastedIntakeText("Flirt & Stride op 10 oktober"), null);
assert.ok(
  validatePastedIntakeText("x".repeat(INTAKE_MAX_TEXT_CHARS + 1))?.includes(
    "te lang",
  ),
);
ok("1 paste validation + max length");

const sample = `
Flirt & Stride - The Breakfast Edition is een singles running event
10 oktober 2026
09:00–12:30
Alix Gent
https://www.instagram.com/flirtandstride/
https://www.facebook.com/events/123/
https://allevents.in/ghent/flirt-stride
https://flirtandstride.example/breakfast
`;

const urls = extractUrlsFromPastedText(sample);
assert.ok(urls.length >= 3);
assert.equal(urls[0]?.kind, "official");
assert.ok(urls.some((u) => u.kind === "instagram"));
assert.ok(urls.some((u) => u.kind === "facebook" || u.kind === "aggregator"));
const preferred = preferredSourceUrlFromPaste(sample);
assert.ok(preferred?.includes("flirtandstride.example"));
ok("2 URL extract + classify + prefer official");

// SSRF / junk rejected
assert.equal(extractUrlsFromPastedText("see http://localhost/admin").length, 0);
assert.equal(extractUrlsFromPastedText("see http://127.0.0.1/x").length, 0);
ok("3 unsafe URLs rejected");

mustInclude("app/interne-aanvoer/aanvoer-client.tsx", "Info plakken");
mustInclude(
  "app/interne-aanvoer/aanvoer-client.tsx",
  "Plak hier alles wat je over het event gevonden hebt.",
);
mustInclude(
  "app/interne-aanvoer/aanvoer-client.tsx",
  "Je mag een volledige tekst, AI-samenvatting",
);
mustInclude("app/interne-aanvoer/actions.ts", "preferredSourceUrlFromPaste");
mustInclude("app/interne-aanvoer/actions.ts", "GEÏMBOORDE LINK");
mustInclude("lib/aanvoer/paste-info.ts", "INTAKE_MAX_TEXT_CHARS");
mustInclude(
  "components/admin/aanvoer-cockpit.tsx",
  "pasteInfoOntoAandachtCandidateAction",
);
mustInclude("app/interne-aanvoer/actions.ts", "pasteInfoOntoAandachtCandidateAction");
mustInclude("components/admin/aanvoer-cockpit.tsx", "Info verwerken");
ok("4 UI/wiring strings + aandacht paste");

console.log("\nAll paste-info checks passed.");
