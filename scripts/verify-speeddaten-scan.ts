/**
 * Speeddaten.be completeness + gender parse checks.
 * Usage: npx tsx scripts/verify-speeddaten-scan.ts
 * Live compare: node --env-file=.env.local --import tsx scripts/verify-speeddaten-scan.ts --live
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseSpeeddatenHtml } from "../lib/source-refresh/parsers/speeddaten";
import { urlsReferToSameEvent } from "../lib/source-refresh/normalize";

let failed = 0;
function ok(name: string) {
  console.log(`OK  ${name}`);
}
function fail(name: string, detail: string) {
  failed++;
  console.error(`FAIL ${name}: ${detail}`);
}

async function main() {
  const fixture = await readFile(
    path.join(
      process.cwd(),
      "data/source-refresh/fixtures/speeddaten-sample.html",
    ),
    "utf8",
  );
  const parsed = parseSpeeddatenHtml(fixture);
  if (parsed.candidates.length < 2) {
    fail("fixture count", String(parsed.candidates.length));
  } else ok(`fixture candidates=${parsed.candidates.length}`);

  const first = parsed.candidates[0]!;
  if (!first.genderAvailability?.includes("Vrouwen")) {
    fail("genderAvailability", String(first.genderAvailability));
  } else ok(`genderAvailability=${first.genderAvailability}`);

  if (first.womenAvailability !== "limited") {
    fail("womenAvailability", String(first.womenAvailability));
  } else ok("womenAvailability=limited");

  if (first.menAvailability !== "waitlist") {
    fail("menAvailability", String(first.menAvailability));
  } else ok("menAvailability=waitlist");

  if (first.availability !== "waitlist") {
    fail("merged availability", String(first.availability));
  } else ok("merged availability=waitlist (most restrictive)");

  if (first.language !== "nl") {
    fail("language", String(first.language));
  } else ok("language=nl");

  // No silent truncation: each agenda-item is independent
  const keys = new Set(parsed.candidates.map((c) => c.externalKey));
  if (keys.size !== parsed.candidates.length) {
    fail("unique keys", `${keys.size} vs ${parsed.candidates.length}`);
  } else ok("unique external keys");

  if (parsed.listingCoverage !== "complete") {
    fail("listingCoverage", String(parsed.listingCoverage));
  } else ok("listingCoverage=complete");

  const live = process.argv.includes("--live");
  if (live) {
    const res = await fetch("https://www.speeddaten.be/nl/kalender-8.htm", {
      headers: { "user-agent": "DateOfflineHub-verify/1.0" },
    });
    if (!res.ok) {
      fail("live fetch", String(res.status));
    } else {
      const html = await res.text();
      const liveParsed = parseSpeeddatenHtml(html);
      const agendaCount = (html.match(/class="agenda-item"/g) ?? []).length;
      console.log(
        `LIVE agenda-items in HTML=${agendaCount}, parsed=${liveParsed.candidates.length}, skipped=${liveParsed.skipped?.length ?? 0}`,
      );
      if (liveParsed.candidates.length !== agendaCount) {
        fail(
          "live parse completeness",
          `parsed ${liveParsed.candidates.length} of ${agendaCount}`,
        );
      } else ok(`live parse complete (${agendaCount})`);

      if (liveParsed.candidates.some((c) => !c.genderAvailability)) {
        const n = liveParsed.candidates.filter((c) => !c.genderAvailability)
          .length;
        fail("live gender fields", `${n} candidates missing genderAvailability`);
      } else ok("live gender fields present");

      // Optional Neon compare
      try {
        const { listFutureEditionsForOrganizerSlug } = await import(
          "../lib/source-refresh/store"
        );
        const future = await listFutureEditionsForOrganizerSlug("smartvibes");
        const dbUrls = future.flatMap((e) => e.sourceUrls);
        const missing = liveParsed.candidates.filter(
          (c) => !dbUrls.some((u) => urlsReferToSameEvent(c.officialUrl, u)),
        );
        console.log(
          `COMPARE live=${liveParsed.candidates.length} db_active=${future.length} missing_by_url=${missing.length}`,
        );
        if (missing.length > 0) {
          console.log(
            "Missing sample:",
            missing
              .slice(0, 8)
              .map((m) => `${m.date} ${m.title}`)
              .join(" | "),
          );
        }
        ok("neon compare ran");
      } catch (err) {
        console.warn(
          "Neon compare skipped:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll speeddaten scan checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
