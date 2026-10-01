"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import {
  FOLLOWED_ORGANIZERS_FILTER,
  REFINE_DATE_LABEL,
  REFINE_SORT_LABEL,
  organizerSlugsFromParam,
  refinementFiltersActive,
  refinementIsActive,
  type OrganizerFilterOption,
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

const selectClassName =
  "h-10 w-full min-w-0 rounded-full border border-border bg-white px-3 text-sm outline-none focus:border-foreground";

export function ResultRefinementBar({
  refinement,
  baseCount,
  refinedCount,
  organizerOptions,
  isLoggedIn = false,
  followedCount = 0,
  onChange,
  onClear,
  onClearOrganizer,
}: {
  refinement: ResultRefinement;
  baseCount: number;
  refinedCount: number;
  organizerOptions: OrganizerFilterOption[];
  isLoggedIn?: boolean;
  followedCount?: number;
  onChange: (next: ResultRefinement) => void;
  onClear: () => void;
  onClearOrganizer?: () => void;
}) {
  const filtersActive = refinementFiltersActive(refinement);
  const active = refinementIsActive(refinement);
  const organizerActive = Boolean(refinement.organizer.trim());
  const noOrganizerHits = organizerActive && refinedCount === 0;
  const selectedSlugs = organizerSlugsFromParam(refinement.organizer);
  const followedSelected =
    refinement.organizer === FOLLOWED_ORGANIZERS_FILTER;
  const multiOrganizer = selectedSlugs.length > 1;
  const selectValue = multiOrganizer
    ? ""
    : followedSelected
      ? FOLLOWED_ORGANIZERS_FILTER
      : selectedSlugs[0] ?? "";
  const nameBySlug = new Map(
    organizerOptions.map((org) => [org.slug, org.name] as const),
  );
  const lastTrackedQ = useRef("");

  useEffect(() => {
    const q = refinement.q.trim().toLowerCase();
    if (q.length < 2) return;
    if (q.includes("@")) return;
    const handle = window.setTimeout(() => {
      if (lastTrackedQ.current === q) return;
      lastTrackedQ.current = q;
      track("discovery_search", { q, source: "result_refinement" });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [refinement.q]);

  function removeOrganizerSlug(slug: string) {
    const next = selectedSlugs.filter((item) => item !== slug).join(",");
    onChange({ ...refinement, organizer: next });
  }

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-white px-3 py-3 sm:px-4"
      aria-label="Verfijn resultaten"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Verfijn resultaten
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Zoek op event of organisator. Gekozen organisatoren wis je via de
            pillen.
          </p>
        </div>
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

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(9rem,0.7fr)_minmax(10rem,0.9fr)_minmax(9rem,0.7fr)] lg:items-center">
        <label className="relative min-w-0 sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Zoek op event, organisator of plaats</span>
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
            placeholder="Zoek op event, organisator of plaats…"
            className="h-10 w-full rounded-full border border-border bg-white pr-3 pl-9 text-sm outline-none focus:border-foreground"
          />
        </label>

        <label className="min-w-0">
          <span className="sr-only">Datum</span>
          <select
            value={refinement.datePreset}
            onChange={(event) => {
              const datePreset = event.target.value as RefineDatePreset;
              track("filter_change", {
                datePreset,
                source: "result_refinement",
              });
              onChange({
                ...refinement,
                datePreset,
                dateFrom: datePreset === "custom" ? refinement.dateFrom : null,
                dateTo: datePreset === "custom" ? refinement.dateTo : null,
              });
            }}
            className={selectClassName}
            aria-label="Datum verfijnen"
          >
            {DATE_OPTIONS.map((preset) => (
              <option key={preset} value={preset}>
                {REFINE_DATE_LABEL[preset]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0">
          <span className="sr-only">Organisator</span>
          <select
            value={selectValue}
            onChange={(event) => {
              track("filter_change", {
                organizer: event.target.value ? "set" : "cleared",
                source: "result_refinement",
              });
              onChange({ ...refinement, organizer: event.target.value });
            }}
            className={selectClassName}
            aria-label="Organisator"
          >
            <option value="">Alle organisatoren</option>
            {isLoggedIn ? (
              <option value={FOLLOWED_ORGANIZERS_FILTER}>
                Organisatoren die ik volg
                {followedCount > 0 ? ` (${followedCount})` : ""}
              </option>
            ) : (
              <option value={FOLLOWED_ORGANIZERS_FILTER} disabled>
                Organisatoren die ik volg (log in)
              </option>
            )}
            {organizerOptions.map((org) => (
              <option key={org.id} value={org.slug}>
                {org.name}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0">
          <span className="sr-only">Sorteren</span>
          <select
            value={refinement.sort}
            onChange={(event) =>
              onChange({
                ...refinement,
                sort: event.target.value as RefineSort,
              })
            }
            className={selectClassName}
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

      {selectedSlugs.length > 0 || followedSelected ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {followedSelected ? (
            <button
              type="button"
              onClick={() => onChange({ ...refinement, organizer: "" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/25 bg-secondary/40 px-3 py-1.5 text-sm font-medium hover:border-foreground"
              aria-label="Organisatoren die ik volg verwijderen"
            >
              Organisatoren die ik volg
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
          {selectedSlugs.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => removeOrganizerSlug(slug)}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/25 bg-secondary/40 px-3 py-1.5 text-sm font-medium hover:border-foreground"
              aria-label={`${nameBySlug.get(slug) ?? slug} verwijderen`}
            >
              {nameBySlug.get(slug) ?? slug}
              <X className="size-3.5" aria-hidden />
            </button>
          ))}
          {onClearOrganizer ? (
            <button
              type="button"
              onClick={onClearOrganizer}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Wis organisatoren
            </button>
          ) : null}
        </div>
      ) : null}

      {!isLoggedIn && refinement.organizer === FOLLOWED_ORGANIZERS_FILTER ? (
        <p className="mt-2 text-sm text-muted-foreground">
          <Link
            href="/inloggen?callbackUrl=/ontdek"
            className="font-medium underline-offset-4 hover:underline"
          >
            Log in
          </Link>{" "}
          om organisatoren te volgen.
        </p>
      ) : null}

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

      {noOrganizerHits ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>
            {refinement.organizer === FOLLOWED_ORGANIZERS_FILTER
              ? "Geen events van organisatoren die je volgt binnen je huidige filters."
              : "Geen events gevonden van deze organisator binnen je huidige filters."}
          </p>
          {onClearOrganizer ? (
            <button
              type="button"
              onClick={onClearOrganizer}
              className="mt-2 font-semibold underline-offset-4 hover:underline"
            >
              Wis organisatorfilter
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {filtersActive
            ? `${refinedCount} van ${baseCount} ${baseCount === 1 ? "event" : "events"}`
            : `${refinedCount} ${refinedCount === 1 ? "event" : "events"} gevonden`}
        </p>
      )}
    </section>
  );
}
