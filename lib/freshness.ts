import { brusselsToday, diffDays } from "@/lib/dates";

export type FreshnessTone = "fresh" | "recent" | "stale";

export type Freshness = {
  label: string;
  tone: FreshnessTone;
  caution: string | null;
};

function brusselsTime(date: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function brusselsDateParts(date: Date): { day: number; month: string } {
  const parts = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
  }).formatToParts(date);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return { day, month };
}

/**
 * Single consistent freshness label for cards and detail.
 * Examples: "2 uur geleden gecontroleerd", "Gisteren om 18:20 gecontroleerd"
 */
export function formatFreshness(
  lastCheckedAt: string,
  now = new Date(),
): Freshness {
  const checked = new Date(lastCheckedAt);
  if (Number.isNaN(checked.getTime())) {
    return {
      label: "Controlemoment onbekend",
      tone: "stale",
      caution: "Controleer de actuele info bij de organisator.",
    };
  }

  const today = brusselsToday(now);
  const checkedDay = brusselsToday(checked);
  const dayGap = diffDays(checkedDay, today);
  const time = brusselsTime(checked);
  const hours = Math.floor((now.getTime() - checked.getTime()) / 3_600_000);
  const minutes = Math.floor((now.getTime() - checked.getTime()) / 60_000);

  let label: string;
  if (dayGap <= 0 && minutes < 1) label = "Zojuist gecontroleerd";
  else if (dayGap <= 0 && minutes < 60) {
    label = `${minutes} min geleden gecontroleerd`;
  } else if (dayGap <= 0 && hours < 8) {
    label =
      hours <= 1
        ? "1 uur geleden gecontroleerd"
        : `${hours} uur geleden gecontroleerd`;
  } else if (dayGap <= 0) label = `Vandaag om ${time} gecontroleerd`;
  else if (dayGap === 1) label = `Gisteren om ${time} gecontroleerd`;
  else if (dayGap <= 3) label = `${dayGap} dagen geleden gecontroleerd`;
  else {
    const { day, month } = brusselsDateParts(checked);
    label = `${day} ${month} om ${time} gecontroleerd`;
  }

  const tone: FreshnessTone =
    dayGap <= 0 ? "fresh" : dayGap <= 3 ? "recent" : "stale";

  return {
    label,
    tone,
    caution:
      tone === "stale"
        ? "Controleer de actuele info bij de organisator."
        : null,
  };
}
