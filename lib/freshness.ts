import { brusselsToday, diffDays } from "@/lib/dates";

export type FreshnessTone = "fresh" | "recent" | "stale" | "unknown";

export type Freshness = {
  label: string;
  /** Compact card label; null = hide on cards. */
  cardLabel: string | null;
  tone: FreshnessTone;
  caution: string | null;
};

/**
 * Authoritative public freshness: last successful source verification.
 * Never use createdAt / updatedAt / publishedAt.
 */
export function resolveSourceVerifiedAt(input: {
  sourceCheckedAt?: string | null;
  lastCheckedAt?: string | null;
}): string | null {
  const candidates = [input.sourceCheckedAt, input.lastCheckedAt]
    .map((value) => {
      if (!value) return null;
      const t = new Date(value).getTime();
      return Number.isNaN(t) ? null : { value, t };
    })
    .filter((row): row is { value: string; t: number } => row != null);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.t - a.t);
  return candidates[0]!.value;
}

function brusselsTime(date: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function brusselsDateParts(date: Date): { day: number; month: string; year: number } {
  const parts = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(date);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  return { day, month, year };
}

function brusselsShortDate(date: Date): string {
  const { day, month } = brusselsDateParts(date);
  return `${day} ${month}`;
}

function brusselsLongDate(date: Date): string {
  const { day, month, year } = brusselsDateParts(date);
  return `${day} ${month} ${year}`;
}

/**
 * Public freshness labels (Europe/Brussels).
 * Cards: compact; detail: longer via formatFreshnessDetail.
 */
export function formatFreshness(
  lastCheckedAt: string | null | undefined,
  now = new Date(),
): Freshness {
  if (!lastCheckedAt) {
    return {
      label: "Controle-datum onbekend",
      cardLabel: null,
      tone: "unknown",
      caution: null,
    };
  }

  const checked = new Date(lastCheckedAt);
  if (Number.isNaN(checked.getTime())) {
    return {
      label: "Controle-datum onbekend",
      cardLabel: null,
      tone: "unknown",
      caution: null,
    };
  }

  const today = brusselsToday(now);
  const checkedDay = brusselsToday(checked);
  const dayGap = diffDays(checkedDay, today);

  let cardLabel: string;
  let label: string;

  if (dayGap <= 0) {
    cardLabel = "Vandaag gecontroleerd";
    label = `Vandaag gecontroleerd (${brusselsTime(checked)})`;
  } else if (dayGap === 1) {
    cardLabel = "Gisteren gecontroleerd";
    label = `Gisteren gecontroleerd (${brusselsTime(checked)})`;
  } else if (dayGap <= 6) {
    cardLabel = `${dayGap} dagen geleden gecontroleerd`;
    label = cardLabel;
  } else if (dayGap <= 30) {
    cardLabel = `Laatst gecontroleerd op ${brusselsShortDate(checked)}`;
    label = `Laatste broncontrole: ${brusselsLongDate(checked)}`;
  } else {
    cardLabel = "Broncontrole ouder dan 30 dagen";
    label = `Broncontrole ouder dan 30 dagen (laatst ${brusselsLongDate(checked)})`;
  }

  const tone: FreshnessTone =
    dayGap <= 0 ? "fresh" : dayGap <= 6 ? "recent" : "stale";

  return {
    label,
    cardLabel,
    tone,
    caution:
      tone === "stale"
        ? "Beschikbaarheid en details kunnen intussen wijzigen; de officiële bron blijft leidend."
        : null,
  };
}

export function formatFreshnessDetail(
  lastCheckedAt: string | null | undefined,
  now = new Date(),
): Freshness {
  const base = formatFreshness(lastCheckedAt, now);
  if (!lastCheckedAt || base.tone === "unknown") {
    return {
      ...base,
      label: "Controle-datum onbekend",
      caution:
        "We konden geen betrouwbare broncontrole vinden. De officiële bron blijft leidend.",
    };
  }

  const checked = new Date(lastCheckedAt);
  const dayGap = diffDays(brusselsToday(checked), brusselsToday(now));
  if (dayGap <= 6) {
    return {
      ...base,
      label: `Laatste broncontrole: ${brusselsLongDate(checked)}`,
    };
  }
  return base;
}
