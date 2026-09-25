import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isTipsLocalStoreEnabled } from "@/lib/tips/config";
import type {
  SourceWatchEntry,
  TipReview,
  TipSubmission,
  TipsStoreSnapshot,
} from "@/types/tips";

const EMPTY: TipsStoreSnapshot = {
  version: 1,
  tips: [],
  reviews: [],
  sources: [],
};

function storePath(): string {
  // Always under ./.data so bundlers can scope tracing; custom absolute
  // overrides are only for local verify scripts.
  const custom = process.env.OFFLINERADAR_TIPS_LOCAL_PATH?.trim();
  if (custom && process.env.NODE_ENV !== "production") {
    return path.resolve(custom);
  }
  return path.join(process.cwd(), ".data", "tips-store.json");
}

export type TipsStore = {
  mode: "local_file";
  read(): Promise<TipsStoreSnapshot>;
  write(next: TipsStoreSnapshot): Promise<void>;
};

async function readLocal(): Promise<TipsStoreSnapshot> {
  const file = storePath();
  try {
    const raw = await readFile(/* turbopackIgnore: true */ file, "utf8");
    const parsed = JSON.parse(raw) as TipsStoreSnapshot;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tips)) {
      throw new Error("ongeldig tips-store formaat");
    }
    return {
      version: 1,
      tips: parsed.tips,
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return structuredClone(EMPTY);
    throw error;
  }
}

async function writeLocal(next: TipsStoreSnapshot): Promise<void> {
  const file = storePath();
  await mkdir(/* turbopackIgnore: true */ path.dirname(file), {
    recursive: true,
  });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(next, null, 2), "utf8");
  await rename(/* turbopackIgnore: true */ tmp, /* turbopackIgnore: true */ file);
}

/**
 * Returns a durable local-file store when explicitly enabled.
 * Never invents an in-memory “success” path for public use.
 * Local file store is for shielded development only.
 */
export function getTipsStore(): TipsStore | null {
  if (!isTipsLocalStoreEnabled()) return null;
  if (process.env.NODE_ENV === "production") {
    // Refuse file-backed tips in production builds; needs a managed DB.
    return null;
  }
  return {
    mode: "local_file",
    read: readLocal,
    write: writeLocal,
  };
}

export function emptyTipsStore(): TipsStoreSnapshot {
  return structuredClone(EMPTY);
}

export function findTip(
  store: TipsStoreSnapshot,
  id: string,
): TipSubmission | undefined {
  return store.tips.find((tip) => tip.id === id);
}

export function findReview(
  store: TipsStoreSnapshot,
  tipId: string,
): TipReview | undefined {
  return store.reviews.find((review) => review.tipId === tipId);
}

export function findSource(
  store: TipsStoreSnapshot,
  id: string,
): SourceWatchEntry | undefined {
  return store.sources.find((source) => source.id === id);
}

export function localStorePathForDisplay(): string {
  return storePath();
}
