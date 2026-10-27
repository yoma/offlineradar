/**
 * Render the reels waiting in the Instagram queue and upload them to the site.
 * Runs in GitHub Actions (.github/workflows/instagram-reels.yml); can also run
 * locally against production or a preview deploy.
 *
 * Promo reels (docs/instagram-promo-reels.md) are planned here first when
 * they need a new version: Claude writes the text and picks stock clips, the
 * plan goes to the site, then the render.
 *
 * Env:
 *   REEL_SITE_URL   site to talk to (default https://dateofflinehub.be)
 *   CRON_SECRET     same secret as the Vercel crons
 *   ANTHROPIC_API_KEY, PIXABAY_API_KEY (PEXELS_API_KEY optional)  promo reels
 *   REMOTION_BROWSER_EXECUTABLE  optional local Chrome headless shell
 *
 * Exit code 1 when a render or upload failed, so the workflow run turns red
 * and GitHub sends its failure mail.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { replanPromoReel, type PromoHistory } from "@/lib/instagram/promo/generate";
import { pickPromoMusic } from "@/lib/instagram/promo/music";
import { renderPromoReel } from "@/lib/instagram/promo/render";
import type { PromoPlanRecord, PromoRedo, PromoReelProps } from "@/lib/instagram/promo/types";
import { readInstagramReelConfig } from "@/lib/instagram/reel/config";
import { pickReelMusic } from "@/lib/instagram/reel/music";
import { bundleReelTemplate, renderReel, type RenderedReel } from "@/lib/instagram/reel/render";
import type { ReelMusic, ReelProps } from "@/lib/instagram/reel/types";

const SITE = (process.env.REEL_SITE_URL?.trim() || "https://dateofflinehub.be").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET?.trim() ?? "";
/** Reels per claim, and the most one run will render. */
const CLAIM_SIZE = 3;
const MAX_PER_RUN = 12;
const RENDER_TRIES = 2;

type Job =
  | { kind: "reel"; id: string; scheduledAt: string; props: ReelProps }
  | {
      kind: "promo";
      id: string;
      scheduledAt: string;
      props: PromoReelProps | null;
      plan: PromoPlanRecord | null;
      redo: PromoRedo | null;
      /** Only sent when a new plan is needed. */
      history?: PromoHistory;
      eventCount?: number | null;
    };

/** What one job renders: props with music, and how. */
type Prepared = {
  label: string;
  track: string | null;
  render: (outBase: string) => Promise<RenderedReel>;
};

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

/** A promo job that needs a new version: plan it and store the plan first. */
async function preparePromo(
  job: Extract<Job, { kind: "promo" }>,
  music: ReelMusic,
  ctx: { serveUrl: string; browserExecutable: string | null },
): Promise<Prepared> {
  let props = job.props;
  if (job.redo || !props) {
    if (!job.history) throw new Error("Geen promo-geschiedenis ontvangen.");
    const { plan, record } = await replanPromoReel({
      redo: job.redo ?? "alles",
      previous: job.plan,
      history: job.history,
      eventCount: job.eventCount ?? null,
      music,
      log: (m) => log(`${job.id}: ${m}`),
    });
    await json(
      await api(`/api/instagram/reels/${job.id}/promo-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: record, props: plan.props, caption: plan.caption }),
      }),
      "promo-plan",
    );
    props = plan.props;
  }
  const withMusic: PromoReelProps = { ...props, music };
  return {
    label: `promo "${withMusic.hook}"`,
    track: music?.src ?? null,
    render: (outBase) => renderPromoReel({ ...ctx, props: withMusic, outBase }),
  };
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
    const claim = await json<{ jobs: Job[]; lastTrack: string | null; lastPromoTrack?: string | null }>(
      await api("/api/instagram/reels/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: CLAIM_SIZE }),
      }),
      "claim",
    );
    if (claim.jobs.length === 0) break;
    let lastTrack = claim.lastTrack;
    let lastPromoTrack = claim.lastPromoTrack ?? null;

    for (const job of claim.jobs) {
      done++;
      const started = Date.now();
      let error: unknown = null;
      let prepared: Prepared | null = null;
      try {
        if (job.kind === "promo") {
          const music = await pickPromoMusic(lastPromoTrack);
          prepared = await preparePromo(job, music, { serveUrl, browserExecutable });
          lastPromoTrack = prepared.track ?? lastPromoTrack;
        } else {
          const music = await pickReelMusic(config, lastTrack);
          const props: ReelProps = { ...job.props, music };
          prepared = {
            label: `"${props.hookText}"`,
            track: music?.src ?? null,
            render: (outBase) => renderReel({ serveUrl, props, outBase, browserExecutable }),
          };
          lastTrack = prepared.track ?? lastTrack;
        }
      } catch (e) {
        // Planning (Claude, stock search) is not retried here: the next
        // hourly run tries again, up to the attempt limit.
        error = e;
        log(`${job.id}: plan mislukt: ${e instanceof Error ? e.message : e}`);
      }
      for (let attempt = 1; prepared && attempt <= RENDER_TRIES; attempt++) {
        try {
          const reel = await prepared.render(path.join(workDir, job.id));
          await upload(job.id, "reel", reel.videoPath);
          await upload(job.id, "reel_cover", reel.coverPath);
          await upload(job.id, "reel_story", reel.storyPath);
          await report(job.id, { ok: true, track: prepared.track });
          log(
            `${job.id}: klaar, ${prepared.label}, ${reel.seconds.toFixed(1)} s, ` +
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
