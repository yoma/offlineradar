"use client";

import { useMemo, useState } from "react";
import { isUserSuppliedNotes } from "@/lib/discovery/user-supplied";
import { SourceRefreshControls } from "@/components/admin/source-refresh-controls";
import type { SourceScheduleState } from "@/lib/source-refresh/store";
import type { SourceRefreshRunRecord } from "@/lib/source-refresh/types";

export type CatalogSourceListItem = {
  id: string;
  name: string;
  officialUrl: string;
  sourceKind: string;
  sourceType: string;
  regions: string[];
  formats: string[];
  status: string;
  lastCheckedAt: string | null;
  notes: string | null;
  editionCount?: number;
};

export type CatalogSourceRefreshMeta = {
  supported: boolean;
  latestRun: SourceRefreshRunRecord | null;
  schedule: SourceScheduleState | null;
  nextRefreshAt: string | null;
  consecutiveFailures: number;
};

type Props = {
  sources: CatalogSourceListItem[];
  /** Serializable per-source refresh UI state (no Maps / no render props). */
  refreshBySourceId: Record<string, CatalogSourceRefreshMeta>;
  /** Server action for status/notes update. */
  updateAction: (formData: FormData) => void | Promise<void>;
};

/**
 * Lightweight Source Map filters for 50–100 records.
 * Renders cards itself so the server page never passes a function into a client component.
 */
export function CatalogSourcesBrowser({
  sources,
  refreshBySourceId,
  updateAction,
}: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [region, setRegion] = useState("all");
  const [format, setFormat] = useState("all");
  const [origin, setOrigin] = useState("all");

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources) for (const r of s.regions) set.add(r);
    return [...set].sort((a, b) => a.localeCompare(b, "nl"));
  }, [sources]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources) for (const f of s.formats) set.add(f);
    return [...set].sort((a, b) => a.localeCompare(b, "nl"));
  }, [sources]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sources.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (region !== "all" && !s.regions.includes(region)) return false;
      if (format !== "all" && !s.formats.includes(format)) return false;
      if (origin === "user" && !isUserSuppliedNotes(s.notes)) return false;
      if (origin === "other" && isUserSuppliedNotes(s.notes)) return false;
      if (!needle) return true;
      const hay = [
        s.name,
        s.officialUrl,
        s.notes ?? "",
        s.regions.join(" "),
        s.formats.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [sources, q, status, region, format, origin]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek naam / url / note"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          aria-label="Zoek bronnen"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          aria-label="Filter status"
        >
          <option value="all">Alle statussen</option>
          <option value="active">active</option>
          <option value="promising">promising</option>
          <option value="low_yield">low_yield</option>
          <option value="inactive">inactive</option>
        </select>
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          aria-label="Filter herkomst"
        >
          <option value="all">Alle herkomsten</option>
          <option value="user">User supplied</option>
          <option value="other">Overige</option>
        </select>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          aria-label="Filter regio"
        >
          <option value="all">Alle regio’s</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          aria-label="Filter format"
        >
          <option value="all">Alle formats</option>
          {formats.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} van {sources.length} bronnen
        {origin === "user" ? " · Door Youri aangebracht" : null}
      </p>
      <ul className="space-y-3">
        {filtered.map((source) => {
          const refresh = refreshBySourceId[source.id] ?? {
            supported: false,
            latestRun: null,
            schedule: null,
            nextRefreshAt: null,
            consecutiveFailures: 0,
          };
          return (
            <li
              key={source.id}
              className="rounded-xl border border-border bg-background px-4 py-4"
            >
              <div className="space-y-2">
                <p className="font-semibold">
                  {source.name}
                  {source.notes &&
                  (source.notes.includes("discovered_by=user") ||
                    /door youri aangebracht/i.test(source.notes)) ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      · Door Youri aangebracht
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {source.sourceKind} · {source.sourceType} · {source.status}
                  {source.editionCount != null
                    ? ` · ${source.editionCount} editions`
                    : null}
                </p>
                <a
                  href={source.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium underline-offset-4 hover:underline"
                >
                  {source.officialUrl}
                </a>
                <p className="text-sm text-muted-foreground">
                  Regio: {source.regions.join(", ") || "—"} · Formats:{" "}
                  {source.formats.join(", ") || "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Laatst gecontroleerd:{" "}
                  {source.lastCheckedAt?.slice(0, 16) ?? "onbekend"}
                </p>
                {source.notes ? (
                  <p className="text-sm text-muted-foreground">{source.notes}</p>
                ) : null}
                <SourceRefreshControls
                  catalogSourceId={source.id}
                  supported={refresh.supported}
                  latestRun={refresh.latestRun}
                  schedule={refresh.schedule}
                  nextRefreshAt={refresh.nextRefreshAt}
                  consecutiveFailures={refresh.consecutiveFailures}
                />
                <form
                  action={updateAction}
                  className="flex flex-wrap items-end gap-2 pt-1"
                >
                  <input type="hidden" name="sourceId" value={source.id} />
                  <select
                    name="status"
                    defaultValue={source.status}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="active">active</option>
                    <option value="promising">promising</option>
                    <option value="low_yield">low_yield</option>
                    <option value="inactive">inactive</option>
                  </select>
                  <input
                    name="notes"
                    defaultValue={source.notes ?? ""}
                    placeholder="Note"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" name="touchChecked" value="1" />
                    checked_at nu
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    Update
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
