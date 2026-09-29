"use client";

import { Search, X } from "lucide-react";
import {
  REFINE_DATE_LABEL,
  REFINE_SORT_LABEL,
  refinementFiltersActive,
  refinementIsActive,
  type RefineDatePreset,
  type RefineSort,
  type ResultRefinement,
} from "@/lib/result-refinement";

const DATE_OPTIONS: RefineDatePreset[] = [
  "all",
  "today",
  "weekend",
  "7d",
  "30d",
  "custom",
];

const SORT_OPTIONS: RefineSort[] = ["soonest", "newest"];

export function ResultRefinementBar({
  refinement,
  baseCount,
  refinedCount,
  onChange,
  onClear,
}: {
  refinement: ResultRefinement;
  baseCount: number;
  refinedCount: number;
  onChange: (next: ResultRefinement) => void;
  onClear: () => void;
}) {
  const filtersActive = refinementFiltersActive(refinement);
  const active = refinementIsActive(refinement);

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-white px-3 py-3 sm:px-4"
      aria-label="Verfijn resultaten"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Verfijn resultaten</h2>
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <X className="size-3.5" aria-hidden />
            Wis verfijning
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative min-w-0 flex-1 sm:min-w-[14rem] sm:max-w-md">
          <span className="sr-only">Zoek in resultaten</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={refinement.q}
            onChange={(event) =>
              onChange({ ...refinement, q: event.target.value })
            }
            placeholder="Zoek in resultaten…"
            className="h-10 w-full rounded-full border border-border bg-white pr-3 pl-9 text-sm outline-none focus:border-foreground"
          />
        </label>

        <label className="flex min-w-0 items-center gap-2">
          <span className="sr-only">Datum</span>
          <select
            value={refinement.datePreset}
            onChange={(event) => {
              const datePreset = event.target.value as RefineDatePreset;
              onChange({
                ...refinement,
                datePreset,
                dateFrom: datePreset === "custom" ? refinement.dateFrom : null,
                dateTo: datePreset === "custom" ? refinement.dateTo : null,
              });
            }}
            className="h-10 max-w-full rounded-full border border-border bg-white px-3 text-sm"
            aria-label="Datum verfijnen"
          >
            {DATE_OPTIONS.map((preset) => (
              <option key={preset} value={preset}>
                {REFINE_DATE_LABEL[preset]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 items-center gap-2">
          <span className="sr-only">Sorteren</span>
          <select
            value={refinement.sort}
            onChange={(event) =>
              onChange({
                ...refinement,
                sort: event.target.value as RefineSort,
              })
            }
            className="h-10 max-w-full rounded-full border border-border bg-white px-3 text-sm"
            aria-label="Sorteren"
          >
            {SORT_OPTIONS.map((sort) => (
              <option key={sort} value={sort}>
                {REFINE_SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {refinement.datePreset === "custom" ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">
              Van
            </span>
            <input
              type="date"
              value={refinement.dateFrom ?? ""}
              onChange={(event) =>
                onChange({
                  ...refinement,
                  dateFrom: event.target.value || null,
                })
              }
              className="h-10 w-full rounded-xl border border-border px-3 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">
              Tot
            </span>
            <input
              type="date"
              value={refinement.dateTo ?? ""}
              onChange={(event) =>
                onChange({
                  ...refinement,
                  dateTo: event.target.value || null,
                })
              }
              className="h-10 w-full rounded-xl border border-border px-3 text-sm"
            />
          </label>
        </div>
      ) : null}

      <p className="mt-3 text-sm text-muted-foreground" role="status">
        {filtersActive
          ? `${refinedCount} van ${baseCount} ${baseCount === 1 ? "event" : "events"}`
          : `${refinedCount} ${refinedCount === 1 ? "event" : "events"} gevonden`}
      </p>
    </section>
  );
}
