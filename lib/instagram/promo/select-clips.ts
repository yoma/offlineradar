/**
 * Choose the clips for one promo reel. Per scene: search stock footage for
 * Claude's query (Pixabay, plus Pexels when its key is set), drop clips used before, and let Claude look at the preview
 * frames and pick the one with the right mood (warm, natural light, duos or
 * small groups, not posed, no text or logos). No good clip: a stock photo
 * for a slow Ken Burns move instead.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PROMO_REELS_CONFIG } from "@/config/promo-reels";
import {
  searchStockPhotos,
  searchStockVideos,
  type StockCandidate,
} from "@/lib/instagram/promo/stock";
import { clipKey, type PromoClip } from "@/lib/instagram/promo/types";

/** Candidates shown to Claude per scene (images cost tokens). */
const MAX_CANDIDATES = 16;
/** Below this score (0..10) a clip is not used, unless nothing better exists. */
const MIN_SCORE = 6;
/** A video this good still beats having no picture at all. */
const FALLBACK_SCORE = 4;

const PICK_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          score: { type: "integer", description: "0 tot 10" },
          reason: { type: "string" },
        },
        required: ["index", "score", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["scores"],
  additionalProperties: false,
} as const;

const PICK_SYSTEM = [
  "Je kiest stockbeelden voor een Instagram-reel van DateOfflineHub.be, een Vlaamse site met singles-events.",
  "Je krijgt genummerde voorbeeldbeelden. Geef elk beeld een score van 0 tot 10.",
  "Hoog scoren: warm en natuurlijk licht, echte sfeer, duo's of kleine groepjes die praten, lachen, wandelen, iets drinken, op een terras of in een café. Volwassenen van ongeveer 25 tot 55 jaar, zoals de bezoekers van de events.",
  "Laag scoren (0 tot 3): geposeerd of overdreven commercieel, recht in de camera kijken, één persoon alleen, kantoor of zakelijke setting, telefoons centraal, kinderen of tieners, duidelijk oudere mensen (grijs haar, bejaard, ouder dan ongeveer 60), tekst, logo's of watermerken in beeld, donker of koud licht, wazig.",
  "Let op: de tekst van de reel komt bovenaan en onderaan in beeld, dus rustige zones daar zijn een plus.",
].join("\n");

export type ScoredCandidate = StockCandidate & { score: number; reason: string };

type Preview = { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

async function fetchPreview(url: string): Promise<Preview | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    const mediaType = type === "image/png" || type === "image/webp" ? type : "image/jpeg";
    return { mediaType, data: Buffer.from(await res.arrayBuffer()).toString("base64") };
  } catch {
    return null;
  }
}

export async function scoreCandidates(
  client: Anthropic,
  scene: string,
  candidates: StockCandidate[],
): Promise<ScoredCandidate[]> {
  if (candidates.length === 0) return [];
  // Previews are downloaded here and sent inline: the API's own URL fetcher
  // is blocked by Pixabay's robots.txt.
  const previews = await Promise.all(candidates.map((c) => fetchPreview(c.previewUrl)));
  const usable = candidates.filter((_, i) => previews[i]);
  const images = previews.filter((p): p is Preview => p !== null);
  if (usable.length === 0) return [];
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `Deze scène hoort bij de tekst: "${scene}". Beoordeel de ${usable.length} beelden.` },
  ];
  usable.forEach((c, i) => {
    content.push({ type: "text", text: `Beeld ${i}: ${c.description}` });
    content.push({ type: "image", source: { type: "base64", media_type: images[i]!.mediaType, data: images[i]!.data } });
  });
  candidates = usable;
  const response = await client.messages.create({
    model: PROMO_REELS_CONFIG.pickModel,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: PICK_SCHEMA } },
    system: PICK_SYSTEM,
    messages: [{ role: "user", content }],
  });
  const text = response.content.find((b) => b.type === "text");
  if (response.stop_reason === "refusal" || !text || text.type !== "text") return [];
  const parsed = JSON.parse(text.text) as { scores: { index: number; score: number; reason: string }[] };
  return parsed.scores
    .filter((s) => candidates[s.index])
    .map((s) => ({ ...candidates[s.index]!, score: s.score, reason: s.reason }))
    .sort((a, b) => b.score - a.score);
}

export type SelectClipsArgs = {
  /** One query per scene (from the script). */
  queries: string[];
  /** Text per scene, so the mood check knows what it goes with. */
  sceneTexts: string[];
  /** Fallback queries when a scene finds nothing (theme's visual ideas). */
  fallbackQueries: string[];
  /** clipKey()s used in earlier reels. */
  usedClipKeys: Set<string>;
  /** Seconds each scene needs. */
  sceneSeconds: number[];
  client?: Anthropic;
  log?: (message: string) => void;
};

export async function selectPromoClips(args: SelectClipsArgs): Promise<PromoClip[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()?.split(/\r?\n/)[0]?.trim();
  if (!args.client && !apiKey) throw new Error("ANTHROPIC_API_KEY ontbreekt.");
  const client = args.client ?? new Anthropic({ apiKey });
  const log = args.log ?? (() => {});
  const taken = new Set(args.usedClipKeys);
  const chosen: PromoClip[] = [];

  for (let i = 0; i < args.queries.length; i++) {
    const scene = args.sceneTexts[i] ?? "";
    const needSeconds = args.sceneSeconds[i] ?? 4;
    const queries = [args.queries[i]!, ...args.fallbackQueries.filter((q) => q !== args.queries[i])];
    let pick: PromoClip | null = null;

    // Videos: the scene's own query first, then theme queries, scored together.
    const pool = new Map<string, StockCandidate>();
    for (const query of queries.slice(0, 3)) {
      for (const c of await searchStockVideos(query)) {
        if (!taken.has(clipKey(c)) && c.duration >= needSeconds && !pool.has(clipKey(c))) pool.set(clipKey(c), c);
      }
      if (pool.size >= MAX_CANDIDATES) break;
    }
    const scored = await scoreCandidates(client, scene, [...pool.values()].slice(0, MAX_CANDIDATES));
    const best = scored[0];
    log(
      `scène ${i + 1}: ${scored.length} videokandidaten` +
        (best ? `, beste ${clipKey(best)} ${best.score}/10 (${best.reason})` : ""),
    );
    if (best && best.score >= MIN_SCORE) pick = strip(best);

    // Back-up: a photo with a slow zoom.
    if (!pick) {
      for (const query of queries.slice(0, 2)) {
        const photos = (await searchStockPhotos(query))
          .filter((c) => !taken.has(clipKey(c)))
          .slice(0, MAX_CANDIDATES);
        const photo = (await scoreCandidates(client, scene, photos)).find((c) => c.score >= MIN_SCORE);
        log(`scène ${i + 1} foto "${query}": ${photo ? `gekozen ${clipKey(photo)} ${photo.score}/10` : "niets goed genoeg"}`);
        if (photo) {
          pick = strip(photo);
          break;
        }
      }
    }

    // Last resort: the best video if it is at least acceptable.
    if (!pick && best && best.score >= FALLBACK_SCORE) {
      log(`scène ${i + 1}: geen beter beeld, video ${clipKey(best)} (${best.score}/10) toch gebruikt`);
      pick = strip(best);
    }

    if (!pick) throw new Error(`Geen geschikt beeld gevonden voor scène ${i + 1} ("${args.queries[i]}").`);
    taken.add(clipKey(pick));
    chosen.push(pick);
  }
  return chosen;
}

function strip(c: ScoredCandidate): PromoClip {
  return {
    source: c.source,
    id: c.id,
    kind: c.kind,
    url: c.url,
    width: c.width,
    height: c.height,
    duration: c.duration,
    pageUrl: c.pageUrl,
    author: c.author,
    query: c.query,
  };
}
