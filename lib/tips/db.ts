import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Server-side Neon SQL client for OfflineRadar tips only.
 * Requires OFFLINERADAR_DATABASE_URL (never NEXT_PUBLIC_*).
 */

const EXPECTED_PROJECT_ID = "little-haze-16039117";
/** Neon compute endpoint for OfflineRadar project little-haze-16039117. */
const EXPECTED_ENDPOINT_ID = "ep-fancy-hat-b2jkbryx";

export function getOfflineRadarDatabaseUrl(): string | null {
  const url = process.env.OFFLINERADAR_DATABASE_URL?.trim();
  return url || null;
}

export function getConfiguredNeonProjectId(): string | null {
  return process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() || null;
}

/**
 * Refuse to proceed if the connection does not belong to OfflineRadar.
 * Checks: postgres scheme, database name, Neon EU host, and the known
 * project compute endpoint id (not only a claimed project-id env var).
 */
export function assertOfflineRadarDbConfig(): {
  ok: true;
  databaseUrl: string;
} | { ok: false; error: string } {
  const databaseUrl = getOfflineRadarDatabaseUrl();
  if (!databaseUrl) {
    return { ok: false, error: "OFFLINERADAR_DATABASE_URL ontbreekt." };
  }
  if (
    !databaseUrl.startsWith("postgresql://") &&
    !databaseUrl.startsWith("postgres://")
  ) {
    return { ok: false, error: "OFFLINERADAR_DATABASE_URL is geen postgres-URL." };
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, error: "OFFLINERADAR_DATABASE_URL is ongeldig." };
  }
  const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
  if (dbName !== "offlineradar") {
    return {
      ok: false,
      error: "Database naam hoort offlineradar te zijn (OfflineRadar-project).",
    };
  }
  if (!parsed.hostname.includes("neon.tech")) {
    return { ok: false, error: "Host is geen Neon-endpoint." };
  }
  if (!parsed.hostname.includes("eu-central-1")) {
    return {
      ok: false,
      error: "Host staat niet in aws-eu-central-1 (Frankfurt).",
    };
  }
  if (!parsed.hostname.includes(EXPECTED_ENDPOINT_ID)) {
    return {
      ok: false,
      error:
        "Host hoort niet bij het OfflineRadar Neon-endpoint van little-haze-16039117.",
    };
  }
  const projectId = getConfiguredNeonProjectId();
  if (projectId && projectId !== EXPECTED_PROJECT_ID) {
    return {
      ok: false,
      error: "OFFLINERADAR_NEON_PROJECT_ID komt niet overeen met OfflineRadar.",
    };
  }
  return { ok: true, databaseUrl };
}

let cachedSql: NeonQueryFunction<false, false> | null = null;

export function getTipsSql(): NeonQueryFunction<false, false> | null {
  if (cachedSql) return cachedSql;
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) return null;
  cachedSql = neon(check.databaseUrl);
  return cachedSql;
}

export function expectedNeonProjectId(): string {
  return EXPECTED_PROJECT_ID;
}

export function expectedNeonEndpointId(): string {
  return EXPECTED_ENDPOINT_ID;
}
