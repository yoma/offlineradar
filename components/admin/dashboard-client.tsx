"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { DashboardData } from "@/lib/analytics/dashboard";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-BE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span
      className={`text-xs font-medium ${up ? "text-emerald-700" : "text-rose-700"}`}
    >
      {up ? "↑" : "↓"} {Math.abs(value)}% t.o.v. vorige periode
    </span>
  );
}

function KpiCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: number | string;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
        {value}
      </p>
      {delta != null ? (
        <p className="mt-1">
          <Delta value={delta} />
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

function BarChart({
  items,
  valueKey,
}: {
  items: { label: string; value: number }[];
  valueKey?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return (
      <p className="text-sm text-stone-500">Nog geen data in deze periode.</p>
    );
  }
  return (
    <ul className="space-y-2.5" aria-label={valueKey ?? "chart"}>
      {items.map((item) => (
        <li key={item.label} className="min-w-0">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium text-stone-800">
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums text-stone-600">
              {item.value}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-rose-500/80"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LineChart({
  points,
}: {
  points: { day: string; visitors: number }[];
}) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-stone-500">Nog geen bezoekersdata verzameld.</p>
    );
  }
  const max = Math.max(1, ...points.map((p) => p.visitors));
  const w = 640;
  const h = 160;
  const pad = 12;
  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? w / 2
        : pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - (p.visitors / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-40 w-full min-w-[280px]"
        role="img"
        aria-label="Bezoekers per dag"
      >
        <polyline
          fill="none"
          stroke="#e11d48"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={coords.join(" ")}
        />
        {points.map((p, i) => {
          const [x, y] = coords[i].split(",").map(Number);
          return (
            <circle key={p.day} cx={x} cy={y} r="3.5" fill="#be123c" />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-stone-500">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}

const PERIODS = [
  { key: "today", label: "Vandaag" },
  { key: "7d", label: "7 dagen" },
  { key: "30d", label: "30 dagen" },
  { key: "month", label: "Deze maand" },
  { key: "prev_month", label: "Vorige maand" },
  { key: "custom", label: "Custom" },
] as const;

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = data.period.key;

  function setPeriod(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    if (next !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`/interne-dashboard?${params.toString()}`);
  }

  function setCustom(from: string, to: string) {
    const params = new URLSearchParams();
    params.set("period", "custom");
    params.set("from", from);
    params.set("to", to);
    router.push(`/interne-dashboard?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-rose-700/80 uppercase">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
            Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Anonieme product- en trafficanalytics. Data vanaf{" "}
            {data.dataSince}. Geen persoonsgerichte tracking.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-semibold text-stone-500 uppercase">
            Periode
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  period === p.key
                    ? "bg-stone-900 text-white"
                    : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" ? (
            <form
              className="mt-2 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const from = String(fd.get("from") || "");
                const to = String(fd.get("to") || "");
                if (from && to) setCustom(from, to);
              }}
            >
              <label className="text-xs text-stone-600">
                Van
                <input
                  name="from"
                  type="date"
                  defaultValue={searchParams.get("from") ?? ""}
                  className="mt-1 block rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                  required
                />
              </label>
              <label className="text-xs text-stone-600">
                Tot
                <input
                  name="to"
                  type="date"
                  defaultValue={searchParams.get("to") ?? ""}
                  className="mt-1 block rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                  required
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Toepassen
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {/* Rij 1 — kern KPI's */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Unieke bezoekers"
          value={data.kpis.uniqueVisitors.value}
          delta={data.kpis.uniqueVisitors.deltaPct}
          hint={`Vandaag ${data.kpis.uniqueVisitorsToday} · 7d ${data.kpis.uniqueVisitors7d} · 30d ${data.kpis.uniqueVisitors30d}`}
        />
        <KpiCard
          label="Nieuwe events"
          value={data.kpis.newEvents.value}
          delta={data.kpis.newEvents.deltaPct}
        />
        <KpiCard
          label="Externe clicks"
          value={data.kpis.externalClicks.value}
          delta={data.kpis.externalClicks.deltaPct}
        />
        <KpiCard
          label="Aandacht nodig"
          value={data.kpis.attentionNeeded}
          hint="Huidige queue (niet periodegebonden)"
        />
      </section>

      {/* Rij 2 — visitors chart */}
      <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              Bezoekers per dag
            </h2>
            <p className="text-sm text-stone-500">
              Pageviews: {data.kpis.pageviews.value}
              {data.kpis.pageviews.deltaPct != null ? (
                <>
                  {" "}
                  · <Delta value={data.kpis.pageviews.deltaPct} />
                </>
              ) : null}
            </p>
          </div>
        </div>
        <LineChart points={data.visitorsByDay} />
      </section>

      {/* Rij 3 — origin + categories */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">
            Eventaanvoer per oorsprong
          </h2>
          <p className="mb-4 text-sm text-stone-500">
            AI {data.supply.aiDiscovery} · Admin {data.supply.adminIntake} ·
            Tips {data.supply.userTip} · Auto-live {data.supply.autoPublished} ·
            Niet toegevoegd {data.supply.rejected}
          </p>
          <BarChart
            items={data.supply.byOrigin.map((o) => ({
              label: o.label,
              value: o.count,
            }))}
          />
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">
            Populaire categorieën
          </h2>
          <p className="mb-4 text-sm text-stone-500">
            Event views + filterselecties
          </p>
          <BarChart
            items={data.categories.map((c) => ({
              label: c.category,
              value: c.views + c.filterHits,
            }))}
          />
        </div>
      </section>

      {/* Supply KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="AI discovery" value={data.supply.aiDiscovery} />
        <KpiCard label="Admin intake" value={data.supply.adminIntake} />
        <KpiCard label="User tips" value={data.supply.userTip} />
        <KpiCard label="Automatisch live" value={data.supply.autoPublished} />
        <KpiCard label="Aandacht nodig" value={data.supply.attentionNeeded} />
        <KpiCard label="Niet toegevoegd" value={data.supply.rejected} />
      </section>

      {/* Rij 4 — top events */}
      <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">
          Meest bekeken events
        </h2>
        <p className="mb-4 text-sm text-stone-500">
          Doorklikratio = externe clicks / event views
        </p>
        {data.topEvents.length === 0 ? (
          <p className="text-sm text-stone-500">
            Nog geen event views sinds {data.dataSince}.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.topEvents.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/event/${ev.slug}`}
                    className="font-semibold text-stone-900 underline-offset-4 hover:underline"
                  >
                    {ev.title}
                  </Link>
                  <p className="text-sm text-stone-500">
                    {ev.organizer}
                    {ev.startsAt
                      ? ` · ${String(ev.startsAt).slice(0, 10)}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-sm text-stone-700 sm:text-right">
                  <p>
                    {ev.views} views · {ev.externalClicks} clicks · {ev.saves}{" "}
                    saves
                  </p>
                  <p className="font-semibold text-rose-800">
                    CTR {ev.ctr == null ? "—" : `${ev.ctr}%`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rij 5 — organizers + saved */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">
            Organisatoren met meeste interesse
          </h2>
          <ul className="mt-3 divide-y divide-stone-100">
            {data.organizers.length === 0 ? (
              <li className="py-2 text-sm text-stone-500">Nog geen data.</li>
            ) : (
              data.organizers.map((o) => (
                <li key={o.id} className="py-2.5 text-sm">
                  <p className="font-semibold text-stone-900">{o.name}</p>
                  <p className="text-stone-600">
                    {o.views} views · {o.externalClicks} clicks · {o.saves}{" "}
                    saves · {o.activeEvents} actief
                    {o.follows > 0 ? ` · ${o.follows} follows` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">
            Meest bewaarde events
          </h2>
          <ul className="mt-3 divide-y divide-stone-100">
            {data.topSaved.length === 0 ? (
              <li className="py-2 text-sm text-stone-500">Nog geen saves.</li>
            ) : (
              data.topSaved.map((e) => (
                <li key={e.id} className="py-2.5 text-sm">
                  <Link
                    href={`/event/${e.slug}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {e.title}
                  </Link>
                  <p className="text-stone-600">
                    {e.organizer} · {e.saves} saves
                  </p>
                </li>
              ))
            )}
          </ul>
          {data.lowInterestEvents.length > 0 ? (
            <div className="mt-5 border-t border-stone-100 pt-4">
              <h3 className="text-sm font-semibold text-stone-800">
                Weinig bekeken
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600">
                {data.lowInterestEvents.map((e) => (
                  <li key={e.id}>
                    {e.title} · {e.views} views
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.searchTerms.length > 0 ? (
            <div className="mt-5 border-t border-stone-100 pt-4">
              <h3 className="text-sm font-semibold text-stone-800">
                Meest gebruikte zoektermen
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {data.searchTerms.map((t) => (
                  <li
                    key={t.term}
                    className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
                  >
                    {t.term} ({t.count})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {/* Rij 6 — sources */}
      <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">
          Bronnen & scanner health
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Actief gevolgd" value={data.sources.activeFollowed} />
          <KpiCard label="Nieuw ontdekt" value={data.sources.newDiscovered} />
          <KpiCard
            label="Bronnen aandacht"
            value={data.sources.needsAttention}
          />
          <KpiCard label="Handmatig" value={data.sources.manual} />
          <KpiCard
            label="Succesvolle scans"
            value={data.sources.successfulScans}
          />
        </div>
        <h3 className="mt-5 text-sm font-semibold text-stone-800">
          Meest productieve bronnen
        </h3>
        <ul className="mt-2 divide-y divide-stone-100">
          {data.sources.top.length === 0 ? (
            <li className="py-2 text-sm text-stone-500">Geen brondata.</li>
          ) : (
            data.sources.top.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:justify-between"
              >
                <span className="font-medium text-stone-900">{s.name}</span>
                <span className="text-stone-600">
                  {s.newEvents} nieuw · {s.published} gepubliceerd
                  {s.lastScanAt
                    ? ` · laatste scan ${formatTime(s.lastScanAt)}`
                    : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Discovery activity */}
      <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">
          Discovery / AI activiteit
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="AI gevonden"
            value={data.discoveryActivity.aiFound}
          />
          <KpiCard
            label="Opnieuw bevestigd"
            value={data.discoveryActivity.confirmedExisting}
          />
          <KpiCard
            label="Nieuwe bronnen"
            value={data.discoveryActivity.newSources}
          />
          <KpiCard
            label="Auto gepubliceerd"
            value={data.discoveryActivity.autoPublished}
          />
          <KpiCard
            label="Naar aandacht"
            value={data.discoveryActivity.attention}
          />
          <KpiCard
            label="Rejected"
            value={data.discoveryActivity.rejected}
          />
        </div>
      </section>

      {/* Rij 7 — recent activity */}
      <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">
          Recente activiteit
        </h2>
        <ul className="mt-3 space-y-3">
          {data.recentActivity.length === 0 ? (
            <li className="text-sm text-stone-500">Nog geen activiteit.</li>
          ) : (
            data.recentActivity.map((item, idx) => (
              <li key={`${item.at}-${idx}`} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 tabular-nums text-stone-500">
                  {formatTime(item.at)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{item.kind}</p>
                  <p className="truncate text-stone-600">{item.title}</p>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
