/**
 * Claude writes the text of one promo reel: hook, short lines, stock search
 * queries (one per clip) and the caption. Themes, tone and hashtags come from
 * config/promo-reels.ts. The result is checked here (length, no repeats, no
 * claim that the people on screen use the site) and rewritten once or twice
 * when a check fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PROMO_REELS_CONFIG, type PromoTheme } from "@/config/promo-reels";
import { noEmDash } from "@/lib/instagram/captions";
import type { PromoScript } from "@/lib/instagram/promo/types";

const MAX_ATTEMPTS = 3;
const HOOK_MAX_CHARS = 60;
const LINE_MAX_CHARS = 48;

/**
 * Phrases that would suggest the people in the footage are members or users,
 * or that they met through the site. Stock footage shows models, not users.
 */
const MEMBER_CLAIMS: RegExp[] = [
  /\bleden\b/i,
  /\blid van\b/i,
  /\bgebruikers?\b/i,
  /\bmembers?\b/i,
  /\b(zij|ze|hij|deze mensen|dit koppel|deze koppels?)\b[^.?!]{0,40}\b(vonden|ontmoetten|leerden)\b/i,
  /\b(vonden|ontmoetten) elkaar\b/i,
  /\bvia (onze site|dateofflinehub)\b[^.?!]{0,30}\b(ontmoet|gevonden|leren kennen)/i,
  /\bechte (koppels|verhalen|leden)\b/i,
];

export function normalizeHook(hook: string): string {
  return hook
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim();
}

/** Problems with a script, in Dutch so they can go back to Claude as-is. */
export function checkPromoScript(
  script: PromoScript,
  args: { clipCount: number; recentHooks: string[]; eventCount: number | null },
): string[] {
  const problems: string[] = [];
  const texts = [script.hook, ...script.lines, script.caption];
  if (!script.hook.trim()) problems.push("De hook is leeg.");
  if (script.hook.length > HOOK_MAX_CHARS) {
    problems.push(`De hook is ${script.hook.length} tekens, maximaal ${HOOK_MAX_CHARS}.`);
  }
  for (const line of script.lines) {
    if (line.length > LINE_MAX_CHARS) {
      problems.push(`De regel "${line}" is te lang (maximaal ${LINE_MAX_CHARS} tekens).`);
    }
  }
  if (script.lines.length !== args.clipCount - 1) {
    problems.push(`Geef precies ${args.clipCount - 1} korte regels (één per clip na de eerste).`);
  }
  if (script.searchQueries.length !== args.clipCount) {
    problems.push(`Geef precies ${args.clipCount} zoektermen, één per clip.`);
  }
  if (texts.some((t) => /[—–]/.test(t))) problems.push("Gebruik geen em-dash of en-dash.");
  for (const text of texts) {
    if (MEMBER_CLAIMS.some((re) => re.test(text))) {
      problems.push(
        `"${text.slice(0, 80)}" suggereert dat de mensen in beeld leden of gebruikers zijn, of elkaar via de site vonden. Dat mag niet.`,
      );
    }
  }
  const recent = new Set(args.recentHooks.map(normalizeHook));
  if (recent.has(normalizeHook(script.hook))) {
    problems.push(`De hook "${script.hook}" is recent al gebruikt. Schrijf een nieuwe.`);
  }
  // Numbers only when they are the real count.
  const numbers = texts.join(" ").match(/\b\d+\b/g) ?? [];
  const allowed = args.eventCount == null ? [] : [String(args.eventCount)];
  const invented = numbers.filter((n) => !allowed.includes(n));
  if (invented.length > 0) {
    problems.push(`Gebruik geen getallen behalve het echte aantal events (${allowed.join(", ") || "geen"}).`);
  }
  if (!/dateofflinehub\.be/i.test(script.caption)) {
    problems.push("Noem dateofflinehub.be in de caption.");
  }
  return problems;
}

/** Weighted random theme, avoiding the theme of the last reel when possible. */
export function pickTheme(
  themes: readonly PromoTheme[],
  lastThemeId: string | null,
  random: () => number = Math.random,
): PromoTheme {
  const pool = themes.length > 1 ? themes.filter((t) => t.id !== lastThemeId) : themes;
  const total = pool.reduce((sum, t) => sum + (t.weight ?? 1), 0);
  let r = random() * total;
  for (const theme of pool) {
    r -= theme.weight ?? 1;
    if (r <= 0) return theme;
  }
  return pool[pool.length - 1]!;
}

const SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "Openingszin, max 8 woorden." },
    lines: {
      type: "array",
      items: { type: "string" },
      description: "Eén korte regel per clip na de eerste.",
    },
    searchQueries: {
      type: "array",
      items: { type: "string" },
      description: "Eén Engelse zoekterm per clip, voor stockvideo.",
    },
    caption: { type: "string", description: "Instagram-caption met hashtags." },
  },
  required: ["hook", "lines", "searchQueries", "caption"],
  additionalProperties: false,
} as const;

function systemPrompt(): string {
  const c = PROMO_REELS_CONFIG;
  return [
    "Je schrijft korte Instagram-reels voor DateOfflineHub.be, een Vlaamse site die singles-events verzamelt (speeddates, wandelingen, kookworkshops, quizzen...).",
    "Het doel is mensen naar de site te trekken. De video toont sfeerbeelden uit een stockbibliotheek: mensen die praten, lachen, wandelen, iets drinken.",
    "",
    "Toon:",
    ...c.voice.map((v) => `- ${v}`),
    "",
    "Harde regels:",
    "- De mensen in beeld zijn stockmodellen. Suggereer NOOIT dat zij leden of gebruikers van de site zijn, of dat ze elkaar via de site ontmoet hebben. Geen 'zij vonden elkaar', 'onze leden', 'echte koppels'.",
    "- Geen getallen, behalve het echte aantal events als je dat krijgt.",
    "- Geen em-dashes of en-dashes.",
    "- Geen beloftes over liefde of resultaat ('vind de ware'); het gaat om mensen ontmoeten in het echt.",
    "",
    "Wat je teruggeeft:",
    "- hook: de openingszin op het scherm, hoogstens 8 woorden, leesbaar in één seconde.",
    "- lines: per volgende clip een korte zin (hoogstens 6 woorden) die het verhaal verderzet. De laatste regel leidt naar de site, maar de url zelf komt er automatisch onder.",
    "- searchQueries: per clip een Engelse zoekterm (3 à 5 woorden) voor Pexels die past bij die zin: warme, natuurlijke beelden van duo's of groepjes (bv. 'friends laughing terrace', 'couple talking cafe', 'people walking city evening'). Geen close-ups van één persoon, geen kantoor, geen telefoons.",
    `- caption: 2 à 4 korte zinnen in dezelfde toon, met dateofflinehub.be (of 'link in bio'), en daarna een regel met deze hashtags: ${c.fixedHashtags.join(" ")} plus 2 à 3 passende Vlaamse hashtags. Geen emoji-overdaad (hoogstens één).`,
  ].join("\n");
}

function userPrompt(args: {
  theme: PromoTheme;
  clipCount: number;
  recentHooks: string[];
  eventCount: number | null;
  problems: string[];
}): string {
  const { theme } = args;
  const out = [
    `Thema: ${theme.brief}`,
    `Voorbeelden van de toon (niet letterlijk overnemen): ${theme.exampleHooks.map((h) => `"${h}"`).join(", ")}`,
    `Beeldideeën: ${theme.visualIdeas.join(", ")}`,
    `Aantal clips: ${args.clipCount} (dus ${args.clipCount - 1} lines en ${args.clipCount} searchQueries).`,
  ];
  if (theme.useEventCount) {
    out.push(
      args.eventCount != null
        ? `Echt aantal singles-events deze week in Vlaanderen: ${args.eventCount}. Gebruik dit getal in de hook.`
        : "Er is geen telling beschikbaar: noem geen aantal.",
    );
  }
  if (args.recentHooks.length > 0) {
    out.push(
      "Deze hooks zijn recent gebruikt, schrijf iets dat er duidelijk anders uitziet:",
      ...args.recentHooks.map((h) => `- ${h}`),
    );
  }
  if (args.problems.length > 0) {
    out.push("", "Je vorige versie had deze problemen, los ze op:", ...args.problems.map((p) => `- ${p}`));
  }
  return out.join("\n");
}

function parseScript(text: string, themeId: string): PromoScript {
  const raw = JSON.parse(text) as Omit<PromoScript, "themeId">;
  const clean = (s: unknown) => noEmDash(String(s ?? "").trim());
  return {
    themeId,
    hook: clean(raw.hook),
    lines: (raw.lines ?? []).map(clean).filter(Boolean),
    searchQueries: (raw.searchQueries ?? []).map((q) => String(q).trim()).filter(Boolean),
    caption: clean(raw.caption),
  };
}

export type WritePromoScriptArgs = {
  theme: PromoTheme;
  clipCount: number;
  recentHooks: string[];
  /** Real count for themes with useEventCount; null when unknown. */
  eventCount: number | null;
  client?: Anthropic;
};

export async function writePromoScript(args: WritePromoScriptArgs): Promise<PromoScript> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()?.split(/\r?\n/)[0]?.trim();
  if (!args.client && !apiKey) throw new Error("ANTHROPIC_API_KEY ontbreekt.");
  const client = args.client ?? new Anthropic({ apiKey });
  const eventCount = args.theme.useEventCount ? args.eventCount : null;

  let problems: string[] = [];
  let last: PromoScript | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await client.messages.create({
      model: PROMO_REELS_CONFIG.model,
      max_tokens: 4000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCRIPT_SCHEMA } },
      system: systemPrompt(),
      messages: [
        {
          role: "user",
          content: userPrompt({ ...args, eventCount, problems }),
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude weigerde het script.");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Geen script ontvangen.");
    last = parseScript(text.text, args.theme.id);
    problems = checkPromoScript(last, {
      clipCount: args.clipCount,
      recentHooks: args.recentHooks,
      eventCount,
    });
    if (problems.length === 0) return last;
    console.warn(`[promo/script] poging ${attempt}: ${problems.join(" | ")}`);
  }
  throw new Error(`Geen bruikbaar script na ${MAX_ATTEMPTS} pogingen: ${problems.join(" ")}`);
}
