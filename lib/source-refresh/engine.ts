/**
 * Orchestrates one source refresh run (manual admin or scheduled cron).
 * Never publishes or mutates canonical event facts (except optional source_checked_at
 * and thorough-mode safe draft/apply).
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
import { normalizeRefreshUrl, isListingOrIndexUrl, urlsReferToSameEvent, urlPathKey } from "@/lib/source-refresh/normalize";
import { safeFetchHtmlSource } from "@/lib/source-refresh/safe-fetch-html";
import {
  applyRefreshChangesToEdition,
  filterSafeAutoApplyChanges,
} from "@/lib/source-refresh/apply-change";
import { createDraftFromRefreshCandidate } from "@/lib/source-refresh/draft-from-candidate";
import {
  completeRefreshRun,
  createRefreshRun,
  getActiveRefreshRun,
  getLatestRefreshRun,
  insertRefreshItem,
  listFutureEditionsForOrganizerSlug,
  touchEditionSourceCheckedAt,
  updateRefreshItemStatus,
  type EventEditionBundleLite,
} from "@/lib/source-refresh/store";
import type {
  RefreshNormalizedCandidate,
  SourceRefreshReport,
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
      genderAvailability: row.genderAvailability ?? null,
      availabilityNote: row.availabilityNote ?? null,
    } as EventEditionRecord,
    sourceUrls: row.sourceUrls.map((u) => normalizeRefreshUrl(u)),
    organizerSlug: row.organizerSlug,
  }));
}

export type RefreshMode = "standard" | "thorough";

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
 * Shared refresh entrypoint for admin + scheduler + admin chat.
 * Dedicated parsers OR generic website/websearch follow.
 * Parsing/matching/diff is identical regardless of triggerType.
 */
export async function startSourceRefresh(input: {
  catalogSourceId: string;
  triggeredBy: string;
  triggerType?: SourceRefreshTriggerType;
  /** thorough: auto-draft safe news + auto-apply safe availability/price changes */
  mode?: RefreshMode;
  /** Skip cooldown (admin chat / explicit thorough rescans). */
  skipCooldown?: boolean;
}): Promise<StartRefreshResult> {
  const triggerType: SourceRefreshTriggerType = input.triggerType ?? "manual";
  const mode: RefreshMode = input.mode ?? "standard";
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
  const skipCooldown =
    input.skipCooldown === true ||
    mode === "thorough" ||
    process.env.SOURCE_REFRESH_SKIP_COOLDOWN === "1";
  if (
    !skipCooldown &&
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
      mode,
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

  const pagesVisited: SourceRefreshReport["pagesVisited"] = [];

  try {
    const fetched = await safeFetchHtmlSource(pilot.fetchUrl);
    pagesVisited.push({
      url: pilot.fetchUrl,
      ok: fetched.ok,
      httpStatus: fetched.ok ? fetched.httpStatus : fetched.httpStatus ?? null,
      error: fetched.ok ? null : fetched.error,
    });
    if (!fetched.ok) {
      const status = fetched.code === "blocked" ? "blocked" : "failed";
      const report: SourceRefreshReport = {
        completeness: "unknown",
        completenessNote: `Agenda ophalen mislukt: ${fetched.error}`,
        pagesVisited,
        uniqueDiscovered: 0,
        added: 0,
        updated: 0,
        unchanged: 0,
        excluded: 0,
        drafted: 0,
        applied: 0,
        skipped: [{ reason: "parse_failed", detail: fetched.error }],
        excludedReasons: {},
        mode,
      };
      const completed = await completeRefreshRun({
        id: run.id,
        status,
        fetchedUrl: pilot.fetchUrl,
        httpStatus: fetched.httpStatus ?? null,
        fetchState: fetched.code,
        error: fetched.error,
        report,
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
    const insertedItemIds: Array<{
      id: string;
      detectionType: string;
      editionId: string | null;
      candidate: RefreshNormalizedCandidate | null;
      changeSummary: import("@/lib/source-refresh/types").RefreshFieldChange[];
    }> = [];

    for (const candidate of parsed.candidates) {
      const match = matchCandidate(candidate, available, pilot.organizerSlug);

      if (match.confidence === "none" || !match.editionId) {
        const item = await insertRefreshItem({
          refreshRunId: run.id,
          catalogSourceId: input.catalogSourceId,
          candidate,
          detectionType: "new",
          matchConfidence: "none",
          status: "needs_review",
        });
        if (item) {
          insertedItemIds.push({
            id: item.id,
            detectionType: "new",
            editionId: null,
            candidate,
            changeSummary: [],
          });
        }
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
        if (match.confidence === "exact") {
          await touchEditionSourceCheckedAt(
            match.editionId,
            candidate.sourceCheckedAt,
          );
          // Always sync observed detail URL (all sources), not only thorough.
          await syncObservedSourceUrl({
            editionId: match.editionId,
            officialUrl: candidate.officialUrl,
            organizerName: pilot.organizerName,
            checkedAt: candidate.sourceCheckedAt,
          });
        }
        unchangedCount++;
      } else {
        const item = await insertRefreshItem({
          refreshRunId: run.id,
          catalogSourceId: input.catalogSourceId,
          candidate,
          detectionType: "existing_changed",
          matchEventEditionId: match.editionId,
          matchConfidence: match.confidence,
          changeSummary: match.changes,
          status: "needs_review",
        });
        if (item) {
          insertedItemIds.push({
            id: item.id,
            detectionType: "existing_changed",
            editionId: match.editionId,
            candidate,
            changeSummary: match.changes,
          });
        }
        if (match.confidence === "exact") {
          await syncObservedSourceUrl({
            editionId: match.editionId,
            officialUrl: candidate.officialUrl,
            organizerName: pilot.organizerName,
            checkedAt: candidate.sourceCheckedAt,
          });
        }
        changedCount++;
      }
    }

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
          return new URL(u).hostname
            .replace(/^www\./, "")
            .includes(fetchHost.split(".").slice(-2).join("."));
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

    let draftedCount = 0;
    let appliedCount = 0;
    const skipped = [...(parsed.skipped ?? [])] as SourceRefreshReport["skipped"];

    if (mode === "thorough") {
      const post = await applyThoroughPostProcess({
        items: insertedItemIds,
        pilot,
        triggeredBy: input.triggeredBy,
      });
      draftedCount = post.drafted;
      appliedCount = post.applied;
      skipped.push(...post.skipped);
    }

    const completeness: SourceRefreshReport["completeness"] =
      pagesVisited.every((p) => p.ok) && coverage === "complete"
        ? "complete"
        : coverage === "partial"
          ? "partial"
          : pagesVisited.some((p) => !p.ok)
            ? "unknown"
            : coverage === "complete"
              ? "complete"
              : "unknown";

    const report: SourceRefreshReport = {
      completeness,
      completenessNote:
        completeness === "complete"
          ? `Agenda volledig verwerkt (${parsed.candidates.length} unieke evenementen, ${pagesVisited.length} pagina).`
          : completeness === "partial"
            ? "Listing is partieel; mogelijk ontbreken pagina’s of maanden."
            : "Volledigheid niet zeker: paginafout of onbekende listingCoverage.",
      pagesVisited,
      uniqueDiscovered: parsed.candidates.length,
      added: newCount,
      updated: changedCount,
      unchanged: unchangedCount,
      excluded: removedCount + skipped.length,
      drafted: draftedCount,
      applied: appliedCount,
      skipped,
      excludedReasons: tallyReasons(skipped),
      mode,
    };

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
      skippedCount: skipped.length,
      draftedCount,
      appliedCount,
      error:
        parsed.warnings.length > 0
          ? parsed.warnings.slice(0, 3).join("; ")
          : null,
      report,
    });

    return { ok: true, run: completed ?? run };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende refresh-fout";
    const report: SourceRefreshReport = {
      completeness: "unknown",
      completenessNote: message,
      pagesVisited,
      uniqueDiscovered: 0,
      added: 0,
      updated: 0,
      unchanged: 0,
      excluded: 0,
      drafted: 0,
      applied: 0,
      skipped: [{ reason: "parse_failed", detail: message }],
      excludedReasons: { parse_failed: 1 },
      mode,
    };
    const completed = await completeRefreshRun({
      id: run.id,
      status: "failed",
      fetchState: "exception",
      error: message,
      report,
    });
    return { ok: false, code: "failed", error: message, run: completed ?? run };
  }
}

function tallyReasons(
  skipped: Array<{ reason: string }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of skipped) {
    out[s.reason] = (out[s.reason] ?? 0) + 1;
  }
  return out;
}

async function syncObservedSourceUrl(input: {
  editionId: string;
  officialUrl: string;
  organizerName: string;
  checkedAt: string;
}): Promise<void> {
  const { getEventsSql } = await import("@/lib/events/db");
  const sql = getEventsSql();
  if (!sql) return;
  // Never promote a shared listing/agenda URL as the event identity.
  if (isListingOrIndexUrl(input.officialUrl)) return;
  const norm = normalizeRefreshUrl(input.officialUrl);
  const existing = (await sql`
    SELECT id, url, is_primary FROM event_sources
    WHERE event_edition_id = ${input.editionId}
  `) as Array<{ id: string; url: string; is_primary: boolean }>;
  if (existing.some((s) => normalizeRefreshUrl(s.url) === norm)) return;

  const { attachSource } = await import("@/lib/events/neon-store");
  await attachSource({
    eventEditionId: input.editionId,
    sourceType: "organizer",
    sourceName: input.organizerName,
    url: input.officialUrl,
    normalizedUrl: norm,
    isPrimary: existing.length === 0,
    checkedAt: input.checkedAt,
    evidenceNote: "source refresh: observed detail URL",
  });

  // Demote listing/index primary when we now have a concrete detail URL.
  const listingPrimary = existing.find(
    (s) => s.is_primary && isListingOrIndexUrl(s.url),
  );
  if (listingPrimary) {
    await sql`
      UPDATE event_sources SET is_primary = false
      WHERE id = ${listingPrimary.id}
    `;
    await sql`
      UPDATE event_sources SET is_primary = true
      WHERE event_edition_id = ${input.editionId}
        AND normalized_url = ${norm}
    `;
  }
}

async function urlAlreadyInCatalog(officialUrl: string): Promise<boolean> {
  const { getEventsSql } = await import("@/lib/events/db");
  const sql = getEventsSql();
  if (!sql) return false;
  const norm = normalizeRefreshUrl(officialUrl);
  const pathKey = urlPathKey(officialUrl);

  const exact = (await sql`
    SELECT 1 FROM event_sources
    WHERE normalized_url = ${norm}
       OR lower(trim(trailing '/' from url)) = ${norm}
    LIMIT 1
  `) as unknown[];
  if (exact.length > 0) return true;

  // Sister-domain / alternate-host pages with the same path key.
  if (!pathKey) return false;
  const rows = (await sql`
    SELECT url FROM event_sources
    WHERE url ILIKE ${`%/${pathKey}%`}
    LIMIT 20
  `) as Array<{ url: string }>;
  return rows.some((r) => urlsReferToSameEvent(officialUrl, r.url));
}

async function applyThoroughPostProcess(input: {
  items: Array<{
    id: string;
    detectionType: string;
    editionId: string | null;
    candidate: RefreshNormalizedCandidate | null;
    changeSummary: import("@/lib/source-refresh/types").RefreshFieldChange[];
  }>;
  pilot: {
    organizerSlug: string;
    organizerName: string;
    fetchUrl: string;
  };
  triggeredBy: string;
}): Promise<{
  drafted: number;
  applied: number;
  skipped: SourceRefreshReport["skipped"];
}> {
  let drafted = 0;
  let applied = 0;
  const skipped: SourceRefreshReport["skipped"] = [];

  for (const row of input.items) {
    if (row.detectionType === "new" && row.candidate) {
      if (await urlAlreadyInCatalog(row.candidate.officialUrl)) {
        await updateRefreshItemStatus({
          id: row.id,
          status: "ignored",
          reviewedBy: input.triggeredBy,
        });
        skipped.push({
          reason: "duplicate_in_listing",
          detail: `Al in catalogus: ${row.candidate.officialUrl}`,
          evidence: row.candidate.title,
        });
        continue;
      }
      try {
        const edition = await createDraftFromRefreshCandidate({
          candidate: row.candidate,
          organizerSlug: input.pilot.organizerSlug,
          organizerName: input.pilot.organizerName,
          organizerWebsite: input.pilot.fetchUrl,
        });
        if (!edition) {
          skipped.push({
            reason: "save_failed",
            detail: `Draft mislukt: ${row.candidate.title}`,
          });
          continue;
        }
        await updateRefreshItemStatus({
          id: row.id,
          status: "accepted",
          reviewedBy: input.triggeredBy,
        });
        drafted++;
      } catch (err) {
        skipped.push({
          reason: "save_failed",
          detail:
            err instanceof Error
              ? err.message
              : `Draft mislukt: ${row.candidate.title}`,
        });
      }
      continue;
    }

    if (
      row.detectionType === "existing_changed" &&
      row.editionId &&
      row.candidate
    ) {
      await syncObservedSourceUrl({
        editionId: row.editionId,
        officialUrl: row.candidate.officialUrl,
        organizerName: input.pilot.organizerName,
        checkedAt: row.candidate.sourceCheckedAt,
      });
      const changes = filterSafeAutoApplyChanges(row.changeSummary);
      if (changes.length === 0) {
        // Keep needs_review for non-safe structural changes.
        continue;
      }
      try {
        const updated = await applyRefreshChangesToEdition({
          editionId: row.editionId,
          changes,
        });
        if (!updated) {
          skipped.push({
            reason: "save_failed",
            detail: `Apply mislukt: ${row.candidate.title}`,
          });
          continue;
        }
        await updateRefreshItemStatus({
          id: row.id,
          status: "applied",
          reviewedBy: input.triggeredBy,
        });
        applied++;
      } catch (err) {
        skipped.push({
          reason: "save_failed",
          detail:
            err instanceof Error
              ? err.message
              : `Apply mislukt: ${row.candidate.title}`,
        });
      }
    }
  }

  return { drafted, applied, skipped };
}

async function startGenericSourceRefresh(input: {
  catalogSourceId: string;
  catalogSource: { id: string; name: string; officialUrl: string };
  capability: {
    methods: import("@/lib/aanvoer/follow-capability").FollowMethod[];
  };
  triggeredBy: string;
  triggerType: SourceRefreshTriggerType;
  mode: RefreshMode;
}): Promise<StartRefreshResult> {
  const parserKey =
    input.capability.methods.includes("website") ||
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

    const report: SourceRefreshReport = {
      completeness: result.candidates.length > 0 ? "partial" : "unknown",
      completenessNote: `Generic follow via ${result.methodUsed}. Volledigheid niet gegarandeerd.`,
      pagesVisited: [
        {
          url: result.fetchedUrl ?? input.catalogSource.officialUrl,
          ok: true,
          httpStatus: result.httpStatus,
        },
      ],
      uniqueDiscovered: result.candidates.length,
      added: newCount,
      updated: 0,
      unchanged: 0,
      excluded: 0,
      drafted: 0,
      applied: 0,
      skipped: (result.warnings ?? []).map((w) => ({
        reason: "parse_failed",
        detail: w,
      })),
      excludedReasons: {},
      mode: input.mode,
    };

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
      report,
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
