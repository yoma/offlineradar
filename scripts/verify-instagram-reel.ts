/**
 * Offline checks for the reel props (no Remotion render, no Neon, no Meta).
 * Usage: npm run verify:instagram-reel
 */
import assert from "node:assert/strict";
import { listEvents } from "../lib/events";
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
import { REEL_FPS, reelDurationInFrames } from "../lib/instagram/reel/types";
import type { Event } from "../types/event";

function ev(over: Partial<Event>): Event {
  return { city: "Gent", region: "Oost-Vlaanderen", startDate: "2026-10-31", ...over } as Event;
}

async function main() {
  // --- config ---------------------------------------------------------------
  const defaults = readInstagramReelConfig({});
  assert.equal(defaults.enabled, false, "reels are off unless switched on");
  assert.equal(defaults.fallbackToPost, true);
  assert.equal(defaults.minSeconds, 8);
  assert.equal(defaults.maxSeconds, 15);
  assert.equal(defaults.musicDir, "music");
  const custom = readInstagramReelConfig({
    INSTAGRAM_REEL_ENABLED: "1",
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

  console.log("verify:instagram-reel OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
