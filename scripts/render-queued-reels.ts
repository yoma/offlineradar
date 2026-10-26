/**
 * Render the reels waiting in the Instagram queue and upload them to the site.
 * Runs in GitHub Actions (.github/workflows/instagram-reels.yml); can also run
 * locally against production or a preview deploy.
 *
 * Env:
 *   REEL_SITE_URL   site to talk to (default https://dateofflinehub.be)
 *   CRON_SECRET     same secret as the Vercel crons
 *   REMOTION_BROWSER_EXECUTABLE  optional local Chrome headless shell
 *
 * Exit code 1 when a render or upload failed, so the workflow run turns red
 * and GitHub sends its failure mail.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readInstagramReelConfig } from "@/lib/instagram/reel/config";
import { pickReelMusic } from "@/lib/instagram/reel/music";
import { bundleReelTemplate, renderReel } from "@/lib/instagram/reel/render";
import type { ReelProps } from "@/lib/instagram/reel/types";

const SITE = (process.env.REEL_SITE_URL?.trim() || "https://dateofflinehub.be").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET?.trim() ?? "";
/** Reels per claim, and the most one run will render. */
const CLAIM_SIZE = 3;
const MAX_PER_RUN = 12;
const RENDER_TRIES = 2;

type Job = { id: string; scheduledAt: string; props: ReelProps };

function log(message: string) {
  console.info(`[reels] ${new Date().toISOString()} ${message}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retries on network errors and 5xx (2s, 4s, 8s). */
async function api(pathname: string, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2_000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(`${SITE}${pathname}`, {
        ...init,
        headers: { Authorization: `Bearer ${SECRET}`, ...init.headers },
      });
      if (res.status < 500) return res;
      lastError = new Error(`${pathname}: HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function json<T>(res: Response, what: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (!res.ok || !body || body.ok === false) {
    throw new Error(`${what}: HTTP ${res.status} ${body?.error ?? ""}`.trim());
  }
  return body;
}

async function upload(id: string, kind: "reel" | "reel_cover" | "reel_story", file: string) {
  const bytes = await readFile(file);
  const res = await api(`/api/instagram/reels/${id}/media?kind=${kind}`, {
    method: "PUT",
    headers: { "Content-Type": kind === "reel" ? "video/mp4" : "image/jpeg" },
    body: bytes,
  });
  await json(res, `upload ${kind}`);
}

async function report(id: string, body: { ok: boolean; track?: string | null; message?: string }) {
  const res = await api(`/api/instagram/reels/${id}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<{ status: string | null }>(res, "result");
}

async function main() {
  if (!SECRET) throw new Error("CRON_SECRET ontbreekt.");

  const { pending } = await json<{ pending: number }>(
    await api("/api/instagram/reels/jobs"),
    "pending",
  );
  log(`${pending} reel(s) te maken op ${SITE}`);
  if (pending === 0) return;

  const config = readInstagramReelConfig();
  const workDir = await mkdtemp(path.join(tmpdir(), "reels-"));
  log("Remotion-bundel maken...");
  const serveUrl = await bundleReelTemplate();
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

  let done = 0;
  let failures = 0;
  while (done < MAX_PER_RUN) {
    const claim = await json<{ jobs: Job[]; lastTrack: string | null }>(
      await api("/api/instagram/reels/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: CLAIM_SIZE }),
      }),
      "claim",
    );
    if (claim.jobs.length === 0) break;
    let lastTrack = claim.lastTrack;

    for (const job of claim.jobs) {
      done++;
      const music = await pickReelMusic(config, lastTrack);
      const props: ReelProps = { ...job.props, music };
      const started = Date.now();
      let error: unknown = null;
      for (let attempt = 1; attempt <= RENDER_TRIES; attempt++) {
        try {
          const reel = await renderReel({
            serveUrl,
            props,
            outBase: path.join(workDir, job.id),
            browserExecutable,
          });
          await upload(job.id, "reel", reel.videoPath);
          await upload(job.id, "reel_cover", reel.coverPath);
          await upload(job.id, "reel_story", reel.storyPath);
          await report(job.id, { ok: true, track: music?.src ?? null });
          lastTrack = music?.src ?? lastTrack;
          log(
            `${job.id}: klaar, "${props.hookText}", ${reel.seconds.toFixed(1)} s, ` +
              `${(reel.bytes / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`,
          );
          error = null;
          break;
        } catch (e) {
          error = e;
          log(`${job.id}: poging ${attempt} mislukt: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (error) {
        failures++;
        const message = error instanceof Error ? error.message : String(error);
        const result = await report(job.id, { ok: false, message: message.slice(0, 500) }).catch(
          () => null,
        );
        log(`${job.id}: render mislukt (${result?.status ?? "status onbekend"}): ${message}`);
      }
    }
  }

  log(`${done} reel(s) verwerkt, ${failures} mislukt`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[reels] mislukt:", error instanceof Error ? error.message : error);
  process.exit(1);
});
