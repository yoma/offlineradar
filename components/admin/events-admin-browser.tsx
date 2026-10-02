"use client";

import { useMemo, useState } from "react";

export type EventsAdminListItem = {
  id: string;
  title: string;
  slug: string;
  publicationStatus: string;
  publishedAt: string | null;
  lastCheckedAt: string | null;
  city: string | null;
  startsAt: string | null;
  primarySourceUrl: string | null;
  primarySourceLabel: string | null;
  openReports: number;
};

type Props = {
  events: EventsAdminListItem[];
  takeOfflineAction: (formData: FormData) => void | Promise<void>;
  publishAction: (formData: FormData) => void | Promise<void>;
};

const STATUS_FILTERS = [
  { value: "all", label: "Alle" },
  { value: "published", label: "Live" },
  { value: "queue", label: "Te publiceren" },
  { value: "offline", label: "Offline" },
] as const;

const QUEUE_STATUSES = new Set([
  "draft",
  "approved",
  "under_review",
  "candidate",
]);

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

/**
 * Compact Events admin list with search + status filters.
 * Keeps actions on the client so the server page stays serializable.
 */
export function EventsAdminBrowser({
  events,
  takeOfflineAction,
  publishAction,
}: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("queue");

  const counts = useMemo(() => {
    const next = { all: events.length, published: 0, queue: 0, offline: 0 };
    for (const event of events) {
      if (event.publicationStatus === "published") next.published += 1;
      else if (QUEUE_STATUSES.has(event.publicationStatus)) next.queue += 1;
      else next.offline += 1;
    }
    return next;
  }, [events]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((event) => {
      if (!matchesStatusFilter(event.publicationStatus, status)) return false;
      if (!needle) return true;
      const hay = [
        event.title,
        event.slug,
        event.city ?? "",
        event.primarySourceLabel ?? "",
        event.publicationStatus,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [events, q, status]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek titel / stad / slug"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          aria-label="Zoek events"
        />
        <div className="flex flex-wrap gap-1">
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
        {filtered.length} van {events.length} events
        {status === "queue" ? " · standaard: te publiceren" : null}
      </p>

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
                      <button
                        type="submit"
                        className="rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950"
                      >
                        Halen
                      </button>
                    </form>
                  ) : canPublish ? (
                    <form action={publishAction}>
                      <input type="hidden" name="editionId" value={event.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                      >
                        Publiceer
                      </button>
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
    </div>
  );
}
