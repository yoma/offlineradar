/**
 * Track which event editions already appeared in Instagram concepts.
 * File-backed (no new Neon table yet). Not used for Meta publish.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const HISTORY_DIR = path.join(process.cwd(), ".data");
const HISTORY_FILE = path.join(HISTORY_DIR, "instagram-concept-history.json");

export type InstagramConceptHistory = {
  /** ISO timestamps of last concept inclusion per event id */
  eventIds: Record<string, string>;
  updatedAt: string;
};

async function readHistory(): Promise<InstagramConceptHistory> {
  try {
    const raw = await readFile(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw) as InstagramConceptHistory;
    if (!parsed?.eventIds || typeof parsed.eventIds !== "object") {
      return { eventIds: {}, updatedAt: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { eventIds: {}, updatedAt: new Date().toISOString() };
  }
}

export async function getRecentlyUsedEventIds(
  withinDays = 21,
): Promise<Set<string>> {
  const history = await readHistory();
  const cutoff = Date.now() - withinDays * 86_400_000;
  const out = new Set<string>();
  for (const [id, iso] of Object.entries(history.eventIds)) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t >= cutoff) out.add(id);
  }
  return out;
}

export async function recordConceptEventIds(
  eventIds: string[],
  at = new Date(),
): Promise<void> {
  if (eventIds.length === 0) return;
  await mkdir(HISTORY_DIR, { recursive: true });
  const history = await readHistory();
  const iso = at.toISOString();
  for (const id of eventIds) {
    history.eventIds[id] = iso;
  }
  history.updatedAt = iso;
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");
}
