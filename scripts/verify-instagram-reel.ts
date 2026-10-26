/**
 * Offline checks for the reel props (no Remotion render, no Neon, no Meta).
 * Usage: npm run verify:instagram-reel
 */
import assert from "node:assert/strict";
import { listEvents } from "../lib/events";
import { buildInstagramCaption, buildSingleEventCaption, hashtagsFor } from "../lib/instagram/captions";
import { buildInstagramDraft } from "../lib/instagram/drafts";
import { readInstagramReelConfig } from "../lib/instagram/reel/config";
import { listReelTracks, nextReelTrack } from "../lib/instagram/reel/music";
import {
  buildReelProps,
  buildReelTiming,
  hookWhen,
  hookWhere,
  noEmDash,
} from "../lib/instagram/reel/props";
import {
  REEL_MIN_PHASE_MS,
  REEL_RESERVE_AFTER_MS,
  instagramUsernameFromUrl,
  reelCollaborators,
  reelPhaseDeadline,
} from "../lib/instagram/reel/publish-plan";
import { REEL_FPS, reelDurationInFrames } from "../lib/instagram/reel/types";
import type { Event } from "../types/event";

function ev(over: Partial<Event>): Event {
  return { city: "Gent", region: "Oost-Vlaanderen", startDate: "2026-10-31", ...over } as Event;
}

async function main() {
  // --- config ---------------------------------------------------------------
  const defaults = readInstagramReelConfig({});
  assert.equal(defaults.enabled, true, "reels allowed unless the emergency stop is set");
  assert.equal(readInstagramReelConfig({ INSTAGRAM_REEL_ENABLED: "0" }).enabled, false);
  assert.equal(defaults.fallbackToPost, true);
  assert.equal(defaults.collaborators, true);
  assert.equal(readInstagramReelConfig({ INSTAGRAM_REEL_COLLABORATORS: "0" }).collaborators, false);
  assert.equal(defaults.minSeconds, 8);
  assert.equal(defaults.maxSeconds, 15);
  assert.equal(defaults.musicDir, "music");
  const custom = readInstagramReelConfig({
    INSTAGRAM_REEL_FALLBACK_TO_POST: "0",
    INSTAGRAM_REEL_MIN_SECONDS: "20",
    INSTAGRAM_REEL_MAX_SECONDS: "10",
    INSTAGRAM_REEL_MUSIC_DIR: "/tracks/",
  });
  assert.equal(custom.enabled, true);
  assert.equal(custom.fallbackToPost, false);
  assert.ok(custom.maxSeconds >= custom.minSeconds, "max never below min");
  assert.equal(custom.musicDir, "tracks");

  // --- hook -------------------------------------------------------------------
  assert.equal(hookWhere([ev({}), ev({})]), "in Gent");
  assert.equal(
    hookWhere([ev({ city: "Gent" }), ev({ city: "Aalst" })]),
    "in Oost-Vlaanderen",
  );
  assert.equal(
    hookWhere([ev({ region: "Brussel", city: "Brussel" }), ev({ city: "Aalst" })]),
    null,
  );
  // Monday 26 Oct 2026: Fri 30 to Sun 1 Nov is "dit weekend".
  const monday = "2026-10-26";
  assert.equal(hookWhen([ev({ startDate: "2026-10-31" }), ev({ startDate: "2026-11-01" })], "binnenkort", monday), "dit weekend");
  assert.equal(hookWhen([ev({ startDate: monday })], "binnenkort", monday), "vandaag");
  assert.equal(hookWhen([ev({ startDate: "2026-10-27" })], "binnenkort", monday), "morgen");
  assert.equal(hookWhen([ev({ startDate: "2026-11-04" })], "binnenkort", monday), "op wo 4 nov");
  assert.equal(
    hookWhen([ev({ startDate: "2026-10-28" }), ev({ startDate: "2026-11-09" })], "binnenkort", monday),
    "de komende weken",
  );
  assert.equal(noEmDash("Gent — Aalst"), "Gent, Aalst");

  // --- timing: always 8 to 15 s ----------------------------------------------
  for (const layout of ["single", "cards", "listing"] as const) {
    for (let n = 1; n <= 7; n++) {
      if (layout === "single" && n > 1) continue;
      const t = buildReelTiming(layout, n, defaults);
      const seconds = reelDurationInFrames(t.timing, t.layout, n) / REEL_FPS;
      assert.ok(seconds >= 8 && seconds <= 15, `${layout} x${n}: ${seconds}s`);
    }
  }

  // --- props from a real draft (mock catalog offline) ------------------------
  const catalog = await listEvents();
  const draft = buildInstagramDraft("binnenkort", catalog, { now: new Date() });
  if (draft) {
    const props = buildReelProps({
      format: draft.format,
      events: draft.events,
      publishAt: new Date(),
      config: defaults,
      music: null,
    });
    assert.deepEqual(props.events.map((e) => e.id), draft.eventIds, "same events as the post");
    assert.ok(props.hookText.startsWith(`${draft.events.length} singles-events`));
    const text = JSON.stringify(props);
    assert.ok(!text.includes("—"), "no em-dashes in reel texts");
  }

  // --- music rotation ---------------------------------------------------------
  assert.equal(nextReelTrack([], null), null);
  assert.equal(nextReelTrack(["a", "b", "c"], null), "a");
  assert.equal(nextReelTrack(["a", "b", "c"], "a"), "b");
  assert.equal(nextReelTrack(["a", "b", "c"], "c"), "a");
  assert.equal(nextReelTrack(["a", "b"], "gone"), "a");
  assert.ok((await listReelTracks("music")).length >= 1, "default track present");

  // --- captions: no em-dashes, 3 to 5 hashtags with a local one --------------
  const tagsOf = (text: string): string[] => text.match(/#\w+/g) ?? [];
  const gent = [
    ev({ activities: ["speeddate"], title: "Speeddate — Gent" }),
    ev({ activities: ["wandelen"], title: "Wandeling" }),
  ];
  const mixed = [ev({}), ev({ city: "Hasselt", region: "limburg" })];
  for (const events of [gent, mixed, [ev({ city: "Sint-Niklaas", region: "oost-vlaanderen", activities: [] })]]) {
    const tags = tagsOf(hashtagsFor(events));
    assert.ok(tags.length >= 3 && tags.length <= 5, `3 to 5 hashtags: ${tags.join(" ")}`);
  }
  assert.ok(tagsOf(hashtagsFor(gent)).includes("#singlesgent"), hashtagsFor(gent));
  assert.ok(tagsOf(hashtagsFor(mixed)).includes("#singlesvlaanderen"), hashtagsFor(mixed));
  assert.ok(
    hashtagsFor([ev({ city: "Sint-Niklaas", region: "oost-vlaanderen", activities: [] })]).includes("#singlessintniklaas"),
  );
  for (const format of ["deze_week", "nieuw", "binnenkort"] as const) {
    const text = buildInstagramCaption(format, gent as Event[], "").text;
    assert.ok(!text.includes("—"), `${format} caption without em-dash`);
  }
  assert.ok(
    !buildSingleEventCaption(ev({ title: "A — B", shortDescription: "x — y", activities: [] })).text.includes("—"),
  );

  // --- collaborators -----------------------------------------------------------
  assert.equal(instagramUsernameFromUrl("https://www.instagram.com/singles.gent/?hl=nl"), "singles.gent");
  assert.equal(instagramUsernameFromUrl("instagram.com/Padel_Club"), "padel_club");
  assert.equal(instagramUsernameFromUrl("https://www.instagram.com/p/C123abc/"), null);
  assert.equal(instagramUsernameFromUrl("https://facebook.com/singles"), null);
  assert.equal(instagramUsernameFromUrl("not a url"), null);
  assert.deepEqual(
    reelCollaborators([
      "https://instagram.com/a",
      null,
      "https://instagram.com/dateofflinehub",
      "https://instagram.com/a/",
      "https://instagram.com/b",
      "https://instagram.com/c",
      "https://instagram.com/d",
    ]),
    ["a", "b", "c"],
    "own account out, unique, max 3",
  );

  // --- time budget -------------------------------------------------------------
  assert.equal(reelPhaseDeadline(0, 270_000), 270_000 - REEL_RESERVE_AFTER_MS);
  assert.equal(reelPhaseDeadline(0, REEL_RESERVE_AFTER_MS + REEL_MIN_PHASE_MS - 1), null);

  console.log("verify:instagram-reel OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
