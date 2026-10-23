/**
 * Plain-Dutch readiness summary for admin cards (Phase 2B UX).
 */

export type ReadinessChecks = {
  singles: boolean;
  date: boolean;
  location: boolean;
  source: boolean;
};

export function describePublicationReadiness(input: {
  checks: ReadinessChecks;
  priceKnown: boolean;
  startTime: string | null | undefined;
  blockReason: string | null;
  readyToPublish: boolean;
}): string {
  if (input.readyToPublish) {
    const soft: string[] = [];
    if (!input.priceKnown) soft.push("ticketprijs niet gevonden");
    if (!input.startTime || input.startTime === "12:00") {
      soft.push("begintijd niet bevestigd");
    }
    if (soft.length === 0) {
      return "Klaar voor publicatie. Alle verplichte controles zijn geslaagd.";
    }
    return `Klaar voor publicatie. Verplicht OK; ${soft.join(", ")}.`;
  }

  const missing: string[] = [];
  if (!input.checks.date) missing.push("datum");
  if (!input.checks.location) missing.push("locatie");
  if (!input.checks.singles) missing.push("singlesgeschiktheid");
  if (!input.checks.source) missing.push("bron");

  const ok: string[] = [];
  if (input.checks.date) ok.push("datum");
  if (input.checks.location) ok.push("locatie");
  if (input.checks.singles) ok.push("doelgroep");
  if (input.checks.source) ok.push("bron");

  const head =
    ok.length > 0
      ? `Evenement gevonden. ${capitalize(ok.join(", "))} bevestigd.`
      : "Evenement gevonden.";
  const tail =
    missing.length > 0
      ? ` Nog nodig: ${missing.join(", ")}.`
      : input.blockReason
        ? ` ${input.blockReason}`
        : " Nog aandacht nodig.";
  return `${head}${tail}`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
