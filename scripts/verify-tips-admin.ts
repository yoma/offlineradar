/**
 * Access-control checks for tips admin (no live Google OAuth required).
 */
import {
  __setTipsAdminSessionEmailForTests,
  isAllowlistedAdminEmail,
  isTipsAdminDevBypassEnabled,
  resolveTipsAdminAccess,
} from "../lib/tips/admin-auth";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

async function main() {
  process.env.OFFLINERADAR_TIPS_NEON_STORE = "1";
  process.env.OFFLINERADAR_ADMIN_EMAILS = "admin@example.com";
  delete process.env.OFFLINERADAR_TIPS_ADMIN_DEV_BYPASS;
  delete process.env.OFFLINERADAR_TIPS_ADMIN;
  delete process.env.AUTH_GOOGLE_ID;
  delete process.env.AUTH_GOOGLE_SECRET;
  // Keep AUTH_SECRET if present; Google still "unconfigured" without ID/secret.

  __setTipsAdminSessionEmailForTests(null);
  let access = await resolveTipsAdminAccess({ storeAvailable: true });
  if (access.ok || access.reason !== "unauthenticated") {
    console.error("FAIL expected unauthenticated", access);
    process.exit(1);
  }
  ok("no session → unauthenticated");

  __setTipsAdminSessionEmailForTests("stranger@example.com");
  access = await resolveTipsAdminAccess({ storeAvailable: true });
  if (access.ok || access.reason !== "forbidden") {
    console.error("FAIL expected forbidden for non-allowlisted", access);
    process.exit(1);
  }
  ok("signed-in non-allowlisted → forbidden");

  __setTipsAdminSessionEmailForTests("admin@example.com");
  access = await resolveTipsAdminAccess({ storeAvailable: true });
  if (!access.ok || access.email !== "admin@example.com") {
    console.error("FAIL expected allowlisted admin", access);
    process.exit(1);
  }
  ok("allowlisted session → admin");

  __setTipsAdminSessionEmailForTests("ADMIN@example.com");
  access = await resolveTipsAdminAccess({ storeAvailable: true });
  if (!access.ok) {
    console.error("FAIL email allowlist should be case-insensitive");
    process.exit(1);
  }
  ok("allowlist is case-insensitive");

  if (isAllowlistedAdminEmail("not-on-list@example.com")) {
    console.error("FAIL stranger should not be allowlisted");
    process.exit(1);
  }
  ok("allowlist rejects unknown email");

  __setTipsAdminSessionEmailForTests(undefined);
  access = await resolveTipsAdminAccess({ storeAvailable: false });
  if (access.ok || access.reason !== "store_disabled") {
    console.error("FAIL expected store_disabled", access);
    process.exit(1);
  }
  ok("store disabled → denied");

  // Dev bypass only outside production with explicit flags.
  setNodeEnv("development");
  process.env.OFFLINERADAR_TIPS_ADMIN = "1";
  process.env.OFFLINERADAR_TIPS_ADMIN_DEV_BYPASS = "1";
  if (!isTipsAdminDevBypassEnabled()) {
    console.error("FAIL expected dev bypass in development");
    process.exit(1);
  }
  access = await resolveTipsAdminAccess({ storeAvailable: true });
  if (!access.ok || access.via !== "dev_bypass") {
    console.error("FAIL expected dev_bypass", access);
    process.exit(1);
  }
  ok("dev bypass works in development");

  setNodeEnv("production");
  if (isTipsAdminDevBypassEnabled()) {
    console.error("FAIL dev bypass must be off in production");
    process.exit(1);
  }
  access = await resolveTipsAdminAccess({ storeAvailable: true });
  if (access.ok) {
    console.error("FAIL production must not accept dev bypass", access);
    process.exit(1);
  }
  ok("dev bypass blocked in production");

  // Client-supplied role/email must never grant access via allowlist helper alone
  // without a session — simulated by null session + claiming admin in query is N/A;
  // resolveTipsAdminAccess ignores any browser params by API design.
  __setTipsAdminSessionEmailForTests(null);
  setNodeEnv("development");
  delete process.env.OFFLINERADAR_TIPS_ADMIN_DEV_BYPASS;
  access = await resolveTipsAdminAccess({
    storeAvailable: true,
    sessionEmail: null,
  });
  if (access.ok) {
    console.error("FAIL null sessionEmail must deny");
    process.exit(1);
  }
  ok("null sessionEmail option → denied");

  __setTipsAdminSessionEmailForTests(undefined);
  console.log("\nOK: tips admin access control.");
}

function setNodeEnv(value: "development" | "production" | "test") {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
