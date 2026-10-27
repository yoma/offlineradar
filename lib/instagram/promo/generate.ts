/**
 * Everything a promo reel needs before the render: theme, Claude's script,
 * the clips, template, timing and caption. Used by `npm run promo:test` and
 * the queue renderer. A rejected reel can keep its script or its clips and
 * redo only the other part (replanPromoReel).
 */

import { PROMO_REELS_CONFIG, type PromoTemplateId } from "@/config/promo-reels";
import {
  buildPromoProps,
  nextTemplate,
  promoCaption,
  promoTiming,
  randomClipCount,
  sceneSeconds,
} from "@/lib/instagram/promo/props";
import { pickTheme, writePromoScript } from "@/lib/instagram/promo/script";
import { selectPromoClips } from "@/lib/instagram/promo/select-clips";
import {
  clipKey,
  type PromoClip,
  type PromoPlanRecord,
  type PromoRedo,
  type PromoReelProps,
  type PromoScript,
} from "@/lib/instagram/promo/types";
import type { ReelMusic } from "@/lib/instagram/reel/types";

/** What earlier promo reels used, so nothing repeats. */
export type PromoHistory = {
  recentHooks: string[];
  usedClipKeys: string[];
  lastThemeId: string | null;
  lastTemplate: string | null;
};

export const EMPTY_PROMO_HISTORY: PromoHistory = {
  recentHooks: [],
  usedClipKeys: [],
  lastThemeId: null,
  lastTemplate: null,
};

export { countEventsThisWeek } from "@/lib/instagram/promo/schedule";

export type PromoPlan = {
  script: PromoScript;
  clips: PromoClip[];
  template: PromoTemplateId;
  caption: string;
  props: PromoReelProps;
};

export async function planPromoReel(args: {
  history: PromoHistory;
  /** Real count for the "deze week" theme; null skips that theme. */
  eventCount: number | null;
  music: ReelMusic;
  template?: PromoTemplateId;
  themeId?: string;
  /** Keep the text of an earlier version (new clips only). */
  keepScript?: PromoScript;
  /** Keep the clips of an earlier version (new text only). */
  keepClips?: PromoClip[];
  log?: (message: string) => void;
}): Promise<PromoPlan> {
  const log = args.log ?? (() => {});
  const themes = PROMO_REELS_CONFIG.themes.filter(
    (t) => !t.useEventCount || (args.eventCount != null && args.eventCount >= 3),
  );
  const theme = args.themeId
    ? PROMO_REELS_CONFIG.themes.find((t) => t.id === args.themeId)
    : args.keepScript
      ? PROMO_REELS_CONFIG.themes.find((t) => t.id === args.keepScript!.themeId)
      : pickTheme(themes, args.history.lastThemeId);
  if (!theme) throw new Error(`Onbekend thema: ${args.themeId ?? args.keepScript?.themeId}`);

  const clipCount = args.keepClips?.length ?? args.keepScript?.searchQueries.length ?? randomClipCount();
  const template = args.template ?? nextTemplate(args.history.lastTemplate);
  const timing = promoTiming(clipCount);

  const script =
    args.keepScript ??
    (await writePromoScript({
      theme,
      clipCount,
      recentHooks: args.history.recentHooks.slice(0, PROMO_REELS_CONFIG.avoidRecentHooks),
      eventCount: args.eventCount,
    }));
  log(`thema ${theme.id}, template ${template}, ${clipCount} clips, hook "${script.hook}"`);

  const clips =
    args.keepClips ??
    (await selectPromoClips({
      queries: script.searchQueries,
      sceneTexts: [script.hook, ...script.lines],
      fallbackQueries: theme.visualIdeas,
      usedClipKeys: new Set(args.history.usedClipKeys.slice(0, PROMO_REELS_CONFIG.avoidRecentClips)),
      sceneSeconds: sceneSeconds(timing),
      log,
    }));

  return {
    script,
    clips,
    template,
    caption: promoCaption(script, clips),
    props: buildPromoProps({ template, script, clips, timing, music: args.music }),
  };
}

/** Turned-down hooks and clips remembered per post. */
const MAX_REJECTED = 60;

/**
 * A new version for a promo post in the queue. 'alles' (or no earlier plan)
 * starts over; 'tekst' keeps the clips and their theme; 'beelden' keeps the
 * script. What was turned down is remembered, so it does not come back.
 */
export async function replanPromoReel(args: {
  redo: PromoRedo;
  previous: PromoPlanRecord | null;
  history: PromoHistory;
  eventCount: number | null;
  music: ReelMusic;
  log?: (message: string) => void;
  /** For tests. */
  planner?: typeof planPromoReel;
}): Promise<{ plan: PromoPlan; record: PromoPlanRecord }> {
  const prev = args.previous;
  const newText = !prev || args.redo !== "beelden";
  const newClips = !prev || args.redo !== "tekst";
  const plan = await (args.planner ?? planPromoReel)({
    history: args.history,
    eventCount: args.eventCount,
    music: args.music,
    keepScript: newText ? undefined : prev.script,
    keepClips: newClips ? undefined : prev.clips,
    themeId: !newClips && prev ? prev.script.themeId : undefined,
    log: args.log,
  });
  const rejectedHooks = [...(prev?.rejectedHooks ?? [])];
  const rejectedClipKeys = [...(prev?.rejectedClipKeys ?? [])];
  if (prev && newText) rejectedHooks.unshift(prev.script.hook);
  if (prev && newClips) rejectedClipKeys.unshift(...prev.clips.map(clipKey));
  return {
    plan,
    record: {
      script: plan.script,
      clips: plan.clips,
      template: plan.template,
      rejectedHooks: rejectedHooks.slice(0, MAX_REJECTED),
      rejectedClipKeys: rejectedClipKeys.slice(0, MAX_REJECTED),
    },
  };
}
