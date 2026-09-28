/**
 * Scheduled source refresh: selects due stable parsers and runs shared engine.
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
  type RefreshPilotConfig,
} from "@/lib/source-refresh/registry";
import {
  getSourceScheduleStates,
  markSourceScheduledRefresh,
  type SourceScheduleState,
} from "@/lib/source-refresh/store";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";

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

function nextRefreshAt(
  state: SourceScheduleState,
  parserKey: RefreshPilotConfig["parserKey"],
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
  parserKey: RefreshPilotConfig["parserKey"],
  now: Date = new Date(),
): boolean {
  if (!state.refreshEnabled) return false;
  const dueAt = nextRefreshAt(state, parserKey);
  if (!dueAt) return true;
  return now.getTime() >= dueAt.getTime();
}

export function computeNextRefreshAtIso(
  state: SourceScheduleState | null | undefined,
  parserKey: RefreshPilotConfig["parserKey"] | undefined,
): string | null {
  if (!state || !parserKey || !state.refreshEnabled) return null;
  const hours =
    state.refreshIntervalHours ??
    DEFAULT_REFRESH_INTERVAL_HOURS[parserKey] ??
    48;
  if (!state.lastScheduledRefreshAt) return new Date().toISOString();
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

export type RunScheduledRefreshOptions = {
  /** Cap sources attempted this invocation (remainder waits for next cron). */
  maxSources?: number;
  /** Only these catalog source IDs (must still be allowlisted pilots). */
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
 * One cron tick: pick due allowlisted sources, run bounded batch via shared engine.
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
  const allowlist = options.onlySourceIds?.length
    ? REFRESH_PILOTS.filter((p) =>
        options.onlySourceIds!.includes(p.catalogSourceId),
      )
    : REFRESH_PILOTS;

  const schedules = await getSourceScheduleStates(
    allowlist.map((p) => p.catalogSourceId),
  );

  const duePilots: RefreshPilotConfig[] = [];
  const preOutcomes: ScheduledSourceOutcome[] = [];

  for (const pilot of allowlist) {
    const state = schedules.get(pilot.catalogSourceId);
    if (!state) {
      preOutcomes.push({
        catalogSourceId: pilot.catalogSourceId,
        label: pilot.label,
        parserKey: pilot.parserKey,
        status: "unsupported",
        reason: "catalog_source_missing",
      });
      continue;
    }
    if (!state.refreshEnabled) {
      preOutcomes.push({
        catalogSourceId: pilot.catalogSourceId,
        label: pilot.label,
        parserKey: pilot.parserKey,
        status: "disabled",
        reason: "refresh_enabled=false",
      });
      continue;
    }
    if (
      !options.forceDue &&
      !isSourceDueForScheduledRefresh(state, pilot.parserKey, now)
    ) {
      preOutcomes.push({
        catalogSourceId: pilot.catalogSourceId,
        label: pilot.label,
        parserKey: pilot.parserKey,
        status: "not_due",
        reason: "interval_not_elapsed",
      });
      continue;
    }
    duePilots.push(pilot);
  }

  // Oldest last_scheduled first so remainder advances across cron ticks.
  duePilots.sort((a, b) => {
    const aAt = schedules.get(a.catalogSourceId)?.lastScheduledRefreshAt;
    const bAt = schedules.get(b.catalogSourceId)?.lastScheduledRefreshAt;
    const aTs = aAt ? new Date(aAt).getTime() : 0;
    const bTs = bAt ? new Date(bAt).getTime() : 0;
    return aTs - bTs;
  });

  const batch = duePilots.slice(0, maxSources);
  const deferred = duePilots.slice(maxSources);

  for (const pilot of deferred) {
    preOutcomes.push({
      catalogSourceId: pilot.catalogSourceId,
      label: pilot.label,
      parserKey: pilot.parserKey,
      status: "skipped",
      reason: "batch_limit",
    });
  }

  const batchOutcomes = await mapPool(
    batch,
    SCHEDULED_REFRESH_CONCURRENCY,
    async (pilot): Promise<ScheduledSourceOutcome> => {
      const result = await startSourceRefresh({
        catalogSourceId: pilot.catalogSourceId,
        triggeredBy: "cron:scheduled",
        triggerType: "scheduled",
      });

      if (!result.ok) {
        if (result.code === "active_run") {
          return {
            catalogSourceId: pilot.catalogSourceId,
            label: pilot.label,
            parserKey: pilot.parserKey,
            status: "locked",
            reason: result.error,
            runId: result.run?.id,
          };
        }
        if (result.code === "cooldown") {
          return {
            catalogSourceId: pilot.catalogSourceId,
            label: pilot.label,
            parserKey: pilot.parserKey,
            status: "cooldown",
            reason: result.error,
            runId: result.run?.id,
          };
        }
        return {
          catalogSourceId: pilot.catalogSourceId,
          label: pilot.label,
          parserKey: pilot.parserKey,
          status: "failed",
          reason: result.error,
          runId: result.run?.id,
        };
      }

      const status = classifyRun(result.run, true);
      // Catalog last_checked only on full success — not partial/failed.
      // last_scheduled_refresh_at always advances so due-calc stays honest.
      await markSourceScheduledRefresh(pilot.catalogSourceId, now, {
        verified: status === "success",
      });
      return {
        catalogSourceId: pilot.catalogSourceId,
        label: pilot.label,
        parserKey: pilot.parserKey,
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
    due: duePilots.length,
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
