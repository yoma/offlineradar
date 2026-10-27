/**
 * Start the reel renderer (GitHub workflow "Instagram reels") right away when
 * a reel is waiting, instead of waiting for its hourly schedule. GitHub runs
 * scheduled workflows late or skips them when it is busy (in October 2026
 * often 4 to 5 hours between runs), so a reel could sit on "Reel wordt
 * gemaakt" for hours. The schedule stays as the back-up for retries.
 *
 * Env (Vercel): GITHUB_REELS_TOKEN, a fine-grained token for this repository
 * with "Actions: read and write". Optional GITHUB_REELS_REPO (default
 * yoma/offlineradar). Without a token nothing happens and the schedule
 * remains the only trigger.
 */

const WORKFLOW = "instagram-reels.yml";
const TIMEOUT_MS = 5_000;

export async function kickReelRenderer(reason: string): Promise<boolean> {
  const token = process.env.GITHUB_REELS_TOKEN?.trim();
  if (!token) return false;
  const repo = process.env.GITHUB_REELS_REPO?.trim() || "yoma/offlineradar";
  try {
    // A run already queued or running picks this reel up too: the workflow's
    // concurrency group keeps one run going and at most one waiting.
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.warn(`[instagram/reel] renderer starten mislukt (${reason}): HTTP ${res.status}`);
      return false;
    }
    console.info(`[instagram/reel] renderer gestart (${reason})`);
    return true;
  } catch (error) {
    console.warn(
      `[instagram/reel] renderer starten mislukt (${reason}):`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
