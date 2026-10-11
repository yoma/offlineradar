/**
 * Mobile layout invariants: iOS focus-zoom + horizontal scroll containment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const globals = read("app/globals.css");
assert.ok(globals.includes("font-size: 16px !important"));
assert.ok(globals.includes("overscroll-behavior-x: contain"));
assert.ok(globals.includes("overscroll-behavior-x: none"));
assert.ok(globals.includes(".mobile-scroll-x"));
assert.ok(globals.includes("search-field-control"));
assert.ok(/font-size:\s*1rem/.test(globals));

const layout = read("app/layout.tsx");
assert.ok(layout.includes("export const viewport"));
assert.ok(layout.includes('width: "device-width"'));
assert.ok(layout.includes("overflow-x-clip"));

const nav = read("components/admin/interne-admin-nav.tsx");
assert.ok(nav.includes("mobile-scroll-x"));

const cockpit = read("components/admin/aanvoer-cockpit.tsx");
assert.ok(cockpit.includes("mobile-scroll-x"));

const home = read("components/home/home-search.tsx");
assert.ok(!home.includes("text-[15px] font-semibold leading-6 outline-none"));

console.log("OK: mobile layout verify passed.");
