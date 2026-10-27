/**
 * Wekelijkse promo-reels: alles wat je zelf wilt bijsturen staat hier.
 *
 * Na een wijziging: commit en push. De volgende promo-reel gebruikt de nieuwe
 * waarden. Testen zonder te publiceren: `npm run promo:test` (zie
 * docs/instagram-promo-reels.md).
 *
 * Doel van deze reels: mensen naar dateofflinehub.be trekken. Events mogen
 * af en toe vermeld worden, maar zijn nooit de kern.
 */

export type PromoTemplateId = "terras" | "magazine" | "ondertitel";

export type PromoTheme = {
  /** Korte id, wordt bewaard bij elke reel (niet wijzigen na gebruik). */
  id: string;
  /** Waar gaat het over? Dit is de briefing voor Claude. */
  brief: string;
  /** Voorbeelden van de toon; Claude schrijft telkens een nieuwe variatie. */
  exampleHooks: string[];
  /** Ideeën voor de beelden (Engels, 2 à 3 woorden: zo zoekt Pixabay het best). */
  visualIdeas: string[];
  /** true = de reel noemt het echte aantal events van deze week. */
  useEventCount?: boolean;
  /** Hoe vaak dit thema gekozen wordt t.o.v. de andere (standaard 1). */
  weight?: number;
};

export const PROMO_REELS_CONFIG = {
  /** Planning: 0 = zondag, 1 = maandag, ... 6 = zaterdag. Tijd in Brussel. */
  schedule: { weekday: 0, time: "11:00" },

  /** Templates die roteren (terras, magazine, ondertitel). Eén = altijd dezelfde look. */
  templates: ["ondertitel"] as PromoTemplateId[],

  /** Lengte van de video in seconden. */
  minSeconds: 10,
  maxSeconds: 20,
  /** Aantal clips per video. */
  minClips: 2,
  maxClips: 4,

  /** Zoveel vorige hooks en clips worden vermeden. */
  avoidRecentHooks: 30,
  avoidRecentClips: 200,

  /** Muziekmap in remotion/public. Leeg? Dan de gewone reel-muziek. */
  musicDir: "music/promo",

  /** Claude-model voor tekst en beeldkeuze. */
  model: "claude-opus-5-5",

  /** Altijd in de caption (Claude voegt er 2 à 3 passende aan toe). */
  fixedHashtags: ["#dateofflinehub", "#singlesvlaanderen"],

  /** Laatste scène van elke video. */
  cta: {
    lead: "Ontdek alle events op",
    website: "dateofflinehub.be",
  },

  /** Toon voor Claude. */
  voice: [
    "Vlaams / Belgisch Nederlands zoals mensen het echt zeggen, warm en natuurlijk.",
    "Kort: een hook van hoogstens 8 woorden die je in één seconde leest.",
    "Niet reclame-achtig: geen reeks uitroeptekens, geen 'ontdek nu', geen superlatieven.",
    "Spreek de kijker aan met 'je'. Geen emoji in de video zelf.",
  ],

  themes: [
    {
      id: "offline-event",
      brief:
        "Mensen die liever in het echt iemand leren kennen dan online. DateOfflineHub verzamelt singles-events in Vlaanderen op één plek.",
      exampleHooks: ["Zoek je een offline event?", "Liever iemand in het echt ontmoeten?"],
      visualIdeas: ["friends talking cafe", "people laughing terrace", "group of friends bar evening"],
    },
    {
      id: "swipen-beu",
      brief: "Dating-apps beu. Swipen voelt leeg; een gesprek in het echt niet.",
      exampleHooks: ["Swipen beu? Ontmoet mensen in het echt.", "Je duim verdient ook eens rust."],
      visualIdeas: ["couple talking cafe", "friends laughing table", "people chatting outdoors"],
    },
    {
      id: "anders-daten",
      brief: "Durf het eens anders aan te pakken: samen iets doen in plaats van eindeloos chatten.",
      exampleHooks: ["Pak het eens anders aan. Ga echt daten.", "Minder chatten, meer doen."],
      visualIdeas: ["people walking city evening", "friends cooking together", "couple walking park autumn"],
    },
    {
      id: "deze-week",
      brief:
        "Er zijn deze week echte singles-events in Vlaanderen. Gebruik het aantal dat je krijgt, verzin nooit zelf een getal.",
      exampleHooks: ["Deze week: {aantal} singles-events in Vlaanderen"],
      visualIdeas: ["friends toasting drinks", "people dancing party", "group laughing terrace sunset"],
      useEventCount: true,
      weight: 0.5,
    },
    {
      id: "samen-doen",
      brief:
        "Singles-events zijn meer dan speeddaten: wandelen, koken, quiz, workshops. Ontspannen iemand leren kennen.",
      exampleHooks: ["Iemand leren kennen tijdens een wandeling?", "Gewoon samen iets doen. De rest volgt."],
      visualIdeas: ["people hiking together", "friends cooking class", "people at a workshop laughing"],
    },
  ] satisfies PromoTheme[],
};

export type PromoReelsConfig = typeof PROMO_REELS_CONFIG;
