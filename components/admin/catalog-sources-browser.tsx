"use client";

import { useMemo, useState, type ReactNode } from "react";
import { isUserSuppliedNotes } from "@/lib/discovery/user-supplied";

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

type Props = {
  sources: CatalogSourceListItem[];
  children: (filtered: CatalogSourceListItem[]) => ReactNode;
};

/**
 * Lightweight Source Map filters for 50–100 records.
 */
export function CatalogSourcesBrowser({ sources, children }: Props) {
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
      {children(filtered)}
    </div>
  );
}
