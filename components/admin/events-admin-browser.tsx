"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ActionSubmitButton } from "@/components/ui/action-submit-button";
import { isStoredEditionCurrent } from "@/lib/event-visibility";
import type { AdminEditionTimeScope } from "@/lib/events/neon-store";

export type EventsAdminListItem = {
  id: string;
  title: string;
  slug: string;
  publicationStatus: string;
  publishedAt: string | null;
  lastCheckedAt: string | null;
  city: string | null;
  startsAt: string | null;
  endsAt: string | null;
  primarySourceUrl: string | null;
  primarySourceLabel: string | null;
  openReports: number;
};

export type AdminEventsPageResult = {
  events: EventsAdminListItem[];
  total: number;
  scope: AdminEditionTimeScope;
  limit: number;
  offset: number;
};

type Props = {
  initialPage: AdminEventsPageResult;
  loadPageAction: (input: {
    scope: AdminEditionTimeScope;
    limit: number;
    offset: number;
    search: string;
  }) => Promise<AdminEventsPageResult>;
  takeOfflineAction: (formData: FormData) => void | Promise<void>;
  publishAction: (formData: FormData) => void | Promise<void>;
};

const STATUS_FILTERS = [
  { value: "all", label: "Alle" },
  { value: "published", label: "Live" },
  { value: "queue", label: "Te publiceren" },
  { value: "offline", label: "Offline" },
] as const;

const TIME_FILTERS = [
  { value: "current", label: "Actueel" },
  { value: "past", label: "Voorbij / Archief" },
] as const;

type TimeFilter = (typeof TIME_FILTERS)[number]["value"];

const QUEUE_STATUSES = new Set([
  "draft",
  "approved",
  "under_review",
  "candidate",
]);

const PAGE_SIZE = 50;

function matchesStatusFilter(status: string, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "published") return status === "published";
  if (filter === "queue") return QUEUE_STATUSES.has(status);
  if (filter === "offline") {
    return status !== "published" && !QUEUE_STATUSES.has(status);
  }
  return true;
}

function stamp(value: string | null, length = 10): string {
  if (!value) return "—";
  return String(value).slice(0, length);
}

function statusTone(status: string): string {
  if (status === "published") return "bg-emerald-50 text-emerald-900";
  if (QUEUE_STATUSES.has(status)) return "bg-amber-50 text-amber-950";
  return "bg-stone-100 text-stone-700";
}

function toListItemFromPage(page: AdminEventsPageResult): EventsAdminListItem[] {
  return page.events;
}

/**
 * Compact Events admin list with search + status filters.
 * Actueel is the default. Voorbij/Archief pages the full history.
 */
export function EventsAdminBrowser({
  initialPage,
  loadPageAction,
  takeOfflineAction,
  publishAction,
}: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("published");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("current");
  const [page, setPage] = useState(initialPage);
  const [offset, setOffset] = useState(initialPage.offset);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (timeFilter === "current" && offset === 0 && !q.trim()) {
      setPage(initialPage);
    }
  }, [initialPage, timeFilter, offset, q]);

  function load(next: {
    scope: TimeFilter;
    offset: number;
    search: string;
  }) {
    startTransition(async () => {
      setError(null);
      try {
        const result = await loadPageAction({
          scope: next.scope,
          limit: PAGE_SIZE,
          offset: next.offset,
          search: next.search,
        });
        setPage(result);
        setOffset(result.offset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Laden mislukt");
      }
    });
  }

  function switchTime(next: TimeFilter) {
    setTimeFilter(next);
    setStatus(next === "past" ? "all" : "published");
    setOffset(0);
    load({ scope: next, offset: 0, search: q });
  }

  function submitSearch() {
    setOffset(0);
    load({ scope: timeFilter, offset: 0, search: q });
  }

  const events = toListItemFromPage(page);

  const timed = useMemo(() => {
    // Server already scoped current vs past; keep a client safety net for Actueel.
    if (timeFilter !== "current") return events;
    return events.filter((event) =>
      isStoredEditionCurrent({
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      }),
    );
  }, [events, timeFilter]);

  const counts = useMemo(() => {
    const next = { all: timed.length, published: 0, queue: 0, offline: 0 };
    for (const event of timed) {
      if (event.publicationStatus === "published") next.published += 1;
      else if (QUEUE_STATUSES.has(event.publicationStatus)) next.queue += 1;
      else next.offline += 1;
    }
    return next;
  }, [timed]);

  const filtered = useMemo(() => {
    return timed.filter((event) =>
      matchesStatusFilter(event.publicationStatus, status),
    );
  }, [timed, status]);

  const pageStart = page.total === 0 ? 0 : page.offset + 1;
  const pageEnd = Math.min(page.offset + page.events.length, page.total);
  const canPrev = page.offset > 0;
  const canNext = page.offset + page.limit < page.total;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek titel / stad / slug"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-base md:text-sm"
            aria-label="Zoek events"
          />
          <button
            type="submit"
            className="rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-stone-800"
          >
            Zoek
          </button>
        </form>
        <div className="flex flex-wrap gap-1">
          {TIME_FILTERS.map((filter) => {
            const active = timeFilter === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => switchTime(filter.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-stone-900 text-white"
                    : "border border-border bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1 sm:col-span-2">
          {STATUS_FILTERS.map((filter) => {
            const count =
              filter.value === "all"
                ? counts.all
                : filter.value === "published"
                  ? counts.published
                  : filter.value === "queue"
                    ? counts.queue
                    : counts.offline;
            const active = status === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-stone-900 text-white"
                    : "border border-border bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                {filter.label} {count}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {pending ? "Laden… · " : null}
        {filtered.length} op deze pagina · {pageStart}–{pageEnd} van {page.total}{" "}
        {timeFilter === "current" ? "actuele" : "historische"} events
      </p>
      {error ? (
        <p className="text-xs font-medium text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          Geen events in deze filter.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
          {filtered.map((event) => {
            const canPublish = QUEUE_STATUSES.has(event.publicationStatus);
            const canTakeOffline = event.publicationStatus === "published";
            return (
              <li
                key={event.id}
                className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-stone-900">
                      {event.title}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(event.publicationStatus)}`}
                    >
                      {event.publicationStatus}
                    </span>
                    {event.openReports > 0 ? (
                      <a
                        href={`#meldingen-${event.id}`}
                        className="text-[11px] font-semibold text-rose-700 underline-offset-2 hover:underline"
                      >
                        {event.openReports}× melding
                      </a>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {event.city ?? "—"} · start {stamp(event.startsAt)} ·
                    checked {stamp(event.lastCheckedAt, 16)}
                    {event.publishedAt
                      ? ` · live ${stamp(event.publishedAt)}`
                      : null}
                  </p>
                  {event.primarySourceUrl ? (
                    <a
                      href={event.primarySourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block truncate text-xs font-medium underline-offset-4 hover:underline"
                    >
                      {event.primarySourceLabel ?? "Bron"}
                    </a>
                  ) : null}
                </div>

                <div className="shrink-0">
                  {canTakeOffline ? (
                    <form
                      action={takeOfflineAction}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="editionId" value={event.id} />
                      <select
                        name="reason"
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                        defaultValue=""
                        aria-label="Reden om weg te halen"
                      >
                        <option value="">Reden…</option>
                        <option value="Hoort hier niet thuis">
                          Hoort hier niet thuis
                        </option>
                        <option value="Geen singlesevent">
                          Geen singlesevent
                        </option>
                        <option value="Duplicate">Duplicate</option>
                        <option value="Foute informatie">
                          Foute informatie
                        </option>
                        <option value="Event geannuleerd">
                          Event geannuleerd
                        </option>
                        <option value="Anders">Anders</option>
                      </select>
                      <ActionSubmitButton
                        pendingLabel="Bezig…"
                        className="rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950"
                      >
                        Halen
                      </ActionSubmitButton>
                    </form>
                  ) : canPublish ? (
                    <form action={publishAction}>
                      <input type="hidden" name="editionId" value={event.id} />
                      <ActionSubmitButton
                        pendingLabel="Bezig…"
                        className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                      >
                        Publiceer
                      </ActionSubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canPrev || pending}
          onClick={() => {
            const nextOffset = Math.max(0, page.offset - page.limit);
            load({ scope: timeFilter, offset: nextOffset, search: q });
          }}
          className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 disabled:opacity-40"
        >
          Vorige
        </button>
        <p className="text-xs text-muted-foreground">
          Pagina {Math.floor(page.offset / page.limit) + 1} van{" "}
          {Math.max(1, Math.ceil(page.total / page.limit))}
        </p>
        <button
          type="button"
          disabled={!canNext || pending}
          onClick={() => {
            const nextOffset = page.offset + page.limit;
            load({ scope: timeFilter, offset: nextOffset, search: q });
          }}
          className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 disabled:opacity-40"
        >
          Volgende
        </button>
      </div>
    </div>
  );
}
