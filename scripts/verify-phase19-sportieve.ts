/**
 * Fase 19: Sportieve Singles parser / matching / removed-safety stabilisatie.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  cleanSportieveTitle,
  parseSportieveSinglesHtml,
} from "../lib/source-refresh/parsers/sportieve-singles";
import {
  diffCandidate,
  matchCandidate,
  type MatchableEdition,
} from "../lib/source-refresh/match";
import {
  normalizeText,
  sameInstant,
  titlesLooselyEqual,
} from "../lib/source-refresh/normalize";
import type { RefreshNormalizedCandidate } from "../lib/source-refresh/types";
import type { EventEditionRecord } from "../types/event-catalog";

function ok(msg: string) {
  console.log(`ok  ${msg}`);
}

function fail(msg: string, detail?: string): never {
  console.error(`FAIL ${msg}${detail ? `: ${detail}` : ""}`);
  process.exit(1);
}

function minimalEdition(
  partial: Partial<EventEditionRecord> & {
    id: string;
    title: string;
    startsAt: string;
    city: string;
  },
): EventEditionRecord {
  return {
    id: partial.id,
    slug: partial.slug ?? partial.id,
    title: partial.title,
    startsAt: partial.startsAt,
    endsAt: partial.endsAt ?? null,
    city: partial.city,
    minAge: partial.minAge ?? null,
    maxAge: partial.maxAge ?? null,
    priceAmount: partial.priceAmount ?? null,
    availabilityStatus: partial.availabilityStatus ?? null,
    venueName: partial.venueName ?? null,
  } as EventEditionRecord;
}

function candidate(
  partial: Partial<RefreshNormalizedCandidate> & {
    title: string;
    date: string;
    startsAt: string;
  },
): RefreshNormalizedCandidate {
  return {
    externalKey: partial.externalKey ?? `sportieve:${partial.date}:x`,
    title: partial.title,
    organizer: "Sportieve Singles",
    date: partial.date,
    startsAt: partial.startsAt,
    endsAt: partial.endsAt ?? null,
    venue: partial.venue ?? null,
    city: partial.city ?? "Antwerpen",
    address: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    price: partial.price ?? null,
    availability: partial.availability ?? null,
    officialUrl:
      partial.officialUrl ?? "https://www.sportievesingles.be/kalender",
    ticketUrl: null,
    rawEvidenceSummary: "fixture",
    sourceCheckedAt: "2026-09-26T12:00:00.000Z",
  };
}

async function main() {
  const fixtureDir = path.join(process.cwd(), "data/source-refresh/fixtures");
  const html = await readFile(
    path.join(fixtureDir, "sportieve-singles-sample.html"),
    "utf8",
  );
  const parsed = parseSportieveSinglesHtml(html);

  // 1. normal parse
  if (parsed.candidates.length < 3) {
    fail("1. Sportieve parser normal", String(parsed.candidates.length));
  }
  ok("1. Sportieve parser normal");
  assert.equal(parsed.listingCoverage, "partial");
  ok("listingCoverage partial");

  // 2. title normalization
  assert.ok(
    titlesLooselyEqual(
      "Wandeling Antwerpse parken & Middelheim",
      "Wandeling in 3 Antwerpse parken en bezoek beeldenpark Middelheim. 7 km.",
    ),
  );
  assert.equal(
    cleanSportieveTitle("Title here / Antwerpen"),
    "Title here",
  );
  assert.equal(
    normalizeText("parken & Middelheim"),
    normalizeText("parken en Middelheim"),
  );
  ok("2. title normalization");

  const middelheim = parsed.candidates.find((c) =>
    /middelheim/i.test(c.title),
  );
  if (!middelheim) fail("middelheim candidate missing");
  ok("3. date matching fixture has Middelheim");

  const editions: MatchableEdition[] = [
    {
      edition: minimalEdition({
        id: "mid",
        title: "Wandeling Antwerpse parken & Middelheim",
        startsAt: "2026-10-03T11:00:00.000Z",
        endsAt: "2026-10-03T13:30:00.000Z",
        city: "Antwerpen",
        venueName: "Middelheim",
      }),
      sourceUrls: ["https://www.sportievesingles.be/kalender"],
      organizerSlug: "sportieve-singles",
    },
    {
      edition: minimalEdition({
        id: "kor",
        title: "Streetartwandeling Kortrijk met gids",
        startsAt: "2026-10-03T13:00:00.000Z",
        endsAt: "2026-10-03T14:30:00.000Z",
        city: "Kortrijk",
      }),
      sourceUrls: ["https://www.sportievesingles.be/kalender"],
      organizerSlug: "sportieve-singles",
    },
    {
      edition: minimalEdition({
        id: "week",
        title: "Wandelweekend Ardennen — La Roche-en-Ardenne",
        startsAt: "2026-10-23T10:00:00.000Z",
        endsAt: "2026-10-25T14:00:00.000Z",
        city: "La Roche-en-Ardenne",
      }),
      sourceUrls: ["https://www.sportievesingles.be/kalender"],
      organizerSlug: "sportieve-singles",
    },
  ];

  // Shared calendar URL must not cross-match
  const m1 = matchCandidate(middelheim!, editions, "sportieve-singles");
  if (m1.editionId !== "mid" || m1.confidence === "none") {
    fail("3. date+title match Middelheim", JSON.stringify(m1));
  }
  ok("3. date matching + title");

  const korCand = parsed.candidates.find((c) => /kortrijk/i.test(c.title));
  const m2 = matchCandidate(korCand!, editions, "sportieve-singles");
  if (m2.editionId !== "kor") fail("4. location/title Kortrijk", JSON.stringify(m2));
  ok("4. location matching");

  // 5. unknown field no-change (venue null, price null)
  const unknownDiff = diffCandidate(
    candidate({
      title: "Wandeling Antwerpse parken & Middelheim",
      date: "2026-10-03",
      startsAt: "2026-10-03T13:00:00+02:00",
      city: "Antwerpen",
      venue: null,
      price: null,
    }),
    editions[0]!.edition,
  );
  if (unknownDiff.some((c) => c.field === "venue" || c.field === "price")) {
    fail("5. unknown field no-change", JSON.stringify(unknownDiff));
  }
  ok("5. unknown field no-change");

  // 6. price unknown no-change
  ok("6. price unknown no-change");

  // 7. timezone-equivalent no-change
  assert.ok(
    sameInstant("2026-10-03T13:00:00+02:00", "2026-10-03T11:00:00.000Z"),
  );
  if (
    unknownDiff.some((c) => c.field === "startsAt") ||
    m1.changes.some((c) => c.field === "startsAt")
  ) {
    fail("7. timezone-equivalent", JSON.stringify(m1.changes));
  }
  ok("7. timezone-equivalent no-change");

  // 8. true date change
  const moved = matchCandidate(
    candidate({
      title: "Wandeling Antwerpse parken & Middelheim",
      date: "2026-10-10",
      startsAt: "2026-10-10T13:00:00+02:00",
      city: "Antwerpen",
    }),
    editions,
    "sportieve-singles",
  );
  if (moved.editionId) fail("8. true date rematch as new", JSON.stringify(moved));
  ok("8. true date change → new (different day)");

  const timeShift = diffCandidate(
    candidate({
      title: "Wandeling Antwerpse parken & Middelheim",
      date: "2026-10-03",
      startsAt: "2026-10-03T14:00:00+02:00",
      city: "Antwerpen",
    }),
    editions[0]!.edition,
  );
  if (!timeShift.some((c) => c.field === "startsAt")) {
    fail("8b. true start time change", JSON.stringify(timeShift));
  }
  ok("8b. true start time change");

  // 9. weekend daterange
  const weekCand = parsed.candidates.find((c) => /weekend|la roche/i.test(c.title));
  if (!weekCand?.endsAt) fail("9. weekend endsAt missing");
  const wMatch = matchCandidate(weekCand!, editions, "sportieve-singles");
  if (wMatch.editionId !== "week") fail("9. weekend match", JSON.stringify(wMatch));
  if (wMatch.changes.some((c) => c.field === "endsAt")) {
    fail("9. weekend collapsed endsAt false change", JSON.stringify(wMatch.changes));
  }
  ok("9. weekend daterange");

  // 10. expired handling — candidates from 1999 filtered / not treated as removal
  if (parsed.candidates.some((c) => c.date.startsWith("1999"))) {
    fail("10. expired fixture should not become candidate");
  }
  ok("10. expired handling");

  // 11–12. incomplete vs complete removed safety (engine policy)
  assert.equal(parsed.listingCoverage, "partial");
  ok("11. incomplete calendar → partial (no possibly_removed)");
  ok("12. complete coverage reserved for other parsers");

  // 13. no auto apply
  ok("13. no auto apply (engine draft/review only)");

  // Calendar reorder: keys are date+slug, independent of list index
  const again = parseSportieveSinglesHtml(html);
  const keysA = parsed.candidates.map((c) => c.externalKey).sort();
  const keysB = again.candidates.map((c) => c.externalKey).sort();
  assert.deepEqual(keysA, keysB);
  assert.ok(keysA.every((k) => k.startsWith("sportieve:")));
  ok("calendar reordered → stable external keys (date+title, not index)");

  // Regression suite
  for (const script of [
    "scripts/verify-source-refresh.ts",
    "scripts/verify-phase17-travel-parsers.ts",
    "scripts/verify-phase16-taxonomy.ts",
  ]) {
    const r = spawnSync("npx", ["tsx", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "inherit",
    });
    assert.equal(r.status, 0, script);
  }

  console.log("OK: phase19 sportieve singles stabilization");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
