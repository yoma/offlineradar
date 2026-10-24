/**
 * Track which event editions already appeared in Instagram concepts.
 * Neon-backed (survives Vercel redeploys). File fallback only when SQL
 * is unavailable (local/offline). Not used for Meta publish.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEventsSql } from "@/lib/events/db";

const HISTORY_DIR = path.join(process.cwd(), ".data");
const HISTORY_FILE = path.join(HISTORY_DIR, "instagram-concept-history.json");

export type InstagramConceptHistory = {
  /** ISO timestamps of last concept inclusion per event id */
  eventIds: Record<string, string>;
  updatedAt: string;
};

function normalizeEventId(id: string): string | null {
  const trimmed = id.trim().slice(0, 120);
  return trimmed.length > 0 ? trimmed : null;
}

async function readFileHistory(): Promise<InstagramConceptHistory> {
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

async function writeFileHistory(history: InstagramConceptHistory): Promise<void> {
  await mkdir(HISTORY_DIR, { recursive: true });
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");
}

export async function getRecentlyUsedEventIds(
  withinDays = 21,
): Promise<Set<string>> {
  const sql = getEventsSql();
  const cutoff = new Date(Date.now() - withinDays * 86_400_000);

  if (sql) {
    try {
      const rows = (await sql`
        SELECT event_id
        FROM instagram_concept_history
        WHERE last_used_at >= ${cutoff.toISOString()}::timestamptz
      `) as { event_id: string }[];
      return new Set(rows.map((r) => r.event_id));
    } catch (error) {
      // Table may not exist yet before migration — fall through to file.
      console.warn(
        "[instagram/history] Neon read failed; using file fallback",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const history = await readFileHistory();
  const cutoffMs = cutoff.getTime();
  const out = new Set<string>();
  for (const [id, iso] of Object.entries(history.eventIds)) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t >= cutoffMs) out.add(id);
  }
  return out;
}

/**
 * Record approved concept event ids (upsert).
 * Idempotent: re-approving the same ids updates last_used_at only.
 */
export async function recordConceptEventIds(
  eventIds: string[],
  at = new Date(),
): Promise<{ stored: "neon" | "file"; count: number }> {
  const ids = [...new Set(eventIds.map(normalizeEventId).filter(Boolean))] as string[];
  if (ids.length === 0) return { stored: "neon", count: 0 };

  const sql = getEventsSql();
  const iso = at.toISOString();

  if (sql) {
    try {
      for (const id of ids) {
        await sql`
          INSERT INTO instagram_concept_history (event_id, last_used_at)
          VALUES (${id}, ${iso}::timestamptz)
          ON CONFLICT (event_id) DO UPDATE SET
            last_used_at = EXCLUDED.last_used_at
        `;
      }
      return { stored: "neon", count: ids.length };
    } catch (error) {
      console.warn(
        "[instagram/history] Neon write failed; using file fallback",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const history = await readFileHistory();
  for (const id of ids) {
    history.eventIds[id] = iso;
  }
  history.updatedAt = iso;
  await writeFileHistory(history);
  return { stored: "file", count: ids.length };
}
