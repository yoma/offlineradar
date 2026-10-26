/** Example props for `npx remotion studio`; real renders pass their own. */
import type { ReelProps } from "../lib/instagram/reel/types";

export const SAMPLE_REEL_PROPS: ReelProps = {
  layout: "cards",
  hook: { count: "3", lines: ["singles-events", "in Antwerpen", "dit weekend"] },
  hookText: "3 singles-events in Antwerpen dit weekend",
  hookKicker: "Binnenkort",
  sectionLabel: "Agenda",
  events: [
    {
      id: "sample-1",
      activity: "Padel",
      title: "Singles Padel Night",
      day: "31",
      weekday: "zaterdag",
      weekdayShort: "za",
      month: "oktober",
      monthShort: "okt",
      time: "19:30",
      city: "Antwerpen",
      meta: "Antwerpen  ·  19:30  ·  30–45 jaar",
      blurb: null,
      facts: [
        { label: "Waar", value: "Padel Club, Antwerpen" },
        { label: "Leeftijd", value: "30–45 jaar" },
        { label: "Prijs", value: "€ 25" },
      ],
    },
    {
      id: "sample-2",
      activity: "Eten en drinken",
      title: "Lange tafel 40-55",
      day: "1",
      weekday: "zondag",
      weekdayShort: "zo",
      month: "november",
      monthShort: "nov",
      time: "12:00",
      city: "Antwerpen",
      meta: "Antwerpen  ·  12:00  ·  40–55 jaar",
      blurb: null,
      facts: [
        { label: "Waar", value: "Antwerpen" },
        { label: "Leeftijd", value: "40–55 jaar" },
      ],
    },
  ],
  timing: { hookFrames: 75, bodyFrames: 84, ctaFrames: 75, overlapFrames: 10 },
  music: { src: "music/rustig-01.mp3", fadeInSeconds: 0.6, fadeOutSeconds: 1.2, volume: 0.6 },
  website: "dateofflinehub.be",
  slogan: "Minder swipen, terug echte connecties",
};
