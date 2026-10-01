/**
 * Human-facing follow status for catalog sources (admin Bronnen).
 * Backend keeps catalog status + refresh_enabled; UI never shows those raw.
 * Auto-follow is NOT limited to dedicated parsers.
 */
import {
  DEFAULT_REFRESH_INTERVAL_HOURS,
} from "@/lib/source-refresh/schedule-config";
import {
  getRefreshPilot,
} from "@/lib/source-refresh/registry";
import type { SourceScheduleState } from "@/lib/source-refresh/store";
import { computeNextRefreshAtIso } from "@/lib/source-refresh/scheduler";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";
import {
  defaultFollowIntervalHours,
  resolveSourceFollowCapability,
  type FollowMethod,
  type SourceFollowCapability,
} from "@/lib/aanvoer/follow-capability";

export const FOLLOW_PAUSED_TAG = "follow_paused=1";
export const FOLLOW_DISABLED_TAG = "follow_disabled=1";
export const FOLLOW_ARCHIVED_TAG = "follow_archived=1";

export type SourceFollowStatus =
  | "gevolgd"
  | "gepauzeerd"
  | "handmatig"
  | "uitgeschakeld"
  | "aandacht_nodig";

export const SOURCE_FOLLOW_LABEL: Record<SourceFollowStatus, string> = {
  gevolgd: "Wordt automatisch gevolgd",
  gepauzeerd: "Gepauzeerd",
  handmatig: "Handmatige bron",
  uitgeschakeld: "Uitgeschakeld",
  aandacht_nodig: "Aandacht nodig",
};

export function notesHasTag(notes: string | null | undefined, tag: string): boolean {
  return (notes ?? "").includes(tag);
}

export function classifySourceFollowStatus(input: {
  catalogStatus: string;
  notes: string | null | undefined;
  /** True when any automatic follow method exists (parser/website/agenda/websearch). */
  refreshSupported: boolean;
  refreshEnabled: boolean;
  consecutiveFailures: number;
  intakeSourceType?: string;
}): SourceFollowStatus {
  const notes = input.notes ?? "";
  if (
    input.catalogStatus === "inactive" ||
    notesHasTag(notes, FOLLOW_DISABLED_TAG) ||
    notesHasTag(notes, FOLLOW_ARCHIVED_TAG)
  ) {
    return "uitgeschakeld";
  }
  if (notesHasTag(notes, FOLLOW_PAUSED_TAG)) {
    return "gepauzeerd";
  }
  if (!input.refreshSupported) {
    return "handmatig";
  }
  if (input.consecutiveFailures >= 2 && input.refreshEnabled) {
    return "aandacht_nodig";
  }
  if (input.refreshEnabled) {
    return "gevolgd";
  }
  // Auto-followable but not yet enabled → handmatig until admin enables.
  return "handmatig";
}

export function frequencyLabel(input: {
  catalogSourceId: string;
  refreshIntervalHours: number | null;
  followStatus: SourceFollowStatus;
  followMethods?: FollowMethod[];
}): string {
  if (
    input.followStatus === "handmatig" ||
    input.followStatus === "uitgeschakeld" ||
    input.followStatus === "gepauzeerd"
  ) {
    return "handmatig";
  }
  const pilot = getRefreshPilot(input.catalogSourceId);
  const hours =
    input.refreshIntervalHours ??
    (pilot
      ? DEFAULT_REFRESH_INTERVAL_HOURS[pilot.parserKey]
      : defaultFollowIntervalHours(input.followMethods ?? ["website"]));
  if (hours == null) return "handmatig";
  if (hours <= 24) return "dagelijks";
  if (hours <= 48) return "om de 2 dagen";
  if (hours <= 72) return "om de 3 dagen";
  if (hours <= 96) return "2× per week";
  return `elke ${Math.round(hours / 24)} dagen`;
}

export function formatScanWhen(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "Nog niet automatisch gescand";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Nog niet automatisch gescand";
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(d);
  startThat.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startToday.getTime() - startThat.getTime()) / (24 * 60 * 60 * 1000),
  );
  const time = new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  if (dayDiff === 0) return `vandaag ${time}`;
  if (dayDiff === 1) return `gisteren ${time}`;
  return new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "long",
  }).format(d);
}

export function formatNextScan(input: {
  followStatus: SourceFollowStatus;
  nextScanAt: string | null;
  /** True when auto-follow is on but no scan has completed yet. */
  neverScanned?: boolean;
  now?: Date;
}): string {
  if (input.followStatus === "gepauzeerd") return "Scans gepauzeerd";
  if (input.followStatus === "uitgeschakeld") return "Uitgeschakeld";
  if (input.followStatus === "handmatig") {
    return "Geen automatische volgende scan";
  }
  if (!input.nextScanAt) {
    if (
      input.followStatus === "gevolgd" ||
      input.followStatus === "aandacht_nodig"
    ) {
      return "Volgens huidige scheduler / eerstvolgende due window";
    }
    return "Geen automatische volgende scan";
  }
  const now = input.now ?? new Date();
  const d = new Date(input.nextScanAt);
  if (Number.isNaN(d.getTime())) {
    return "Volgens huidige scheduler / eerstvolgende due window";
  }
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(d);
  startThat.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startThat.getTime() - startToday.getTime()) / (24 * 60 * 60 * 1000),
  );
  const time = new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  if (dayDiff < 0 || d.getTime() <= now.getTime()) {
    return input.neverScanned
      ? "Volgens huidige scheduler / eerstvolgende due window"
      : "nu (achterstallig)";
  }
  if (dayDiff === 0) return `vandaag rond ${time}`;
  if (dayDiff === 1) return "morgen";
  if (dayDiff <= 2) return "Verwacht binnen 2 dagen";
  return new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "long",
  }).format(d);
}

export function summarizeLastRun(
  run: SourceRefreshRunRecord | null,
): string {
  if (!run) return "Nog geen scanresultaat";
  if (run.status === "failed" || run.status === "blocked") {
    if (run.fetchState === "unreachable" || run.httpStatus === 0) {
      return "Bron niet bereikbaar";
    }
    return "Scan mislukt";
  }
  if (run.status === "cooldown") return "Te snel opnieuw gevraagd";
  if (run.status === "running" || run.status === "pending") {
    return "Scan bezig…";
  }
  const parts: string[] = [];
  if (run.newCount > 0) {
    parts.push(
      `${run.newCount} nieuw${run.newCount === 1 ? "" : "e"} gevonden`,
    );
  }
  if (run.changedCount > 0) {
    parts.push(`${run.changedCount} gewijzigd`);
  }
  const checked =
    run.candidateCount ||
    run.newCount + run.unchangedCount + run.changedCount + run.removedCount;
  if (checked > 0) {
    parts.push(`${checked} events gecontroleerd`);
  }
  if (parts.length === 0) return "Geen wijzigingen";
  return parts.join(" · ");
}

export function resolveNextScanAt(
  catalogSourceId: string,
  schedule: SourceScheduleState | null | undefined,
  followMethods?: FollowMethod[],
): string | null {
  if (!schedule || !schedule.refreshEnabled) return null;
  const pilot = getRefreshPilot(catalogSourceId);
  if (pilot) {
    return computeNextRefreshAtIso(schedule, pilot.parserKey);
  }
  const hours =
    schedule.refreshIntervalHours ??
    defaultFollowIntervalHours(followMethods ?? ["website"]);
  if (!schedule.lastScheduledRefreshAt) return null;
  return new Date(
    new Date(schedule.lastScheduledRefreshAt).getTime() + hours * 60 * 60 * 1000,
  ).toISOString();
}

export function sourceIsAutoFollowable(input: {
  catalogSourceId: string;
  officialUrl: string;
  intakeSourceType?: string | null;
}): boolean {
  return resolveSourceFollowCapability(input).autoFollowable;
}

export function getSourceFollowCapability(input: {
  catalogSourceId: string;
  officialUrl: string;
  name?: string | null;
  intakeSourceType?: string | null;
}): SourceFollowCapability {
  return resolveSourceFollowCapability(input);
}

/** Append or remove a follow tag in notes without wiping other content. */
export function patchFollowNotes(
  notes: string | null | undefined,
  opts: {
    set?: string[];
    clear?: string[];
    stamp?: string;
  },
): string {
  let next = notes ?? "";
  for (const tag of opts.clear ?? []) {
    next = next
      .split("\n")
      .filter((line) => !line.includes(tag))
      .join("\n");
    next = next.replaceAll(tag, "");
  }
  for (const tag of opts.set ?? []) {
    if (!next.includes(tag)) {
      next = `${next}\n${tag}`.trim();
    }
  }
  if (opts.stamp && !next.includes(opts.stamp.split("=")[0] + "=")) {
    next = `${next}\n${opts.stamp}`.trim();
  } else if (opts.stamp) {
    const key = opts.stamp.split("=")[0];
    next = next
      .split("\n")
      .map((line) => (line.startsWith(`${key}=`) ? opts.stamp! : line))
      .join("\n");
  }
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

export type { FollowMethod, SourceFollowCapability };
