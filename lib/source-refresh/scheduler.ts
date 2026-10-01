/**
 * Scheduled source refresh: due auto-follow sources (dedicated parsers +
 * generic website/agenda/websearch), bounded batch, human pause/disable wins.
 * Never auto-publishes / auto-applies / auto-unpublishes.
 */
import { startSourceRefresh } from "@/lib/source-refresh/engine";
import {
  DEFAULT_REFRESH_INTERVAL_HOURS,
  SCHEDULED_REFRESH_BATCH_SIZE,
  SCHEDULED_REFRESH_CONCURRENCY,
  isScheduledRefreshGloballyEnabled,
} from "@/lib/source-refresh/schedule-config";
import {
  REFRESH_PILOTS,
  getRefreshPilot,
} from "@/lib/source-refresh/registry";
import {
  getSourceScheduleStates,
  listAutoFollowEnabledSourceIds,
  markSourceScheduledRefresh,
  type SourceScheduleState,
} from "@/lib/source-refresh/store";
import type {
  RefreshParserKey,
  SourceRefreshRunRecord,
} from "@/lib/source-refresh/types";
import {
  FOLLOW_DISABLED_TAG,
  FOLLOW_PAUSED_TAG,
  FOLLOW_ARCHIVED_TAG,
  notesHasTag,
  getSourceFollowCapability,
} from "@/lib/aanvoer/source-follow";
import { defaultFollowIntervalHours } from "@/lib/aanvoer/follow-capability";

export type ScheduledSourceOutcomeStatus =
  | "success"
  | "partial"
  | "failed"
  | "skipped"
  | "locked"
  | "cooldown"
  | "disabled"
  | "not_due"
  | "unsupported";

export type ScheduledSourceOutcome = {
  catalogSourceId: string;
  label: string;
  parserKey: string;
  status: ScheduledSourceOutcomeStatus;
  reason?: string;
  runId?: string;
  newCount?: number;
  changedCount?: number;
  removedCount?: number;
  unchangedCount?: number;
};

export type ScheduledRefreshSummary = {
  globallyEnabled: boolean;
  due: number;
  attempted: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
  outcomes: ScheduledSourceOutcome[];
};

type ScheduleCandidate = {
  catalogSourceId: string;
  label: string;
  parserKey: RefreshParserKey;
};

function nextRefreshAt(
  state: SourceScheduleState,
  parserKey: RefreshParserKey,
): Date | null {
  const hours =
    state.refreshIntervalHours ??
    DEFAULT_REFRESH_INTERVAL_HOURS[parserKey] ??
    48;
  if (!state.lastScheduledRefreshAt) return new Date(0);
  return new Date(
    new Date(state.lastScheduledRefreshAt).getTime() + hours * 60 * 60 * 1000,
  );
}

export function isSourceDueForScheduledRefresh(
  state: SourceScheduleState,
  parserKey: RefreshParserKey,
  now: Date = new Date(),
): boolean {
  if (!state.refreshEnabled) return false;
  const dueAt = nextRefreshAt(state, parserKey);
  if (!dueAt) return true;
  return now.getTime() >= dueAt.getTime();
}

export function computeNextRefreshAtIso(
  state: SourceScheduleState | null | undefined,
  parserKey: RefreshParserKey | undefined,
): string | null {
  if (!state || !parserKey || !state.refreshEnabled) return null;
  const hours =
    state.refreshIntervalHours ??
    DEFAULT_REFRESH_INTERVAL_HOURS[parserKey] ??
    48;
  if (!state.lastScheduledRefreshAt) return null;
  return new Date(
    new Date(state.lastScheduledRefreshAt).getTime() + hours * 60 * 60 * 1000,
  ).toISOString();
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function classifyRun(
  run: SourceRefreshRunRecord | null | undefined,
  ok: boolean,
): ScheduledSourceOutcomeStatus {
  if (!ok || !run) return "failed";
  if (run.status === "completed") {
    if (run.error) return "partial";
    return "success";
  }
  if (run.status === "blocked" || run.status === "failed") return "failed";
  return "failed";
}

function humanOverrideBlocks(notes: string | null | undefined): string | null {
  if (notesHasTag(notes, FOLLOW_PAUSED_TAG)) return "human_paused";
  if (notesHasTag(notes, FOLLOW_DISABLED_TAG)) return "human_disabled";
  if (notesHasTag(notes, FOLLOW_ARCHIVED_TAG)) return "human_archived";
  return null;
}

export type RunScheduledRefreshOptions = {
  /** Cap sources attempted this invocation (remainder waits for next cron). */
  maxSources?: number;
  /** Only these catalog source IDs (must still be auto-followable + enabled). */
  onlySourceIds?: string[];
  /**
   * Local/pilot scripts may pass true to bypass OFFLINERADAR_SCHEDULED_REFRESH.
   * Production cron must never set this.
   */
  bypassGlobalKillSwitch?: boolean;
  /** Treat all enabled allowlisted sources as due (still respects lock/cooldown). */
  forceDue?: boolean;
  now?: Date;
};

/**
 * One cron tick: pick due auto-follow sources, run bounded batch via shared engine.
 */
export async function runScheduledSourceRefresh(
  options: RunScheduledRefreshOptions = {},
): Promise<ScheduledRefreshSummary> {
  const globallyEnabled = isScheduledRefreshGloballyEnabled();
  const empty: ScheduledRefreshSummary = {
    globallyEnabled,
    due: 0,
    attempted: 0,
    succeeded: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
    outcomes: [],
  };

  if (!globallyEnabled && !options.bypassGlobalKillSwitch) {
    return {
      ...empty,
      skipped: REFRESH_PILOTS.length,
      outcomes: REFRESH_PILOTS.map((p) => ({
        catalogSourceId: p.catalogSourceId,
        label: p.label,
        parserKey: p.parserKey,
        status: "skipped" as const,
        reason: "global_kill_switch",
      })),
    };
  }

  const now = options.now ?? new Date();
  const maxSources = options.maxSources ?? SCHEDULED_REFRESH_BATCH_SIZE;

  const { listCatalogSources } = await import("@/lib/events/catalog-sources");
  const allSources = await listCatalogSources();
  const byId = new Map(allSources.map((s) => [s.id, s]));

  const enabledIds = options.onlySourceIds?.length
    ? options.onlySourceIds
    : await listAutoFollowEnabledSourceIds();

  // Always consider dedicated pilots + any other enabled auto-follow source.
  const candidateIds = new Set<string>([
    ...REFRESH_PILOTS.map((p) => p.catalogSourceId),
    ...enabledIds,
  ]);
  if (options.onlySourceIds?.length) {
    for (const id of [...candidateIds]) {
      if (!options.onlySourceIds.includes(id)) candidateIds.delete(id);
    }
  }

  const schedules = await getSourceScheduleStates([...candidateIds]);
  const dueCandidates: ScheduleCandidate[] = [];
  const preOutcomes: ScheduledSourceOutcome[] = [];

  for (const catalogSourceId of candidateIds) {
    const source = byId.get(catalogSourceId);
    const state = schedules.get(catalogSourceId);
    const pilot = getRefreshPilot(catalogSourceId);
    const capability = source
      ? getSourceFollowCapability({
          catalogSourceId,
          officialUrl: source.officialUrl,
          name: source.name,
        })
      : null;

    const parserKey: RefreshParserKey = pilot
      ? pilot.parserKey
      : capability?.methods.includes("website") ||
          capability?.methods.includes("agenda")
        ? "generic-website"
        : "websearch";
    const label = pilot?.label ?? source?.name ?? catalogSourceId;

    if (!source || !state) {
      preOutcomes.push({
        catalogSourceId,
        label,
        parserKey,
        status: "unsupported",
        reason: "catalog_source_missing",
      });
      continue;
    }

    const override = humanOverrideBlocks(source.notes);
    if (override) {
      preOutcomes.push({
        catalogSourceId,
        label,
        parserKey,
        status: "disabled",
        reason: override,
      });
      continue;
    }

    if (source.status === "inactive") {
      preOutcomes.push({
        catalogSourceId,
        label,
        parserKey,
        status: "disabled",
        reason: "catalog_inactive",
      });
      continue;
    }

    if (!state.refreshEnabled) {
      preOutcomes.push({
        catalogSourceId,
        label,
        parserKey,
        status: "disabled",
        reason: "refresh_enabled=false",
      });
      continue;
    }

    if (!pilot && !capability?.autoFollowable) {
      preOutcomes.push({
        catalogSourceId,
        label,
        parserKey,
        status: "unsupported",
        reason: capability?.manualReason ?? "not_auto_followable",
      });
      continue;
    }

    if (
      !options.forceDue &&
      !isSourceDueForScheduledRefresh(state, parserKey, now)
    ) {
      preOutcomes.push({
        catalogSourceId,
        label,
        parserKey,
        status: "not_due",
        reason: "interval_not_elapsed",
      });
      continue;
    }

    dueCandidates.push({ catalogSourceId, label, parserKey });
  }

  // Oldest last_scheduled first so remainder advances across cron ticks.
  dueCandidates.sort((a, b) => {
    const aAt = schedules.get(a.catalogSourceId)?.lastScheduledRefreshAt;
    const bAt = schedules.get(b.catalogSourceId)?.lastScheduledRefreshAt;
    const aTs = aAt ? new Date(aAt).getTime() : 0;
    const bTs = bAt ? new Date(bAt).getTime() : 0;
    return aTs - bTs;
  });

  const batch = dueCandidates.slice(0, maxSources);
  const deferred = dueCandidates.slice(maxSources);

  for (const item of deferred) {
    preOutcomes.push({
      catalogSourceId: item.catalogSourceId,
      label: item.label,
      parserKey: item.parserKey,
      status: "skipped",
      reason: "batch_limit",
    });
  }

  const batchOutcomes = await mapPool(
    batch,
    SCHEDULED_REFRESH_CONCURRENCY,
    async (item): Promise<ScheduledSourceOutcome> => {
      const result = await startSourceRefresh({
        catalogSourceId: item.catalogSourceId,
        triggeredBy: "cron:scheduled",
        triggerType: "scheduled",
      });

      if (!result.ok) {
        if (result.code === "active_run") {
          return {
            catalogSourceId: item.catalogSourceId,
            label: item.label,
            parserKey: item.parserKey,
            status: "locked",
            reason: result.error,
            runId: result.run?.id,
          };
        }
        if (result.code === "cooldown") {
          return {
            catalogSourceId: item.catalogSourceId,
            label: item.label,
            parserKey: item.parserKey,
            status: "cooldown",
            reason: result.error,
            runId: result.run?.id,
          };
        }
        return {
          catalogSourceId: item.catalogSourceId,
          label: item.label,
          parserKey: item.parserKey,
          status: "failed",
          reason: result.error,
          runId: result.run?.id,
        };
      }

      const status = classifyRun(result.run, true);
      await markSourceScheduledRefresh(item.catalogSourceId, now, {
        verified: status === "success",
      });
      return {
        catalogSourceId: item.catalogSourceId,
        label: item.label,
        parserKey: item.parserKey,
        status,
        reason: result.run.error ?? undefined,
        runId: result.run.id,
        newCount: result.run.newCount,
        changedCount: result.run.changedCount,
        removedCount: result.run.removedCount,
        unchangedCount: result.run.unchangedCount,
      };
    },
  );

  const outcomes = [...preOutcomes, ...batchOutcomes];
  const summary: ScheduledRefreshSummary = {
    globallyEnabled: globallyEnabled || Boolean(options.bypassGlobalKillSwitch),
    due: dueCandidates.length,
    attempted: batchOutcomes.length,
    succeeded: batchOutcomes.filter((o) => o.status === "success").length,
    partial: batchOutcomes.filter((o) => o.status === "partial").length,
    failed: batchOutcomes.filter((o) => o.status === "failed").length,
    skipped: outcomes.filter((o) =>
      ["skipped", "disabled", "not_due", "locked", "cooldown", "unsupported"].includes(
        o.status,
      ),
    ).length,
    outcomes,
  };
  return summary;
}

export function getRefreshPilotForSource(catalogSourceId: string) {
  return getRefreshPilot(catalogSourceId);
}

/** Interval hours for schedule display / migration (parser defaults or method defaults). */
export function resolveFollowIntervalHours(input: {
  catalogSourceId: string;
  refreshIntervalHours?: number | null;
  followMethods?: import("@/lib/aanvoer/follow-capability").FollowMethod[];
}): number {
  const pilot = getRefreshPilot(input.catalogSourceId);
  if (input.refreshIntervalHours != null) return input.refreshIntervalHours;
  if (pilot) return DEFAULT_REFRESH_INTERVAL_HOURS[pilot.parserKey] ?? 48;
  return defaultFollowIntervalHours(input.followMethods ?? ["website"]);
}
