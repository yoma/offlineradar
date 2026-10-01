/**
 * Migrate legacy auto-followable catalog sources that still have
 * refresh_enabled=false (shown as "Handmatig") to automatic follow.
 *
 * - Does NOT touch admin pause / disable / inactive
 * - Does NOT start scans (spreads first due windows)
 * - Preserves history / linked events / provenance
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/migrate-legacy-auto-follow.ts
 *   node --env-file=.env.local --import tsx scripts/migrate-legacy-auto-follow.ts --apply
 */
import { listCatalogSources } from "../lib/events/catalog-sources";
import {
  classifySourceFollowStatus,
  FOLLOW_DISABLED_TAG,
  FOLLOW_PAUSED_TAG,
  FOLLOW_ARCHIVED_TAG,
  getSourceFollowCapability,
  notesHasTag,
  patchFollowNotes,
} from "../lib/aanvoer/source-follow";
import { defaultFollowIntervalHours } from "../lib/aanvoer/follow-capability";
import {
  getSourceScheduleStates,
  setSourceAutoFollowSchedule,
} from "../lib/source-refresh/store";
import { updateCatalogSourceFields } from "../lib/events/catalog-sources";

const APPLY = process.argv.includes("--apply");
/** Hours between first due windows (avoids scanstorm; cron batch is 3). */
const STAGGER_HOURS = 8;

function intakeTypeFromNotes(notes: string | null, sourceType: string) {
  const n = (notes ?? "").toLowerCase();
  if (n.includes("intake_source_type=website_first")) return "website";
  if (n.includes("intake_source_type=social_first")) return "social";
  if (n.includes("intake_source_type=ticket_platform_first")) return "ticket";
  if (n.includes("intake_source_type=manual_only")) return "handmatig";
  if (sourceType === "ticket_platform") return "ticket";
  if (sourceType === "community") return "social";
  if (sourceType === "organizer") return "website";
  if (sourceType === "other") return "handmatig";
  return "onbekend";
}

async function main() {
  const sources = await listCatalogSources();
  const schedules = await getSourceScheduleStates(sources.map((s) => s.id));
  const now = Date.now();

  type Row = {
    id: string;
    name: string;
    methods: string;
    hours: number;
    cat: "A" | "B" | "C" | "D" | "E";
  };
  const audit: Row[] = [];
  const activate: {
    id: string;
    name: string;
    methods: string;
    hours: number;
    lastScheduled: string;
  }[] = [];

  for (const s of sources) {
    const intake = intakeTypeFromNotes(s.notes, s.sourceType);
    const cap = getSourceFollowCapability({
      catalogSourceId: s.id,
      officialUrl: s.officialUrl,
      name: s.name,
      intakeSourceType: intake,
    });
    const sched = schedules.get(s.id);
    const refreshEnabled = Boolean(sched?.refreshEnabled);
    const notes = s.notes ?? "";
    const status = classifySourceFollowStatus({
      catalogStatus: s.status,
      notes,
      refreshSupported: cap.autoFollowable,
      refreshEnabled,
      consecutiveFailures: 0,
      intakeSourceType: intake,
    });

    if (status !== "handmatig") continue;

    const adminPaused = notesHasTag(notes, FOLLOW_PAUSED_TAG);
    const adminDisabled =
      notesHasTag(notes, FOLLOW_DISABLED_TAG) ||
      notesHasTag(notes, FOLLOW_ARCHIVED_TAG) ||
      s.status === "inactive";

    let cat: Row["cat"] = "E";
    if (!cap.autoFollowable) cat = "D";
    else if (adminDisabled) cat = "B";
    else if (adminPaused) cat = "C";
    else if (cap.autoFollowable && !refreshEnabled) cat = "A";

    const hours = defaultFollowIntervalHours(cap.methods);
    audit.push({
      id: s.id,
      name: s.name,
      methods: cap.methodLabel,
      hours,
      cat,
    });

    if (cat === "A") {
      const index = activate.length;
      // Anchor so next due = now + index * STAGGER_HOURS (spread, not all due now).
      const lastScheduled = new Date(
        now + index * STAGGER_HOURS * 60 * 60 * 1000 - hours * 60 * 60 * 1000,
      ).toISOString();
      activate.push({
        id: s.id,
        name: s.name,
        methods: cap.methodLabel,
        hours,
        lastScheduled,
      });
    }
  }

  const byCat = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const r of audit) byCat[r.cat]++;

  console.log("AUDIT handmatig sources:", audit.length);
  console.log("  A safe activate:", byCat.A);
  console.log("  B admin disabled:", byCat.B);
  console.log("  C admin paused:", byCat.C);
  console.log("  D manual-only:", byCat.D);
  console.log("  E other:", byCat.E);
  console.log("");

  for (const r of activate) {
    console.log(
      `${APPLY ? "ENABLE" : "DRY"} ${r.name} | ${r.methods} | every ${r.hours}h | next≈+${activate.indexOf(r) * STAGGER_HOURS}h`,
    );
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to enable.");
    return;
  }

  let ok = 0;
  for (const r of activate) {
    const source = sources.find((s) => s.id === r.id)!;
    const notes = patchFollowNotes(source.notes, {
      clear: [FOLLOW_PAUSED_TAG, FOLLOW_DISABLED_TAG, FOLLOW_ARCHIVED_TAG],
      stamp: `legacy_auto_follow_enabled_at=${new Date().toISOString()}`,
    });
    await setSourceAutoFollowSchedule({
      catalogSourceId: r.id,
      enabled: true,
      refreshIntervalHours: r.hours,
      lastScheduledRefreshAt: r.lastScheduled,
    });
    await updateCatalogSourceFields({
      id: r.id,
      status: "active",
      notes,
      touchChecked: false,
    });
    ok++;
  }
  console.log(`\nEnabled ${ok} legacy sources (no immediate scanstorm).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
