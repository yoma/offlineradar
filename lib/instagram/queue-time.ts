/**
 * Brussels wall time <-> instants for the queue's datetime-local inputs.
 * Client-safe (no Node APIs).
 */

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO instant → "YYYY-MM-DDTHH:mm" in Brussels time (for datetime-local). */
export function toBrusselsLocalInput(isoInstant: string): string {
  const parts = Object.fromEntries(
    PARTS.formatToParts(new Date(isoInstant)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** "YYYY-MM-DDTHH:mm" in Brussels time → Date, or null when malformed. */
export function fromBrusselsLocalInput(value: string): Date | null {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, ymd, hh, mm] = match;
  // Guess with UTC, then correct by the Brussels offset at that instant
  // (twice, so DST boundaries settle).
  const wallMs = Date.parse(`${ymd}T${hh}:${mm}:00Z`);
  if (Number.isNaN(wallMs)) return null;
  let instant = wallMs;
  for (let i = 0; i < 2; i++) {
    const shown = Date.parse(`${toBrusselsLocalInput(new Date(instant).toISOString())}:00Z`);
    instant += wallMs - shown;
  }
  return new Date(instant);
}

export function formatBrusselsDateTime(isoInstant: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoInstant));
}
