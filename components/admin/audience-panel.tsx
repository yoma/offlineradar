"use client";

import { useEffect, useState } from "react";
import type { AudienceData, CountRow, LiveVisitor } from "@/lib/analytics/audience";

const card = "rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm";

function duration(seconds: number | null): string {
  if (seconds == null) return "–";
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function Bars({ rows, total }: { rows: CountRow[]; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-stone-500">Nog geen gegevens.</p>;
  return (
    <ul className="space-y-1.5 text-sm text-stone-800">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        return (
          <li key={row.label}>
            <div className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {row.count} <span className="font-normal text-stone-500">({pct}%)</span>
              </span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-stone-100">
              <div
                className="h-1.5 rounded-full bg-[var(--brand-bordeaux)]"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2.5">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-stone-900">{value}</p>
      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s geleden` : `${Math.floor(s / 60)} min geleden`;
}

function LiveVisitors() {
  const [visitors, setVisitors] = useState<LiveVisitor[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const res = await fetch("/api/interne-analytics/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { visitors: LiveVisitor[] };
        if (!stopped) {
          setVisitors(json.visitors);
          setNow(Date.now());
          setError(false);
        }
      } catch {
        if (!stopped) setError(true);
      }
    }
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-stone-900">Nu op de site</h2>
        <span className="flex items-center gap-1.5 text-xs text-stone-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          laatste 5 min · ververst elke 15 s
        </span>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-700">Live-gegevens niet bereikbaar.</p>
      ) : visitors == null ? (
        <p className="mt-3 text-sm text-stone-500">Laden…</p>
      ) : visitors.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Nu niemand (behalve jij, en jij telt niet mee).</p>
      ) : (
        <>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-900">{visitors.length}</p>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {visitors.map((v, i) => (
              <li key={`${v.lastSeen}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                <span className="min-w-0 truncate font-medium text-stone-900">{v.page}</span>
                <span className="text-xs text-stone-600">
                  {v.source} · {v.device} · {v.place} · {v.pagesToday} pag. · {ago(v.lastSeen, now)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function AudiencePanel({ audience }: { audience: AudienceData }) {
  const a = audience;
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="text-lg font-semibold text-stone-900">Wie bezoekt je site?</h2>
          <p className="mb-4 text-sm text-stone-500">
            In deze periode. Jouw eigen toestellen tellen niet mee
            {a.excludedDevices > 0 ? ` (${a.excludedDevices} uitgesloten)` : ""}.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Unieke bezoekers" value={a.visitors} />
            <Stat label="Nieuw" value={a.newVisitors} />
            <Stat label="Terugkerend" value={a.returningVisitors} />
            <Stat label="Pagina’s per bezoek" value={a.pagesPerVisit ?? "–"} />
            <Stat label="Bezoekduur" value={duration(a.medianVisitSeconds)} hint="mediaan" />
            <Stat
              label="Naar organisator"
              value={a.clickedOutVisitors}
              hint={a.visitors > 0 ? `${Math.round((a.clickedOutVisitors / a.visitors) * 100)}% van bezoekers` : undefined}
            />
          </div>
        </div>
        <LiveVisitors />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-stone-800">Waar komen ze vandaan?</h3>
          <Bars rows={a.sources} total={a.visitors} />
        </div>
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-stone-800">Toestel</h3>
          <Bars rows={a.devices} total={a.visitors} />
          <h3 className="mb-3 mt-5 text-sm font-semibold text-stone-800">Systeem en browser</h3>
          <Bars rows={a.systems} total={a.visitors} />
        </div>
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-stone-800">Stad</h3>
          <Bars rows={a.cities} total={a.visitors} />
        </div>
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-stone-800">Land</h3>
          <Bars rows={a.countries} total={a.visitors} />
        </div>
      </div>

      {a.byDay.length > 0 ? (
        <div className={`${card} overflow-x-auto`}>
          <h3 className="mb-3 text-sm font-semibold text-stone-800">Unieke bezoekers per dag</h3>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="py-1 pr-3 font-medium">Dag</th>
                <th className="py-1 pr-3 text-right font-medium">Totaal</th>
                {a.daySources.map((s) => (
                  <th key={s} className="py-1 pr-3 text-right font-medium">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[...a.byDay].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5 pr-3 tabular-nums text-stone-700">{d.day}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{d.total}</td>
                  {a.daySources.map((s) => (
                    <td key={s} className="py-1.5 pr-3 text-right tabular-nums text-stone-700">
                      {d.perSource[s] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-stone-500">
        “Uniek” = per toestel en browser. Iemand die op gsm en laptop kijkt, telt dubbel; de
        Instagram-app heeft een eigen browser. Link in je Instagram-bio:{" "}
        <code className="text-stone-700">dateofflinehub.be/?utm_source=instagram</code>. Een toestel
        waarop je nooit inlogt uitsluiten: open daarop{" "}
        <code className="text-stone-700">dateofflinehub.be/?niet-meetellen</code>.
      </p>
    </section>
  );
}
