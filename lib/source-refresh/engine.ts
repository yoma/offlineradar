/**
 * Orchestrates one source refresh run (manual admin or scheduled cron).
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
import type {
  SourceRefreshRunRecord,
  SourceRefreshTriggerType,
} from "@/lib/source-refresh/types";
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

/**
 * Shared refresh entrypoint for admin + scheduler.
 * Dedicated parsers OR generic website/websearch follow.
 * Parsing/matching/diff is identical regardless of triggerType.
 */
export async function startSourceRefresh(input: {
  catalogSourceId: string;
  triggeredBy: string;
  triggerType?: SourceRefreshTriggerType;
}): Promise<StartRefreshResult> {
  const triggerType: SourceRefreshTriggerType = input.triggerType ?? "manual";
  const pilot = getRefreshPilot(input.catalogSourceId);

  const { listCatalogSources } = await import("@/lib/events/catalog-sources");
  const { getSourceFollowCapability } = await import(
    "@/lib/aanvoer/source-follow"
  );
  const allSources = await listCatalogSources();
  const catalogSource = allSources.find((s) => s.id === input.catalogSourceId);
  if (!catalogSource) {
    return {
      ok: false,
      code: "unsupported",
      error: "Catalogusbron niet gevonden.",
    };
  }

  const capability = getSourceFollowCapability({
    catalogSourceId: catalogSource.id,
    officialUrl: catalogSource.officialUrl,
    name: catalogSource.name,
  });

  // Human pause/disable always wins over scheduler / discovery / AI.
  if (triggerType === "scheduled") {
    const {
      FOLLOW_PAUSED_TAG,
      FOLLOW_DISABLED_TAG,
      FOLLOW_ARCHIVED_TAG,
      notesHasTag,
    } = await import("@/lib/aanvoer/source-follow");
    if (
      notesHasTag(catalogSource.notes, FOLLOW_PAUSED_TAG) ||
      notesHasTag(catalogSource.notes, FOLLOW_DISABLED_TAG) ||
      notesHasTag(catalogSource.notes, FOLLOW_ARCHIVED_TAG) ||
      catalogSource.status === "inactive"
    ) {
      return {
        ok: false,
        code: "unsupported",
        error: "Bron is gepauzeerd of uitgeschakeld door admin.",
      };
    }
  }

  if (!pilot && !capability.autoFollowable) {
    return {
      ok: false,
      code: "unsupported",
      error:
        capability.manualReason ??
        "Automatische opvolging momenteel niet mogelijk voor deze bron.",
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
        error: `Deze bron is recent gecontroleerd. Wacht nog ${Math.ceil((SOURCE_REFRESH_COOLDOWN_MS - age) / 60000)} min.`,
        run: latest,
      };
    }
  }

  if (!pilot) {
    return startGenericSourceRefresh({
      catalogSourceId: input.catalogSourceId,
      catalogSource,
      capability,
      triggeredBy: input.triggeredBy,
      triggerType,
    });
  }

  const run = await createRefreshRun({
    catalogSourceId: input.catalogSourceId,
    parserKey: pilot.parserKey,
    parserVersion: SOURCE_REFRESH_PARSER_VERSION,
    triggeredBy: input.triggeredBy,
    triggerType,
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
    const coverage = parsed.listingCoverage ?? "unknown";
    const observedDays = parsed.candidates
      .map((c) => c.date)
      .filter(Boolean)
      .sort();
    const windowMin = observedDays[0] ?? null;
    const windowMax = observedDays[observedDays.length - 1] ?? null;

    let newCount = 0;
    let unchangedCount = 0;
    let changedCount = 0;
    let removedCount = 0;
    const matchedEditionIds = new Set<string>();
    let available = matchable;

    for (const candidate of parsed.candidates) {
      const match = matchCandidate(
        candidate,
        available,
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
      available = available.filter((row) => row.edition.id !== match.editionId);
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

    // possibly_removed only when listing is believed complete AND edition
    // falls inside the observed calendar window (not expired / not out of range).
    const allowRemovals = coverage === "complete" && windowMin && windowMax;

    for (const edition of future) {
      if (!allowRemovals) break;
      if (matchedEditionIds.has(edition.id)) continue;
      if (
        !["published", "under_review", "draft", "approved"].includes(
          edition.publicationStatus,
        )
      ) {
        continue;
      }
      const editionDay = edition.startsAt.slice(0, 10);
      if (editionDay < windowMin! || editionDay > windowMax!) {
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

    if (coverage !== "complete" && future.length > matchedEditionIds.size) {
      parsed.warnings.push(
        `possibly_removed overgeslagen (listingCoverage=${coverage})`,
      );
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

async function startGenericSourceRefresh(input: {
  catalogSourceId: string;
  catalogSource: { id: string; name: string; officialUrl: string };
  capability: {
    methods: import("@/lib/aanvoer/follow-capability").FollowMethod[];
  };
  triggeredBy: string;
  triggerType: SourceRefreshTriggerType;
}): Promise<StartRefreshResult> {
  const parserKey = input.capability.methods.includes("website") ||
    input.capability.methods.includes("agenda")
    ? "generic-website"
    : "websearch";

  const run = await createRefreshRun({
    catalogSourceId: input.catalogSourceId,
    parserKey,
    parserVersion: SOURCE_REFRESH_PARSER_VERSION,
    triggeredBy: input.triggeredBy,
    triggerType: input.triggerType,
  });
  if (!run) {
    return { ok: false, code: "failed", error: "Kon refresh-run niet starten." };
  }

  try {
    const { runGenericSourceFollow } = await import(
      "@/lib/source-refresh/generic-follow"
    );
    const result = await runGenericSourceFollow({
      sourceName: input.catalogSource.name,
      officialUrl: input.catalogSource.officialUrl,
      methods: input.capability.methods,
    });

    let newCount = 0;
    for (const candidate of result.candidates) {
      await insertRefreshItem({
        refreshRunId: run.id,
        catalogSourceId: input.catalogSourceId,
        candidate,
        detectionType: "new",
        matchConfidence: "none",
        status: "needs_review",
      });
      newCount++;
    }

    const completed = await completeRefreshRun({
      id: run.id,
      status: "completed",
      fetchedUrl: result.fetchedUrl,
      httpStatus: result.httpStatus,
      fetchState: "ok",
      candidateCount: result.candidates.length,
      newCount,
      unchangedCount: 0,
      changedCount: 0,
      removedCount: 0,
      error:
        result.warnings.length > 0
          ? `${result.methodUsed}: ${result.warnings.slice(0, 3).join("; ")}`
          : `method=${result.methodUsed}`,
    });

    return { ok: true, run: completed ?? run };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende generic refresh-fout";
    const completed = await completeRefreshRun({
      id: run.id,
      status: "failed",
      fetchState: "exception",
      error: message,
    });
    return { ok: false, code: "failed", error: message, run: completed ?? run };
  }
}
