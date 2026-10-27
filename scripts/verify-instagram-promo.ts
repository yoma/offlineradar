/**
 * Offline checks for the promo reels (no Claude, no Pexels, no render).
 * Usage: npm run verify:instagram-promo
 */
import assert from "node:assert/strict";
import { PROMO_REELS_CONFIG } from "../config/promo-reels";
import { countEventsThisWeek } from "../lib/instagram/promo/generate";
import { nextTemplate, promoCaption, promoTiming, sceneSeconds } from "../lib/instagram/promo/props";
import { checkPromoScript, normalizeHook, pickTheme } from "../lib/instagram/promo/script";
import { fitsReel, pickRendition } from "../lib/instagram/promo/stock";
import { promoDurationInFrames, type PromoClip, type PromoScript } from "../lib/instagram/promo/types";
import { REEL_FPS } from "../lib/instagram/reel/types";
import type { Event } from "../types/event";

const script = (over: Partial<PromoScript> = {}): PromoScript => ({
  themeId: "swipen-beu",
  hook: "Swipen beu? Ontmoet mensen in het echt.",
  lines: ["Een glas, een gesprek, een lach.", "Alle singles-events op één plek."],
  searchQueries: ["friends laughing terrace", "couple talking cafe", "people walking city evening"],
  caption: "Liever een gesprek dan nog een avond swipen. Kijk op dateofflinehub.be.\n#dateofflinehub #singlesvlaanderen #offlinedaten",
  ...over,
});
const check = (s: PromoScript, eventCount: number | null = null, recentHooks: string[] = []) =>
  checkPromoScript(s, { clipCount: 3, recentHooks, eventCount });

function main() {
  // --- config ---------------------------------------------------------------
  const ids = PROMO_REELS_CONFIG.themes.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "theme ids are unique");
  assert.ok(PROMO_REELS_CONFIG.templates.length > 0);
  assert.ok(PROMO_REELS_CONFIG.minClips >= 2 && PROMO_REELS_CONFIG.maxClips <= 4);

  // --- script checks --------------------------------------------------------
  assert.deepEqual(check(script()), [], "a good script passes");
  assert.ok(check(script({ hook: "Zij vonden elkaar via DateOfflineHub" })).length > 0, "no member claims");
  assert.ok(check(script({ lines: ["Onze leden weten het al.", "Kom erbij."] })).length > 0, "no 'leden'");
  assert.ok(check(script({ caption: "Echte koppels, echte verhalen. dateofflinehub.be" })).length > 0);
  assert.ok(check(script({ hook: "Swipen beu — ontmoet mensen" })).length > 0, "no em-dash");
  assert.ok(check(script({ lines: ["Eén regel"] })).length > 0, "one line per extra clip");
  assert.ok(check(script({ searchQueries: ["a", "b"] })).length > 0, "one query per clip");
  assert.ok(check(script(), null, ["swipen beu? Ontmoet mensen in het ECHT"]).length > 0, "no repeated hook");
  assert.ok(check(script({ hook: "Al 500 singles gingen je voor" })).length > 0, "no invented numbers");
  assert.deepEqual(check(script({ hook: "Deze week: 12 singles-events in Vlaanderen" }), 12), [], "real count ok");
  assert.ok(check(script({ caption: "Tot snel! #dateofflinehub" })).length > 0, "caption names the site");
  assert.equal(normalizeHook("Deze week: 12 events!"), normalizeHook("deze week 9 events"));

  // --- theme rotation -------------------------------------------------------
  const themes = PROMO_REELS_CONFIG.themes;
  for (let i = 0; i < 50; i++) {
    assert.notEqual(pickTheme(themes, "swipen-beu").id, "swipen-beu", "never the same theme twice in a row");
  }
  assert.equal(nextTemplate(null), PROMO_REELS_CONFIG.templates[0]);
  assert.equal(nextTemplate(PROMO_REELS_CONFIG.templates.at(-1)!), PROMO_REELS_CONFIG.templates[0]);

  // --- timing ---------------------------------------------------------------
  for (let n = PROMO_REELS_CONFIG.minClips; n <= PROMO_REELS_CONFIG.maxClips; n++) {
    const timing = promoTiming(n);
    const seconds = promoDurationInFrames(timing) / REEL_FPS;
    assert.equal(timing.clipFrames.length, n);
    assert.ok(seconds >= PROMO_REELS_CONFIG.minSeconds && seconds <= PROMO_REELS_CONFIG.maxSeconds, `${n} clips: ${seconds} s`);
    assert.ok(timing.clipFrames.at(-1)! > timing.ctaFrames + 60, "the last clip has room for text and CTA");
    assert.ok(sceneSeconds(timing).every((s) => s >= 4));
  }

  // --- footage --------------------------------------------------------------
  assert.ok(fitsReel(1080, 1920));
  assert.ok(fitsReel(3840, 2160), "4K landscape crops to 9:16");
  assert.ok(!fitsReel(1920, 1080), "HD landscape would be upscaled");
  assert.ok(!fitsReel(720, 1280));
  const pick = pickRendition([
    { link: "sd", width: 540, height: 960 },
    { link: "hd", width: 1080, height: 1920 },
    { link: "qhd", width: 1440, height: 2560 },
    { link: "uhd", width: 2160, height: 3840 },
  ]);
  assert.equal(pick?.link, "hd", "smallest rendition that is sharp enough");

  // --- caption --------------------------------------------------------------
  const clips = [{ source: "pexels" }, { source: "pixabay" }] as PromoClip[];
  const caption = promoCaption(script({ caption: "Kijk op dateofflinehub.be" }), clips);
  for (const tag of PROMO_REELS_CONFIG.fixedHashtags) assert.ok(caption.includes(tag), `caption has ${tag}`);
  assert.ok(caption.endsWith("Beelden: Pexels en Pixabay"), "credits the footage");

  // --- event count ----------------------------------------------------------
  const now = new Date("2026-10-27T10:00:00Z");
  const ev = (startDate: string) => ({ startDate }) as Event;
  assert.equal(
    countEventsThisWeek([ev("2026-10-26"), ev("2026-10-27"), ev("2026-11-02"), ev("2026-11-03")], now),
    2,
  );

  console.info("verify:instagram-promo ok");
}

main();
