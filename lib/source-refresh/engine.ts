/**
 * Orchestrates one admin-triggered source refresh run.
 * Never publishes or mutates canonical event facts (except optional source_checked_at).
 */
import {
  SOURCE_REFRESH_COOLDOWN_MS,
  SOURCE_REFRESH_PARSER_VERSION,
  getRefreshPilot,
} from "@/lib/source-refresh/registry";
import {
  matchCandidate,
  type MatchableEdition,
} from "@/lib/source-refresh/match";
import { runRefreshParser } from "@/lib/source-refresh/parsers";
import { normalizeRefreshUrl } from "@/lib/source-refresh/normalize";
import { safeFetchHtmlSource } from "@/lib/source-refresh/safe-fetch-html";
import {
  completeRefreshRun,
  createRefreshRun,
  getActiveRefreshRun,
  getLatestRefreshRun,
  insertRefreshItem,
  listFutureEditionsForOrganizerSlug,
  touchEditionSourceCheckedAt,
  type EventEditionBundleLite,
} from "@/lib/source-refresh/store";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";
import type { EventEditionRecord } from "@/types/event-catalog";
import type { CapacityStatus } from "@/types/event";

function liteToMatchable(rows: EventEditionBundleLite[]): MatchableEdition[] {
  return rows.map((row) => ({
    edition: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      startsAt: row.startsAt,
      city: row.city,
      minAge: row.minAge,
      maxAge: row.maxAge,
      priceAmount: row.priceAmount,
      availabilityStatus: row.availabilityStatus as CapacityStatus | null,
      venueName: row.venueName,
      // unused fields for diff — cast minimal
    } as EventEditionRecord,
    sourceUrls: row.sourceUrls.map((u) => normalizeRefreshUrl(u)),
    organizerSlug: row.organizerSlug,
  }));
}

export type StartRefreshResult =
  | { ok: true; run: SourceRefreshRunRecord }
  | {
      ok: false;
      code:
        | "unauthorized_shape"
        | "unsupported"
        | "active_run"
        | "cooldown"
        | "failed";
      error: string;
      run?: SourceRefreshRunRecord | null;
    };

export async function startSourceRefresh(input: {
  catalogSourceId: string;
  triggeredBy: string;
}): Promise<StartRefreshResult> {
  const pilot = getRefreshPilot(input.catalogSourceId);
  if (!pilot) {
    return {
      ok: false,
      code: "unsupported",
      error: "Deze bron heeft nog geen refresh-parser in V1.",
    };
  }

  const active = await getActiveRefreshRun(input.catalogSourceId);
  if (active) {
    return {
      ok: false,
      code: "active_run",
      error: "Er loopt al een refresh voor deze bron.",
      run: active,
    };
  }

  const latest = await getLatestRefreshRun(input.catalogSourceId);
  if (
    process.env.SOURCE_REFRESH_SKIP_COOLDOWN !== "1" &&
    latest?.status === "completed" &&
    latest.completedAt
  ) {
    const age = Date.now() - new Date(latest.completedAt).getTime();
    if (age >= 0 && age < SOURCE_REFRESH_COOLDOWN_MS) {
      return {
        ok: false,
        code: "cooldown",
        error: `Cooldown bron is recent gecontroleerd. Wacht nog ${Math.ceil((SOURCE_REFRESH_COOLDOWN_MS - age) / 60000)} min.`,
        run: latest,
      };
    }
  }

  const run = await createRefreshRun({
    catalogSourceId: input.catalogSourceId,
    parserKey: pilot.parserKey,
    parserVersion: SOURCE_REFRESH_PARSER_VERSION,
    triggeredBy: input.triggeredBy,
  });
  if (!run) {
    return { ok: false, code: "failed", error: "Kon refresh-run niet starten." };
  }

  try {
    const fetched = await safeFetchHtmlSource(pilot.fetchUrl);
    if (!fetched.ok) {
      const status =
        fetched.code === "blocked" ? "blocked" : "failed";
      const completed = await completeRefreshRun({
        id: run.id,
        status,
        fetchedUrl: pilot.fetchUrl,
        httpStatus: fetched.httpStatus ?? null,
        fetchState: fetched.code,
        error: fetched.error,
      });
      return {
        ok: false,
        code: "failed",
        error: fetched.error,
        run: completed ?? run,
      };
    }

    const parsed = runRefreshParser(pilot.parserKey, fetched.html);
    const future = await listFutureEditionsForOrganizerSlug(pilot.organizerSlug);
    const matchable = liteToMatchable(future);

    let newCount = 0;
    let unchangedCount = 0;
    let changedCount = 0;
    let removedCount = 0;
    const matchedEditionIds = new Set<string>();

    for (const candidate of parsed.candidates) {
      const match = matchCandidate(
        candidate,
        matchable,
        pilot.organizerSlug,
      );

      if (match.confidence === "none" || !match.editionId) {
        await insertRefreshItem({
          refreshRunId: run.id,
          catalogSourceId: input.catalogSourceId,
          candidate,
          detectionType: "new",
          matchConfidence: "none",
          status: "needs_review",
        });
        newCount++;
        continue;
      }

      matchedEditionIds.add(match.editionId);
      if (match.changes.length === 0) {
        await insertRefreshItem({
          refreshRunId: run.id,
          catalogSourceId: input.catalogSourceId,
          candidate,
          detectionType: "existing_unchanged",
          matchEventEditionId: match.editionId,
          matchConfidence: match.confidence,
          changeSummary: [],
          status: "ignored",
        });
        // Freshness-only update when match is exact/safe.
        if (match.confidence === "exact") {
          await touchEditionSourceCheckedAt(
            match.editionId,
            candidate.sourceCheckedAt,
          );
        }
        unchangedCount++;
      } else {
        await insertRefreshItem({
          refreshRunId: run.id,
          catalogSourceId: input.catalogSourceId,
          candidate,
          detectionType: "existing_changed",
          matchEventEditionId: match.editionId,
          matchConfidence: match.confidence,
          changeSummary: match.changes,
          status: "needs_review",
        });
        changedCount++;
      }
    }

    for (const edition of future) {
      if (matchedEditionIds.has(edition.id)) continue;
      if (
        !["published", "under_review", "draft", "approved"].includes(
          edition.publicationStatus,
        )
      ) {
        continue;
      }
      const fetchHost = new URL(pilot.fetchUrl).hostname.replace(/^www\./, "");
      const tiedToAgenda = edition.sourceUrls.some((u) => {
        try {
          return new URL(u).hostname.replace(/^www\./, "").includes(fetchHost.split(".").slice(-2).join("."));
        } catch {
          return u.includes(fetchHost);
        }
      });
      if (!tiedToAgenda) continue;
      await insertRefreshItem({
        refreshRunId: run.id,
        catalogSourceId: input.catalogSourceId,
        detectionType: "possibly_removed",
        matchEventEditionId: edition.id,
        matchConfidence: "probable",
        status: "needs_review",
        removedEditionTitle: edition.title,
        removedEditionStart: edition.startsAt,
        removedExternalKey: `removed:${edition.id}`,
      });
      removedCount++;
    }

    const completed = await completeRefreshRun({
      id: run.id,
      status: "completed",
      fetchedUrl: fetched.finalUrl,
      httpStatus: fetched.httpStatus,
      fetchState: "ok",
      candidateCount: parsed.candidates.length,
      newCount,
      unchangedCount,
      changedCount,
      removedCount,
      error:
        parsed.warnings.length > 0 ? parsed.warnings.slice(0, 3).join("; ") : null,
    });

    return { ok: true, run: completed ?? run };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende refresh-fout";
    const completed = await completeRefreshRun({
      id: run.id,
      status: "failed",
      fetchState: "exception",
      error: message,
    });
    return { ok: false, code: "failed", error: message, run: completed ?? run };
  }
}
