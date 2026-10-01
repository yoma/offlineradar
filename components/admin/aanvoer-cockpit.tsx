"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AanvoerClient } from "@/app/interne-aanvoer/aanvoer-client";
import {
  updateAanvoerCandidateStatusAction,
  updateAanvoerSourceAction,
} from "@/app/interne-aanvoer/actions";
import {
  ADMIN_STATUS_LABEL,
  type AdminQueueStatus,
} from "@/lib/aanvoer/admin-status";
import {
  SOURCE_STATUS_LABEL,
  type AanvoerCockpitData,
  type CockpitCandidateRow,
  type CockpitSourceRow,
} from "@/lib/aanvoer/cockpit-data";

type TabId =
  | "nieuw"
  | "klaar"
  | "controle"
  | "toegevoegd"
  | "niet_toegevoegd"
  | "bronnen";

const TABS: { id: TabId; label: string }[] = [
  { id: "nieuw", label: "Nieuw event" },
  { id: "klaar", label: "Klaar om toe te voegen" },
  { id: "controle", label: "Controle nodig" },
  { id: "toegevoegd", label: "Toegevoegd" },
  { id: "niet_toegevoegd", label: "Niet toegevoegd" },
  { id: "bronnen", label: "Bronnen" },
];

function tabFromParam(raw: string | null, initial: TabId | "kandidaten" | "te_bekijken"): TabId {
  if (
    raw === "bronnen" ||
    raw === "klaar" ||
    raw === "controle" ||
    raw === "toegevoegd" ||
    raw === "niet_toegevoegd" ||
    raw === "nieuw"
  ) {
    return raw;
  }
  // Legacy deep-links
  if (raw === "te_bekijken" || raw === "kandidaten") return "controle";
  if (initial === "kandidaten" || initial === "te_bekijken") return "controle";
  return initial as TabId;
}

const PAGE_SIZE = 50;

function formatDate(value: string | null | undefined): string {
  if (!value) return "Datum onbekend";
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "Datum onbekend";
}

function sortKey(value: string | null | undefined | Date): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function typeLabel(type: CockpitSourceRow["intakeSourceType"]): string {
  switch (type) {
    case "website":
      return "Website";
    case "social":
      return "Social";
    case "ticket":
      return "Ticket";
    case "handmatig":
      return "Handmatig";
    default:
      return "Onbekend";
  }
}

export function AanvoerCockpit({
  data,
  initialTab = "nieuw",
  highlightSourceId = null,
  highlightEditionId = null,
}: {
  data: AanvoerCockpitData;
  initialTab?: TabId | "kandidaten" | "te_bekijken";
  highlightSourceId?: string | null;
  highlightEditionId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = tabFromParam(searchParams.get("tab"), initialTab);

  const [highlightSource, setHighlightSource] = useState(highlightSourceId);
  const [highlightEdition, setHighlightEdition] = useState(highlightEditionId);

  function setTab(next: TabId, opts?: { sourceId?: string; editionId?: string; refresh?: boolean }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    if (opts?.sourceId) {
      params.set("sourceId", opts.sourceId);
      setHighlightSource(opts.sourceId);
    } else {
      params.delete("sourceId");
    }
    if (opts?.editionId) {
      params.set("editionId", opts.editionId);
      setHighlightEdition(opts.editionId);
    } else {
      params.delete("editionId");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    if (opts?.refresh !== false && (opts?.sourceId || opts?.editionId)) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Klaar om toe te voegen", value: data.counts.klaar },
          { label: "Controle nodig", value: data.counts.controle },
          { label: "Toegevoegd", value: data.counts.added },
          { label: "Bronnen", value: data.counts.sources },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/60 bg-white/80 px-3 py-3 shadow-sm backdrop-blur"
          >
            <p className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
              {item.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
              {item.value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500">
        Door jou aangebracht: {data.counts.userSupplied} bronnen
      </p>

      <div className="overflow-x-auto">
        <div
          className="inline-flex min-w-full gap-1 rounded-2xl border border-stone-200/80 bg-white/70 p-1 shadow-sm backdrop-blur sm:min-w-0"
          role="tablist"
          aria-label="Aanvoer tabs"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-stone-900 text-white shadow"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "nieuw" ? (
        <AanvoerClient
          onSavedSource={(sourceId) => setTab("bronnen", { sourceId })}
          onSavedCandidate={(editionId) =>
            setTab("controle", { editionId })
          }
          onApprovedPublished={(editionId) =>
            setTab("toegevoegd", { editionId })
          }
        />
      ) : null}
      {tab === "bronnen" ? (
        <SourcesPanel
          key={highlightSource ?? "bronnen"}
          sources={data.sources}
          highlightId={highlightSource}
        />
      ) : null}
      {tab === "klaar" ||
      tab === "controle" ||
      tab === "toegevoegd" ||
      tab === "niet_toegevoegd" ? (
        <EventsPanel
          key={`${tab}-${highlightEdition ?? "list"}`}
          candidates={data.candidates}
          highlightId={highlightEdition}
          bucket={tab}
        />
      ) : null}
    </div>
  );
}

function SourcesPanel({
  sources,
  highlightId,
}: {
  sources: CockpitSourceRow[];
  highlightId: string | null;
}) {
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(highlightId);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`source-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = sources.filter((s) => {
      if (origin === "user" && !s.userSupplied) return false;
      if (origin === "auto" && s.userSupplied) return false;
      if (status !== "all" && s.status !== status) return false;
      if (type !== "all" && s.intakeSourceType !== type) return false;
      if (!needle) return true;
      const hay = [
        s.name,
        s.officialUrl,
        s.domain,
        s.notes ?? "",
        s.sourceType,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "nl");
      if (sort === "checked") {
        return sortKey(b.lastCheckedAt).localeCompare(sortKey(a.lastCheckedAt));
      }
      return sortKey(b.createdAt).localeCompare(sortKey(a.createdAt));
    });
    return list;
  }, [sources, q, origin, status, type, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <p className="text-sm text-stone-600">
        User-supplied bronnen blijven mandatory input voor toekomstige discovery.
        Ze verdwijnen niet als een scan ze tijdelijk niet opnieuw vindt.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Zoek bronnen…"
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        />
        <select
          value={origin}
          onChange={(e) => {
            setOrigin(e.target.value);
            setPage(0);
          }}
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        >
          <option value="all">Alle herkomsten</option>
          <option value="user">Door jou aangebracht</option>
          <option value="auto">Automatisch gevonden</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        >
          <option value="all">Alle statussen</option>
          <option value="active">Actief</option>
          <option value="promising">Promising</option>
          <option value="low_yield">Low yield</option>
          <option value="inactive">Inactief</option>
        </select>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(0);
          }}
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        >
          <option value="all">Alle types</option>
          <option value="website">Website</option>
          <option value="social">Social</option>
          <option value="ticket">Ticket</option>
          <option value="handmatig">Handmatig</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">
          {filtered.length} bronnen · gesorteerd op{" "}
          {sort === "newest"
            ? "laatst toegevoegd"
            : sort === "checked"
              ? "laatst gecontroleerd"
              : "naam"}
        </p>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-9 rounded-full border border-stone-200 bg-white px-3 text-sm"
        >
          <option value="newest">Laatst toegevoegd</option>
          <option value="checked">Laatst gecontroleerd</option>
          <option value="name">Naam A–Z</option>
        </select>
      </div>

      <div className="space-y-3">
        {pageItems.map((source) => {
          const open = expanded === source.id;
          const highlighted = highlightId === source.id;
          return (
            <article
              key={source.id}
              id={`source-${source.id}`}
              className={`rounded-2xl border bg-white/90 p-4 shadow-sm transition ${
                highlighted
                  ? "border-rose-300 ring-2 ring-rose-200"
                  : "border-stone-200/80"
              }`}
            >
              <button
                type="button"
                className="flex w-full flex-col gap-2 text-left"
                onClick={() => setExpanded(open ? null : source.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-stone-900">
                      {source.name}
                    </h3>
                    <p className="mt-0.5 break-all text-xs text-stone-500">
                      {source.domain}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {source.userSupplied ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                        Door jou aangebracht
                      </span>
                    ) : null}
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {typeLabel(source.intakeSourceType)}
                    </span>
                    <span className="rounded-full bg-stone-900/5 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {SOURCE_STATUS_LABEL[source.status]}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-stone-600">
                  {source.futureEventCount} toekomstige events · toegevoegd{" "}
                  {formatDate(source.createdAt)} · check{" "}
                  {formatDate(source.lastCheckedAt)}
                </p>
                {source.notes ? (
                  <p className="line-clamp-2 text-xs text-stone-500">
                    {source.notes}
                  </p>
                ) : null}
              </button>

              {open ? (
                <div className="mt-4 space-y-4 border-t border-stone-100 pt-4">
                  <p className="break-all text-sm">
                    <a
                      href={source.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-stone-900 underline-offset-4 hover:underline"
                    >
                      {source.officialUrl}
                    </a>
                  </p>
                  {source.notes ? (
                    <p className="whitespace-pre-wrap text-sm text-stone-600">
                      {source.notes}
                    </p>
                  ) : (
                    <p className="text-sm text-stone-400">Geen notes.</p>
                  )}

                  {source.linkedFutureEvents.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {source.linkedFutureEvents.slice(0, 8).map((ev) => (
                        <li key={ev.id} className="text-stone-700">
                          {formatDate(ev.startsAt)} · {ev.title} · {ev.city} (
                          {ev.publicationStatus})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-stone-400">
                      Geen gekoppelde toekomstige events.
                    </p>
                  )}

                  <form
                    className="space-y-3 rounded-xl bg-stone-50 p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      startTransition(async () => {
                        await updateAanvoerSourceAction(formData);
                      });
                    }}
                  >
                    <input type="hidden" name="sourceId" value={source.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm">
                        <span className="mb-1 block font-medium">Status</span>
                        <select
                          name="status"
                          defaultValue={source.status}
                          className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3"
                        >
                          <option value="active">Actief</option>
                          <option value="promising">Promising</option>
                          <option value="low_yield">Low yield</option>
                          <option value="inactive">Inactief</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium">Type</span>
                        <select
                          name="sourceType"
                          defaultValue={source.sourceType}
                          className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3"
                        >
                          <option value="organizer">Website/organizer</option>
                          <option value="community">Social/community</option>
                          <option value="ticket_platform">Ticket</option>
                          <option value="other">Handmatig/other</option>
                          <option value="discovery_platform">Discovery</option>
                          <option value="event_series">Event series</option>
                          <option value="venue_with_singles_program">
                            Venue singles
                          </option>
                        </select>
                      </label>
                    </div>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Notes</span>
                      <textarea
                        name="notes"
                        defaultValue={source.notes ?? ""}
                        rows={3}
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={pending}
                        className="h-10 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Bewaar wijzigingen
                      </button>
                      <button
                        type="submit"
                        name="markReview"
                        value="1"
                        disabled={pending}
                        className="h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 disabled:opacity-60"
                        title="Zet review-markering; vernieuwt geen freshness"
                      >
                        Opnieuw controleren (markeer)
                      </button>
                    </div>
                    <p className="text-xs text-stone-500">
                      “Opnieuw controleren” vernieuwt geen last_checked_at.
                    </p>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-full border border-stone-200 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Vorige
          </button>
          <p className="text-sm text-stone-500">
            Pagina {page + 1} / {pageCount}
          </p>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="rounded-full border border-stone-200 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Volgende
          </button>
        </div>
      ) : null}
    </section>
  );
}

function bucketForAdmin(
  status: AdminQueueStatus,
): "klaar" | "controle" | "toegevoegd" | "niet_toegevoegd" {
  if (status === "klaar_om_toe_te_voegen") return "klaar";
  if (status === "controle_nodig") return "controle";
  if (status === "toegevoegd") return "toegevoegd";
  return "niet_toegevoegd";
}

function EventsPanel({
  candidates,
  highlightId,
  bucket,
}: {
  candidates: CockpitCandidateRow[];
  highlightId: string | null;
  bucket: "klaar" | "controle" | "toegevoegd" | "niet_toegevoegd";
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(highlightId);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`candidate-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => {
      if (bucketForAdmin(c.adminStatus) !== bucket) return false;
      if (!needle) return true;
      const hay = [
        c.title,
        c.organizerName ?? "",
        c.city,
        c.sourceUrl ?? "",
        c.blockReason ?? "",
        c.internalNotes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [candidates, q, bucket]);

  const emptyLabel =
    bucket === "toegevoegd"
      ? "Nog geen live events via deze aanvoer."
      : bucket === "niet_toegevoegd"
        ? "Nog geen afgewezen items."
        : bucket === "klaar"
          ? "Niets klaar om toe te voegen."
          : "Niets dat controle nodig heeft.";

  function runIntent(editionId: string, intent: string) {
    setActionError(null);
    const formData = new FormData();
    formData.set("editionId", editionId);
    formData.set("intent", intent);
    startTransition(async () => {
      const result = await updateAanvoerCandidateStatusAction(formData);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Zoek events…"
        className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm sm:max-w-md"
      />

      <p className="text-sm text-stone-500">
        {filtered.length} {filtered.length === 1 ? "event" : "events"}
      </p>
      {actionError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {actionError}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 py-6 text-sm text-stone-600">
          {emptyLabel}
        </p>
      ) : null}

      <div className="space-y-3">
        {filtered.map((c) => {
          const open = expanded === c.id;
          const highlighted = highlightId === c.id;
          return (
            <article
              key={c.id}
              id={`candidate-${c.id}`}
              className={`rounded-2xl border bg-white/90 p-4 shadow-sm ${
                highlighted
                  ? "border-rose-300 ring-2 ring-rose-200"
                  : "border-stone-200/80"
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpanded(open ? null : c.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-stone-900">{c.title}</h3>
                    <p className="mt-1 text-sm text-stone-600">
                      {c.organizerName ?? "Onbekende organisator"} · {c.city} ·{" "}
                      {formatDate(c.displayDate)}
                    </p>
                    {c.blockReason && bucket === "controle" ? (
                      <p className="mt-1 text-sm font-medium text-amber-800">
                        {c.blockReason}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                    {ADMIN_STATUS_LABEL[c.adminStatus]}
                  </span>
                </div>
              </button>

              {open ? (
                <div className="mt-4 space-y-3 border-t border-stone-100 pt-4 text-sm">
                  {bucket === "klaar" ? (
                    <div className="space-y-1 text-emerald-800">
                      <p>{c.checks.singles ? "✓" : "?"} Singlesevent bevestigd</p>
                      <p>{c.checks.date ? "✓" : "?"} Datum bevestigd</p>
                      <p>{c.checks.location ? "✓" : "?"} Locatie bevestigd</p>
                      <p>{c.checks.source ? "✓" : "?"} Bron bevestigd</p>
                    </div>
                  ) : null}

                  {bucket === "controle" && c.blockReason ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      {c.blockReason}
                    </p>
                  ) : null}

                  {c.duplicateSlug ? (
                    <p className="text-sm text-stone-700">
                      Dit event lijkt al in OfflineRadar te staan.{" "}
                      <Link
                        href={`/event/${c.duplicateSlug}`}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        Bekijk bestaand event
                      </Link>
                    </p>
                  ) : null}

                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-stone-500">Prijs</dt>
                      <dd>{c.priceNote || "onbekend"}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">Leeftijd</dt>
                      <dd>
                        {c.minAge ?? "?"}-{c.maxAge ?? "?"}
                      </dd>
                    </div>
                  </dl>
                  {c.sourceUrl ? (
                    <p className="break-all text-xs text-stone-500">
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-4 hover:underline"
                      >
                        {c.sourceUrl}
                      </a>
                    </p>
                  ) : null}
                  {c.hasScreenshot ? (
                    <p className="text-xs text-stone-500">
                      Screenshot bewaard als privé-evidence.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {bucket === "klaar" ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          className="h-10 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
                          onClick={() => runIntent(c.id, "toevoegen")}
                        >
                          Toevoegen aan OfflineRadar
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 disabled:opacity-60"
                          onClick={() => runIntent(c.id, "niet_toegevoegd")}
                        >
                          Niet toevoegen
                        </button>
                      </>
                    ) : null}

                    {bucket === "controle" ? (
                      <>
                        {c.duplicateSlug ? (
                          <Link
                            href={`/event/${c.duplicateSlug}`}
                            className="inline-flex h-10 items-center rounded-full bg-stone-900 px-4 text-sm font-semibold text-white"
                          >
                            Bekijk bestaand event
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending}
                          className="h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 disabled:opacity-60"
                          onClick={() => runIntent(c.id, "opnieuw_controleren")}
                        >
                          Opnieuw laten controleren
                        </button>
                        <Link
                          href="/interne-events"
                          className="inline-flex h-10 items-center rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700"
                        >
                          Aanpassen
                        </Link>
                        <button
                          type="button"
                          disabled={pending}
                          className="h-10 rounded-full px-4 text-sm font-medium text-stone-500 underline-offset-4 hover:underline disabled:opacity-60"
                          onClick={() => runIntent(c.id, "niet_toegevoegd")}
                        >
                          Niet toevoegen
                        </button>
                        {c.duplicateSlug ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="h-10 rounded-full px-4 text-xs font-medium text-stone-400 underline-offset-4 hover:underline disabled:opacity-60"
                            onClick={() => runIntent(c.id, "toevoegen")}
                          >
                            Toch als nieuw toevoegen
                          </button>
                        ) : null}
                      </>
                    ) : null}

                    {bucket === "toegevoegd" ? (
                      <Link
                        href={`/event/${c.slug}`}
                        className="inline-flex h-10 items-center rounded-full bg-stone-900 px-4 text-sm font-semibold text-white"
                      >
                        Bekijk event
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
