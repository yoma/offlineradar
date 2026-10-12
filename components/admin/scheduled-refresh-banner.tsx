import { isScheduledRefreshGloballyEnabled } from "@/lib/source-refresh/schedule-config";

/**
 * Visible ops signal: “Wordt gevolgd” is meaningless if the nightly cron is off.
 */
export function ScheduledRefreshBanner() {
  const on = isScheduledRefreshGloballyEnabled();

  if (on) {
    return (
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        Nachtelijke broncheck staat <span className="font-semibold">aan</span>{" "}
        (elke dag ~06:00 BE). Nieuwe auto-volgbare bronnen komen op de planning.
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">Nachtelijke broncheck staat uit</p>
      <p className="mt-1 leading-5">
        Bronnen kunnen “automatisch gevolgd” tonen, maar de cron doet niets tot{" "}
        <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[12px]">
          OFFLINERADAR_SCHEDULED_REFRESH=1
        </code>{" "}
        in productie staat. Zet dat aan in Vercel env, daarna redeploy.
      </p>
    </div>
  );
}
