/**
 * Audit published edition geo integrity.
 * Fails if any published event cannot resolve reliable coordinates
 * (except travel/weekend activities which may be abroad).
 *
 * Usage: node --env-file=.env.local --import tsx scripts/audit-edition-geo.ts
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { distanceKmBetween } from "../lib/distance";
import { coordsForCity, resolveEditionCoords } from "../lib/geo-cities";
import { isTravelOrWeekendActivity } from "../lib/public-activity-groups";
import type { ActivityId } from "../types/event";

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() !== expectedNeonProjectId()) {
    console.error(`FAIL project must be ${expectedNeonProjectId()}`);
    process.exit(1);
  }
  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL SQL unavailable");
    process.exit(1);
  }

  const rows = await sql`
    SELECT id, title, city, latitude, longitude, activities
    FROM event_editions
    WHERE publication_status = 'published'
  `;

  const ant = { lat: 51.2194, lng: 4.4025 };
  const missing: string[] = [];
  const fakeAntwerp: string[] = [];
  let withDbCoords = 0;
  let withCityFallbackOnly = 0;

  for (const row of rows) {
    const city = String(row.city ?? "");
    const lat = row.latitude == null ? null : Number(row.latitude);
    const lng = row.longitude == null ? null : Number(row.longitude);
    const activities = Array.isArray(row.activities)
      ? (row.activities as ActivityId[])
      : [];
    const travel = isTravelOrWeekendActivity(activities);
    const resolved = resolveEditionCoords({
      latitude: lat,
      longitude: lng,
      city,
    });

    if (lat != null && lng != null) withDbCoords++;
    else if (resolved.known) withCityFallbackOnly++;

    if (!resolved.known && !travel) {
      missing.push(`${city} · ${String(row.title).slice(0, 50)}`);
    }

    // City is not Antwerp-area, but stored coords sit on Antwerp center.
    if (lat != null && lng != null) {
      const nearAnt = distanceKmBetween({ lat, lng }, ant) <= 2;
      const cityIsAnt = Boolean(coordsForCity(city)) &&
        distanceKmBetween(coordsForCity(city)!, ant) <= 15;
      if (nearAnt && !cityIsAnt && !/antwerpen/i.test(city)) {
        fakeAntwerp.push(`${city} · ${String(row.title).slice(0, 50)}`);
      }
    }
  }

  // Radius sanity: Wavre must be > 40km from Antwerp when resolved.
  const wavre = coordsForCity("Wavre");
  if (!wavre || distanceKmBetween(ant, wavre) < 40) {
    console.error("FAIL Wavre distance sanity");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        published: rows.length,
        withDbCoords,
        withCityFallbackOnly,
        unresolvedNonTravel: missing.length,
        fakeAntwerpCoords: fakeAntwerp.length,
        missingSample: missing.slice(0, 20),
        fakeSample: fakeAntwerp.slice(0, 20),
        wavreKmFromAntwerp: distanceKmBetween(ant, wavre),
      },
      null,
      2,
    ),
  );

  if (missing.length > 0 || fakeAntwerp.length > 0) {
    console.error("\nFAIL geo audit");
    process.exit(1);
  }
  console.log("\nOK: edition geo audit");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
