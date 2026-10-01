/**
 * Human-facing follow status for catalog sources (admin Bronnen).
 * Backend keeps catalog status + refresh_enabled; UI never shows those raw.
 */
import {
  DEFAULT_REFRESH_INTERVAL_HOURS,
} from "@/lib/source-refresh/schedule-config";
import {
  getRefreshPilot,
  isRefreshSupported,
} from "@/lib/source-refresh/registry";
import type { SourceScheduleState } from "@/lib/source-refresh/store";
import { computeNextRefreshAtIso } from "@/lib/source-refresh/scheduler";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";

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
  handmatig: "Handmatig",
  uitgeschakeld: "Uitgeschakeld",
  aandacht_nodig: "Aandacht nodig",
};

export function notesHasTag(notes: string | null | undefined, tag: string): boolean {
  return (notes ?? "").includes(tag);
}

export function classifySourceFollowStatus(input: {
  catalogStatus: string;
  notes: string | null | undefined;
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
  if (input.consecutiveFailures >= 2 && input.refreshSupported) {
    return "aandacht_nodig";
  }
  if (
    !input.refreshSupported ||
    input.intakeSourceType === "social" ||
    input.intakeSourceType === "handmatig"
  ) {
    return "handmatig";
  }
  if (input.refreshEnabled) {
    return "gevolgd";
  }
  // Parser exists but not scheduled → treat as handmatig until enabled
  return "handmatig";
}

export function frequencyLabel(input: {
  catalogSourceId: string;
  refreshIntervalHours: number | null;
  followStatus: SourceFollowStatus;
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
    (pilot ? DEFAULT_REFRESH_INTERVAL_HOURS[pilot.parserKey] : null);
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
  now?: Date;
}): string {
  if (input.followStatus === "gepauzeerd") return "Scans gepauzeerd";
  if (input.followStatus === "uitgeschakeld") return "Uitgeschakeld";
  if (input.followStatus === "handmatig" || !input.nextScanAt) {
    return "Geen automatische volgende scan";
  }
  const now = input.now ?? new Date();
  const d = new Date(input.nextScanAt);
  if (Number.isNaN(d.getTime())) return "Geen automatische volgende scan";
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
    return "nu (achterstallig)";
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
): string | null {
  const pilot = getRefreshPilot(catalogSourceId);
  if (!pilot || !schedule) return null;
  return computeNextRefreshAtIso(schedule, pilot.parserKey);
}

export function sourceIsAutoFollowable(catalogSourceId: string): boolean {
  return isRefreshSupported(catalogSourceId);
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
