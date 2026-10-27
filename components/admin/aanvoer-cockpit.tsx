"use client";

import dynamic from "next/dynamic";
import { PendingContent } from "@/components/ui/pending";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AanvoerClient } from "@/app/interne-aanvoer/aanvoer-client";
import {
  addSourceByUrlAction,
  bulkPublishAanvoerCandidatesAction,
  patchAanvoerCandidateFieldsAction,
  updateAanvoerCandidateStatusAction,
  pasteInfoOntoAandachtCandidateAction,
  scanSourceNowAction,
  updateSourceFollowAction,
} from "@/app/interne-aanvoer/actions";
import { takeEventOfflineAction } from "@/app/interne-events/actions";
import {
  ADMIN_STATUS_LABEL,
  type AdminQueueStatus,
} from "@/lib/aanvoer/admin-status";
import {
  ORIGIN_LABEL,
  type AanvoerCockpitData,
  type CockpitCandidateRow,
  type CockpitSourceRow,
} from "@/lib/aanvoer/cockpit-data";
import { displayEventTitle } from "@/lib/aanvoer/display-title";
import type { SourceFollowStatus } from "@/lib/aanvoer/source-follow";
import { INTAKE_MAX_TEXT_CHARS } from "@/lib/aanvoer/types";
import { isWeakLocationCity } from "@/lib/geo-cities";
import {
  publicImageKindLabel,
  resolvePublicEventImage,
} from "@/lib/image-compatibility";

const AdminChatPanel = dynamic(
  () =>
    import("@/components/admin/admin-chat-panel").then((m) => m.AdminChatPanel),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-stone-500">Assistent laden…</p>
    ),
  },
);

type TabId =
  | "nieuw"
  | "aandacht"
  | "toegevoegd"
  | "niet_toegevoegd"
  | "bronnen";

const TABS: { id: TabId; label: string }[] = [
  { id: "nieuw", label: "Nieuw" },
  { id: "aandacht", label: "Te doen" },
  { id: "toegevoegd", label: "Gepubliceerd" },
  { id: "bronnen", label: "Bronnen" },
  { id: "niet_toegevoegd", label: "Afgewezen" },
];

function tabFromParam(
  raw: string | null,
  initial: TabId | "klaar" | "controle" | "kandidaten" | "te_bekijken",
): TabId {
  if (
    raw === "bronnen" ||
    raw === "aandacht" ||
    raw === "toegevoegd" ||
    raw === "niet_toegevoegd" ||
    raw === "nieuw"
  ) {
    return raw;
  }
  // Legacy deep-links → aandacht
  if (
    raw === "klaar" ||
    raw === "controle" ||
    raw === "te_bekijken" ||
    raw === "kandidaten"
  ) {
    return "aandacht";
  }
  if (
    initial === "klaar" ||
    initial === "controle" ||
    initial === "kandidaten" ||
    initial === "te_bekijken"
  ) {
    return "aandacht";
  }
  return initial as TabId;
}

const PAGE_SIZE = 50;

const REMOVE_REASONS = [
  "Hoort hier niet thuis",
  "Geen singlesevent",
  "Duplicate",
  "Foute informatie",
  "Event geannuleerd",
  "Anders",
] as const;

function formatDateNl(value: string | null | undefined): string {
  if (!value) return "Datum onbekend";
  const d = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Datum onbekend";
  try {
    return new Intl.DateTimeFormat("nl-BE", {
      day: "numeric",
      month: "long",
    }).format(new Date(`${d}T12:00:00`));
  } catch {
    return d;
  }
}

function formatAge(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} jaar`;
  if (min != null) return `vanaf ${min} jaar`;
  return `tot ${max} jaar`;
}

function formatPrice(c: CockpitCandidateRow): string {
  if (c.priceAmount != null && Number.isFinite(c.priceAmount)) {
    const cur = c.priceCurrency === "EUR" || !c.priceCurrency ? "€" : "";
    return `${cur}${c.priceAmount}`;
  }
  if (c.priceNote?.trim()) return c.priceNote.trim();
  return "Prijs onbekend";
}

function sortKey(value: string | null | undefined | Date): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function StatusBadge({ status }: { status: AdminQueueStatus }) {
  if (status === "toegevoegd") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
        ✓ Toegevoegd
      </span>
    );
  }
  if (status === "niet_toegevoegd") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-800">
        ✕ Niet toegevoegd
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
      ⚠ Jouw aandacht nodig
    </span>
  );
}

export function AanvoerCockpit({
  data,
  initialTab = "nieuw",
  highlightSourceId = null,
  highlightEditionId = null,
  notice = null,
}: {
  data: AanvoerCockpitData;
  initialTab?: TabId | "klaar" | "controle" | "kandidaten" | "te_bekijken";
  highlightSourceId?: string | null;
  highlightEditionId?: string | null;
  /** Rendered right under the tab menu (e.g. the nightly-check banner). */
  notice?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = tabFromParam(searchParams.get("tab"), initialTab);

  const [highlightSource, setHighlightSource] = useState(highlightSourceId);
  const [highlightEdition, setHighlightEdition] = useState(highlightEditionId);

  function setTab(
    next: TabId,
    opts?: { sourceId?: string; editionId?: string; refresh?: boolean },
  ) {
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
      <nav
        aria-label="Aanvoer menu"
        className="mobile-scroll-x -mx-1 px-1 pb-1"
      >
        <div
          className="flex min-w-max gap-1.5 rounded-2xl border border-stone-300/80 bg-white p-1.5 shadow-md sm:min-w-0"
          role="tablist"
          aria-label="Aanvoer tabs"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            const count =
              item.id === "aandacht"
                ? data.counts.aandacht
                : item.id === "toegevoegd"
                  ? data.counts.added
                  : item.id === "niet_toegevoegd"
                    ? data.counts.dismissed
                    : item.id === "bronnen"
                      ? data.counts.sources
                      : null;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition sm:flex-1 ${
                  active
                    ? "bg-stone-900 text-white shadow"
                    : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {item.label}
                {count != null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {notice ? <div className="[&>*]:mb-0">{notice}</div> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Klaar voor publicatie", value: data.counts.klaar },
          { label: "Nakijken", value: data.counts.controle },
          { label: "Gepubliceerd", value: data.counts.added },
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

      {data.autoPublishedIds.length > 0 ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {data.autoPublishedIds.length} event
          {data.autoPublishedIds.length === 1 ? "" : "s"} automatisch
          toegevoegd (gate geslaagd).
        </p>
      ) : null}

      <AdminChatPanel />

      {tab === "nieuw" ? (
        <AanvoerClient
          onSavedSource={(sourceId) => setTab("bronnen", { sourceId })}
          onSavedCandidate={(editionId) =>
            setTab("aandacht", { editionId })
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
      {tab === "aandacht" ||
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
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SourceFollowStatus | "all">("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`source-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = sources.filter((s) => {
      if (status !== "all" && s.followStatus !== status) return false;
      if (!needle) return true;
      const hay = [s.name, s.officialUrl, s.domain, s.notes ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    list = [...list].sort((a, b) => {
      if (sort === "newest") {
        return sortKey(b.createdAt).localeCompare(sortKey(a.createdAt));
      }
      if (sort === "last") {
        return sortKey(b.lastScanAt).localeCompare(sortKey(a.lastScanAt));
      }
      if (sort === "next") {
        const an = a.nextScanAt ? sortKey(a.nextScanAt) : "9999";
        const bn = b.nextScanAt ? sortKey(b.nextScanAt) : "9999";
        if (a.followStatus === "gevolgd" && b.followStatus !== "gevolgd")
          return -1;
        if (b.followStatus === "gevolgd" && a.followStatus !== "gevolgd")
          return 1;
        return an.localeCompare(bn);
      }
      return a.name.localeCompare(b.name, "nl");
    });
    return list;
  }, [sources, q, status, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function runFollow(sourceId: string, intent: string) {
    setActionErr(null);
    setActionMsg(null);
    if (intent === "archive") {
      const ok = window.confirm(
        "Bron archiveren? Dit is een veilige soft-delete: events en historie blijven behouden, scans stoppen.",
      );
      if (!ok) return;
    }
    const fd = new FormData();
    fd.set("sourceId", sourceId);
    fd.set("intent", intent);
    startTransition(async () => {
      const result = await updateSourceFollowAction(fd);
      if (!result.ok) {
        setActionErr(result.error);
        return;
      }
      setActionMsg(result.message);
      setMoreId(null);
      router.refresh();
    });
  }

  function runScan(sourceId: string, thorough = false) {
    setActionErr(null);
    setActionMsg(null);
    setScanningId(sourceId);
    const fd = new FormData();
    fd.set("sourceId", sourceId);
    if (thorough) fd.set("thorough", "1");
    startTransition(async () => {
      try {
        const result = await scanSourceNowAction(fd);
        if (!result.ok) {
          setActionErr(result.error);
          return;
        }
        setActionMsg(result.message);
        router.refresh();
      } finally {
        setScanningId(null);
      }
    });
  }

  const [addUrl, setAddUrl] = useState("");
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);

  function submitAddUrl(e: FormEvent) {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setAdding(true);
    const fd = new FormData();
    fd.set("officialUrl", addUrl.trim());
    if (addName.trim()) fd.set("name", addName.trim());
    startTransition(async () => {
      try {
        const result = await addSourceByUrlAction(fd);
        if (!result.ok) {
          setActionErr(result.error);
          return;
        }
        setActionMsg(result.message);
        setAddUrl("");
        setAddName("");
        router.refresh();
      } finally {
        setAdding(false);
      }
    });
  }

  return (
    <section className="space-y-4">
      <form
        onSubmit={submitAddUrl}
        className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="min-w-0 flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-stone-500">
            Nieuwe bron (URL)
          </span>
          <input
            type="url"
            required
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            placeholder="https://…"
            className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base md:text-sm"
          />
        </label>
        <label className="w-full text-sm sm:max-w-[12rem]">
          <span className="mb-1 block text-xs font-semibold text-stone-500">
            Naam (optioneel)
          </span>
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Automatisch uit URL"
            className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base md:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending || adding || !addUrl.trim()}
          className="h-11 shrink-0 rounded-full bg-stone-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <PendingContent pending={pending || adding} pendingLabel="Bezig…">
            Toevoegen
          </PendingContent>
        </button>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Zoek in lijst…"
          className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base sm:max-w-md md:text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as SourceFollowStatus | "all");
            setPage(0);
          }}
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-base md:text-sm"
        >
          <option value="all">Alle statussen</option>
          <option value="gevolgd">Wordt gevolgd</option>
          <option value="handmatig">Handmatig</option>
          <option value="gepauzeerd">Gepauzeerd</option>
          <option value="aandacht_nodig">Aandacht nodig</option>
          <option value="uitgeschakeld">Uitgeschakeld</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-base md:text-sm"
        >
          <option value="name">Naam A–Z</option>
          <option value="newest">Laatst toegevoegd</option>
          <option value="last">Laatst gescand</option>
          <option value="next">Volgende scan</option>
        </select>
      </div>

      <p className="text-sm text-stone-500">
        {filtered.length} {filtered.length === 1 ? "bron" : "bronnen"}
      </p>

      {actionErr ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {actionErr}
        </p>
      ) : null}
      {actionMsg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {actionMsg}
        </p>
      ) : null}

      <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {pageItems.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-stone-500">
            Geen bronnen in deze filter.
          </li>
        ) : (
          pageItems.map((s) => {
            const highlighted = highlightId === s.id;
            const moreOpen = moreId === s.id;
            const scanning = scanningId === s.id;
            const extra = [
              s.followLabel,
              s.futureEventCount > 0
                ? `${s.futureEventCount} toekomstig`
                : null,
              s.lastScanAt ? s.lastScanLabel : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={s.id}
                id={`source-${s.id}`}
                className={`px-4 py-3 ${
                  highlighted ? "bg-rose-50" : "bg-white"
                }`}
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-semibold text-stone-900">{s.name}</p>
                    <a
                      href={s.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm text-stone-600 underline-offset-4 hover:underline"
                    >
                      {s.officialUrl}
                    </a>
                    {extra ? (
                      <p className="text-xs text-stone-500">{extra}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {s.refreshSupported ? (
                      <>
                        <button
                          type="button"
                          disabled={pending || scanning}
                          onClick={() => runScan(s.id, false)}
                          className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {scanning ? "…" : "Controleren"}
                        </button>
                        <button
                          type="button"
                          disabled={pending || scanning}
                          onClick={() => runScan(s.id, true)}
                          title="Maakt concepten van nieuwe events (publiceert niet)"
                          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-800 disabled:opacity-60"
                        >
                          {scanning ? "…" : "Ophalen als concept"}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs font-medium text-stone-500 underline-offset-4 hover:underline"
                      onClick={() => setMoreId(moreOpen ? null : s.id)}
                    >
                      {moreOpen ? "Minder" : "Meer"}
                    </button>
                  </div>
                </div>
                {moreOpen ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                    {s.followStatus === "handmatig" && s.refreshSupported ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runFollow(s.id, "enable")}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        Automatisch volgen
                      </button>
                    ) : null}
                    {s.followStatus === "gevolgd" ||
                    s.followStatus === "aandacht_nodig" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runFollow(s.id, "pause")}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        Pauzeren
                      </button>
                    ) : null}
                    {s.followStatus === "gepauzeerd" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runFollow(s.id, "resume")}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        Opnieuw volgen
                      </button>
                    ) : null}
                    {s.followStatus === "uitgeschakeld" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runFollow(s.id, "enable")}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        Opnieuw inschakelen
                      </button>
                    ) : null}
                    {s.followStatus !== "uitgeschakeld" &&
                    s.followStatus !== "gepauzeerd" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runFollow(s.id, "disable")}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        Uitschakelen
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => runFollow(s.id, "archive")}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-red-800 underline-offset-4 hover:underline disabled:opacity-60"
                    >
                      Archiveren
                    </button>
                    {s.lastRunError ? (
                      <p className="w-full text-xs text-stone-500">
                        Laatste fout: {s.lastRunError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

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

function EventsPanel({
  candidates,
  highlightId,
  bucket,
}: {
  candidates: CockpitCandidateRow[];
  highlightId: string | null;
  bucket: "aandacht" | "toegevoegd" | "niet_toegevoegd";
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState("all");
  /** Phase 2B: within Te doen → all | klaar | nakijken */
  const [queueFilter, setQueueFilter] = useState<"all" | "klaar" | "nakijken">(
    "all",
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [pasteId, setPasteId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [searchFeedback, setSearchFeedback] = useState<Record<
    string,
    { kind: "loading" | "new_info" | "no_new_info" | "failed"; text: string }
  >>({});
  /** Keep just-published cards visible in aandacht until the success message is readable. */
  const [heldAandacht, setHeldAandacht] = useState<
    Record<string, CockpitCandidateRow>
  >({});
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [localPatches, setLocalPatches] = useState<
    Record<string, Partial<CockpitCandidateRow>>
  >({});

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`candidate-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const candidatesWithLocal = useMemo(() => {
    const map = new Map<string, CockpitCandidateRow>();
    for (const c of candidates) {
      if (dismissedIds.includes(c.id)) continue;
      map.set(c.id, { ...c, ...localPatches[c.id] });
    }
    for (const [id, held] of Object.entries(heldAandacht)) {
      if (dismissedIds.includes(id)) continue;
      map.set(id, {
        ...held,
        ...localPatches[id],
        adminStatus: "aandacht_nodig",
      });
    }
    return [...map.values()];
  }, [candidates, dismissedIds, heldAandacht, localPatches]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidatesWithLocal.filter((c) => {
      if (bucket === "aandacht" && c.adminStatus !== "aandacht_nodig") return false;
      if (bucket === "toegevoegd" && c.adminStatus !== "toegevoegd") return false;
      if (bucket === "niet_toegevoegd" && c.adminStatus !== "niet_toegevoegd") {
        return false;
      }
      if (bucket === "aandacht" && queueFilter === "klaar" && !c.readyToPublish) {
        return false;
      }
      if (
        bucket === "aandacht" &&
        queueFilter === "nakijken" &&
        c.readyToPublish
      ) {
        return false;
      }
      if (origin !== "all" && c.origin !== origin) return false;
      if (!needle) return true;
      const hay = [
        c.title,
        c.organizerName ?? "",
        c.city,
        c.venueName ?? "",
        c.sourceUrl ?? "",
        c.blockReason ?? "",
        c.readinessSummary ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [candidatesWithLocal, q, bucket, origin, queueFilter]);

  const klaarIds = useMemo(
    () => filtered.filter((c) => c.readyToPublish).map((c) => c.id),
    [filtered],
  );

  const emptyLabel =
    bucket === "toegevoegd"
      ? "Nog geen gepubliceerde events via deze aanvoer."
      : bucket === "niet_toegevoegd"
        ? "Nog geen weggehaalde of afgewezen events."
        : queueFilter === "klaar"
          ? "Geen events klaar voor publicatie."
          : queueFilter === "nakijken"
            ? "Geen events die nog nakijken nodig hebben."
            : "Geen events in de wachtrij.";

  function runBulkPublish() {
    const ids = klaarIds.filter((id) => selected[id] !== false);
    const chosen =
      Object.keys(selected).filter((id) => selected[id]).length > 0
        ? klaarIds.filter((id) => selected[id])
        : klaarIds;
    if (chosen.length === 0) {
      setActionError("Selecteer minstens één klaar event.");
      return;
    }
    if (
      !window.confirm(
        `${chosen.length} event${chosen.length === 1 ? "" : "s"} publiceren?`,
      )
    ) {
      return;
    }
    setActionError(null);
    setActionMessage(null);
    const formData = new FormData();
    for (const id of chosen) formData.append("editionId", id);
    startTransition(async () => {
      const result = await bulkPublishAanvoerCandidatesAction(formData);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setActionMessage(result.message);
      setSelected({});
      router.refresh();
    });
  }

  function runIntent(editionId: string, intent: string) {
    setActionError(null);
    setActionMessage(null);
    if (intent === "opnieuw_controleren") {
      setSearchingId(editionId);
      setSearchFeedback((prev) => ({
        ...prev,
        [editionId]: { kind: "loading", text: "Zoeken op het web…" },
      }));
    }
    const formData = new FormData();
    formData.set("editionId", editionId);
    formData.set("intent", intent);
    startTransition(async () => {
      const result = await updateAanvoerCandidateStatusAction(formData);
      if (!result.ok) {
        setActionError(result.error);
        if (intent === "opnieuw_controleren") {
          setSearchFeedback((prev) => ({
            ...prev,
            [editionId]: {
              kind: "failed",
              text: `Zoeken mislukt — ${result.error}`,
            },
          }));
          setSearchingId(null);
        }
        return;
      }
      if (intent === "opnieuw_controleren") {
        const outcome = result.deepOutcome ?? "no_new_info";
        const kind =
          result.published || outcome === "new_info"
            ? "new_info"
            : outcome === "failed"
              ? "failed"
              : "no_new_info";
        const after = result.fieldsAfter ?? {};
        const fieldBits = [
          after.startDate ? `datum ${after.startDate}` : null,
          after.startTime ? `tijd ${after.startTime}` : null,
          after.city ? `stad ${after.city}` : null,
          after.venue ? `locatie ${after.venue}` : null,
          after.organizer ? `org ${after.organizer}` : null,
        ].filter(Boolean);
        const confirmed =
          result.fieldsConfirmed && result.fieldsConfirmed.length > 0
            ? result.fieldsConfirmed.join(", ")
            : fieldBits.join(", ");
        const text = result.published
          ? `Genoeg info${confirmed ? ` (${confirmed})` : ""}. Event is toegevoegd en verdwijnt zo uit deze lijst.`
          : result.deepOutcomeMessage ||
            result.message ||
            (confirmed ? `Nieuwe info: ${confirmed}` : "Klaar");

        const existing =
          candidates.find((c) => c.id === editionId) ??
          heldAandacht[editionId] ??
          null;
        if (existing) {
          const patch: Partial<CockpitCandidateRow> = {};
          if (after.startDate) patch.displayDate = after.startDate;
          if (after.startTime) patch.startTime = after.startTime;
          if (after.city) patch.city = after.city;
          if (after.venue) patch.venueName = after.venue;
          if (after.organizer) patch.organizerName = after.organizer;
          if (result.attachedSourceUrl) {
            patch.sourceUrl = result.attachedSourceUrl;
            try {
              patch.sourceDomain = new URL(result.attachedSourceUrl).hostname.replace(
                /^www\./,
                "",
              );
            } catch {
              /* ignore */
            }
          }
          patch.checks = {
            ...existing.checks,
            date: existing.checks.date || Boolean(after.startDate),
            location:
              existing.checks.location ||
              Boolean(after.city || after.venue || after.location),
            source:
              existing.checks.source || Boolean(result.attachedSourceUrl),
            singles:
              existing.checks.singles ||
              after.singlesOriented === "true" ||
              after.singlesOnly === "true",
          };
          if (result.published) {
            patch.blockReason = null;
            setHeldAandacht((prev) => ({
              ...prev,
              [editionId]: {
                ...existing,
                ...patch,
                adminStatus: "aandacht_nodig",
              },
            }));
          }
          setLocalPatches((prev) => ({
            ...prev,
            [editionId]: { ...prev[editionId], ...patch },
          }));
        }

        setSearchFeedback((prev) => ({
          ...prev,
          [editionId]: { kind, text },
        }));
        setSearchingId(null);

        if (result.published) {
          if (result.message) setActionMessage(result.message);
          window.setTimeout(() => {
            setDismissedIds((prev) =>
              prev.includes(editionId) ? prev : [...prev, editionId],
            );
            setHeldAandacht((prev) => {
              const next = { ...prev };
              delete next[editionId];
              return next;
            });
            setSearchFeedback((prev) => {
              const next = { ...prev };
              delete next[editionId];
              return next;
            });
            router.refresh();
          }, 2800);
          return;
        }
      }
      if (intent === "niet_toegevoegd") {
        setDismissedIds((prev) =>
          prev.includes(editionId) ? prev : [...prev, editionId],
        );
        setHeldAandacht((prev) => {
          const next = { ...prev };
          delete next[editionId];
          return next;
        });
        setActionMessage(result.message ?? "Gewist — niet toegevoegd.");
        router.refresh();
        return;
      }
      if (result.message) setActionMessage(result.message);
      router.refresh();
    });
  }

  function runPasteInfo(editionId: string, text: string) {
    setActionError(null);
    setActionMessage(null);
    const formData = new FormData();
    formData.set("editionId", editionId);
    formData.set("text", text);
    startTransition(async () => {
      const result = await pasteInfoOntoAandachtCandidateAction(formData);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setPasteId(null);
      if (result.message) setActionMessage(result.message);
      router.refresh();
    });
  }

  function removeFromHub(editionId: string, reason: string) {
    setActionError(null);
    const formData = new FormData();
    formData.set("editionId", editionId);
    formData.set("reason", reason);
    startTransition(async () => {
      try {
        await takeEventOfflineAction(formData);
        setRemoveId(null);
        router.refresh();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Kon event niet weghalen.",
        );
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek event of organisator…"
          className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base sm:max-w-md md:text-sm"
        />
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-base md:text-sm"
        >
          <option value="all">Alle oorsprong</option>
          <option value="admin_intake">Admin intake</option>
          <option value="tip">Tip</option>
          <option value="parser">Parser</option>
          <option value="ai_scan">AI scan</option>
        </select>
        {bucket === "aandacht" ? (
          <select
            value={queueFilter}
            onChange={(e) =>
              setQueueFilter(e.target.value as "all" | "klaar" | "nakijken")
            }
            className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-base md:text-sm"
            aria-label="Filter klaar of nakijken"
          >
            <option value="all">Alles in wachtrij</option>
            <option value="klaar">Klaar voor publicatie</option>
            <option value="nakijken">Nakijken</option>
          </select>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-stone-700 uppercase">
          {bucket === "aandacht"
            ? queueFilter === "klaar"
              ? "Klaar voor publicatie"
              : queueFilter === "nakijken"
                ? "Nakijken"
                : "Te doen"
            : bucket === "toegevoegd"
              ? "Gepubliceerd"
              : "Afgewezen"}{" "}
          — {filtered.length}
        </h2>
        {bucket === "aandacht" && klaarIds.length > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={runBulkPublish}
            className="h-10 rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            Publiciseer klaar ({klaarIds.length})
          </button>
        ) : null}
      </div>

      {actionError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {actionMessage}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 py-6 text-sm text-stone-600">
          {emptyLabel}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => (
          <AdminEventCard
            key={c.id}
            candidate={c}
            bucket={bucket}
            highlighted={highlightId === c.id}
            pending={pending}
            searching={searchingId === c.id}
            searchFeedback={searchFeedback[c.id] ?? null}
            aiOpen={aiOpen === c.id}
            editOpen={editId === c.id}
            pasteOpen={pasteId === c.id}
            removeOpen={removeId === c.id}
            selected={Boolean(selected[c.id])}
            onToggleSelect={() =>
              setSelected((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
            }
            onToggleAi={() => setAiOpen(aiOpen === c.id ? null : c.id)}
            onToggleEdit={() => setEditId(editId === c.id ? null : c.id)}
            onTogglePaste={() => {
              setPasteId(pasteId === c.id ? null : c.id);
              if (editId === c.id) setEditId(null);
            }}
            onToggleRemove={() => setRemoveId(removeId === c.id ? null : c.id)}
            onIntent={runIntent}
            onPasteInfo={runPasteInfo}
            onRemove={removeFromHub}
            onPatched={(editionId, patch) => {
              setLocalPatches((prev) => ({
                ...prev,
                [editionId]: { ...prev[editionId], ...patch },
              }));
              setEditId(null);
              router.refresh();
            }}
            onPatchError={(msg) => setActionError(msg)}
          />
        ))}
      </div>
    </section>
  );
}

function AdminEventCard({
  candidate: c,
  bucket,
  highlighted,
  pending,
  searching,
  searchFeedback,
  aiOpen,
  editOpen,
  pasteOpen,
  removeOpen,
  selected,
  onToggleSelect,
  onToggleAi,
  onToggleEdit,
  onTogglePaste,
  onToggleRemove,
  onIntent,
  onPasteInfo,
  onRemove,
  onPatched,
  onPatchError,
}: {
  candidate: CockpitCandidateRow;
  bucket: "aandacht" | "toegevoegd" | "niet_toegevoegd";
  highlighted: boolean;
  pending: boolean;
  searching: boolean;
  searchFeedback: {
    kind: "loading" | "new_info" | "no_new_info" | "failed";
    text: string;
  } | null;
  aiOpen: boolean;
  editOpen: boolean;
  pasteOpen: boolean;
  removeOpen: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleAi: () => void;
  onToggleEdit: () => void;
  onTogglePaste: () => void;
  onToggleRemove: () => void;
  onIntent: (editionId: string, intent: string) => void;
  onPasteInfo: (editionId: string, text: string) => void;
  onRemove: (editionId: string, reason: string) => void;
  onPatched: (editionId: string, patch: Partial<CockpitCandidateRow>) => void;
  onPatchError: (message: string) => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [editPending, startEditTransition] = useTransition();
  const [editTitle, setEditTitle] = useState(c.title);
  const [editCity, setEditCity] = useState(c.city);
  const [editVenue, setEditVenue] = useState(c.venueName ?? "");
  const [editDate, setEditDate] = useState(c.displayDate ?? "");
  const [editTime, setEditTime] = useState(
    c.startTime && c.startTime !== "12:00" ? c.startTime : "",
  );
  const [editPrice, setEditPrice] = useState(
    c.priceAmount != null ? String(c.priceAmount) : "",
  );
  const age = formatAge(c.minAge, c.maxAge);
  const when = [
    formatDateNl(c.displayDate),
    c.startTime && c.startTime !== "12:00" ? c.startTime : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const cityLabel =
    c.city && !isWeakLocationCity(c.city) ? c.city : null;
  const place = [c.venueName, cityLabel].filter(Boolean).join(" · ");

  return (
    <article
      id={`candidate-${c.id}`}
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${
        highlighted
          ? "border-rose-300 ring-2 ring-rose-200"
          : "border-stone-200/80"
      }`}
    >
      <div className="relative aspect-[16/10] w-full bg-stone-200">
        {c.imageUrl ? (
          <Image
            src={c.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 33vw"
            unoptimized={c.imageUrl.startsWith("http") === false}
          />
        ) : (
          <div className="flex h-full w-full items-end bg-gradient-to-br from-stone-300 via-stone-200 to-rose-100 p-4">
            <p className="text-sm font-semibold text-stone-700">
              {c.category ?? "Event"}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1.5">
          <h3 className="line-clamp-2 text-[15px] font-semibold tracking-tight text-stone-900">
            {displayEventTitle(c.title) || c.title}
          </h3>
          <p className="text-sm text-stone-600">{when}</p>
          <p className="truncate text-sm text-stone-600">
            {c.organizerName ?? "Onbekende organisator"}
            {place ? ` · ${place}` : ""}
          </p>
          <p className="text-sm text-stone-500">
            {[age, formatPrice(c), c.category].filter(Boolean).join(" · ")}
          </p>
        </div>

        {bucket === "aandacht" ? (
          <p
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              c.readyToPublish
                ? "border border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            {c.readinessSummary}
          </p>
        ) : (
          <StatusBadge status={c.adminStatus} />
        )}

        {bucket === "aandacht" ? (
          <ul className="space-y-0.5 text-xs text-stone-600">
            <li>{c.checks.date ? "✓" : "?"} Datum bevestigd</li>
            <li>{c.checks.source ? "✓" : "?"} Bron bevestigd</li>
            <li>{c.checks.singles ? "✓" : "?"} Singlesevent bevestigd</li>
            <li>{c.checks.location ? "✓" : "?"} Locatie bevestigd</li>
            <li>
              {c.priceAmount != null || c.priceNote
                ? `✓ ${formatPrice(c)}`
                : "? Prijs niet bekend"}
            </li>
          </ul>
        ) : null}

        {bucket === "toegevoegd" ? (
          <p className="text-xs text-stone-500">
            Toegevoegd{" "}
            {c.publishedAt
              ? formatDateNl(c.publishedAt)
              : formatDateNl(c.createdAt)}{" "}
            · {ORIGIN_LABEL[c.origin]}
          </p>
        ) : null}

        {bucket === "niet_toegevoegd" && c.manuallySuppressed ? (
          <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
            <span className="font-semibold">Handmatig weggehaald</span>
            {c.blockReason ? ` — ${c.blockReason}` : null}
          </p>
        ) : null}

        {c.duplicateSlug ? (
          <p className="text-sm text-stone-700">
            <Link
              href={`/event/${c.duplicateSlug}`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              Bekijk bestaand event
            </Link>
          </p>
        ) : null}

        {c.sourceDomain ? (
          <p className="text-xs text-stone-500">
            Bron: {c.sourceDomain}
            {c.sourceUrl ? (
              <>
                {" · "}
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Bekijk bron
                </a>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-2">
          {bucket === "aandacht" ? (
            <>
              {c.readyToPublish ? (
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggleSelect}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  Meenemen in bulkpublicatie
                </label>
              ) : null}
              {searchFeedback ? (
                <p
                  className={`rounded-xl px-3 py-2 text-sm font-medium ${
                    searchFeedback.kind === "loading"
                      ? "border border-sky-200 bg-sky-50 text-sky-950"
                      : searchFeedback.kind === "new_info"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-950"
                        : searchFeedback.kind === "failed"
                          ? "border border-red-200 bg-red-50 text-red-900"
                          : "border border-stone-200 bg-stone-50 text-stone-800"
                  }`}
                >
                  {searchFeedback.text}
                </p>
              ) : null}
              {c.readyToPublish ? (
                <button
                  type="button"
                  disabled={pending}
                  className="h-11 w-full rounded-full bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  onClick={() => onIntent(c.id, "toevoegen")}
                >
                  Publiceren
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                onClick={onToggleEdit}
              >
                Aanpassen
              </button>
              <button
                type="button"
                disabled={pending}
                className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                onClick={onTogglePaste}
              >
                Info plakken
              </button>
              <button
                type="button"
                disabled={pending || searching}
                className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                onClick={() => onIntent(c.id, "opnieuw_controleren")}
              >
                {searching ? "Zoeken op het web…" : "Opnieuw laten zoeken"}
              </button>
              <button
                type="button"
                disabled={pending}
                className="h-11 w-full rounded-full border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-900 disabled:opacity-60"
                onClick={() => onIntent(c.id, "niet_toegevoegd")}
              >
                Wissen
              </button>
            </>
          ) : null}

          {bucket === "toegevoegd" ? (
            <>
              <Link
                href={`/event/${c.slug}`}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white"
              >
                Bekijk live event
              </Link>
              <button
                type="button"
                disabled={pending}
                className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                onClick={onToggleRemove}
              >
                Van DateOfflineHub halen
              </button>
            </>
          ) : null}

          {bucket === "niet_toegevoegd" ? (
            <p className="text-xs text-stone-500">
              Status: {ADMIN_STATUS_LABEL[c.adminStatus]}
            </p>
          ) : null}

          <button
            type="button"
            className="text-left text-xs font-medium text-stone-500 underline-offset-4 hover:underline"
            onClick={onToggleAi}
          >
            {aiOpen ? "Verberg AI-details" : "Bekijk AI-details"}
          </button>
        </div>

        {pasteOpen ? (
          <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
            <p className="text-sm font-semibold text-stone-900">Info plakken</p>
            <p className="text-xs leading-5 text-stone-600">
              Plak hier alles wat je over dit event gevonden hebt: tekst,
              AI-samenvatting, links. Geplakte tekst is hulpinformatie; AI
              controleert waar mogelijk opnieuw.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              maxLength={INTAKE_MAX_TEXT_CHARS}
              placeholder="Plak hier alles wat je over het event gevonden hebt."
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-400 md:text-sm"
              disabled={pending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending || !pasteText.trim()}
                className="h-10 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => onPasteInfo(c.id, pasteText)}
              >
                <PendingContent pending={pending} pendingLabel="Bezig…">
                  Info verwerken
                </PendingContent>
              </button>
              <button
                type="button"
                className="text-xs text-stone-500 underline-offset-4 hover:underline"
                onClick={onTogglePaste}
              >
                Annuleren
              </button>
            </div>
          </div>
        ) : null}

        {editOpen ? (
          <form
            className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData();
              formData.set("editionId", c.id);
              formData.set("title", editTitle);
              formData.set("city", editCity);
              formData.set("venueName", editVenue);
              formData.set("startDate", editDate);
              formData.set("startTime", editTime);
              if (editPrice.trim()) formData.set("priceAmount", editPrice);
              startEditTransition(async () => {
                const result = await patchAanvoerCandidateFieldsAction(formData);
                if (!result.ok) {
                  onPatchError(result.error);
                  return;
                }
                onPatched(c.id, {
                  title: editTitle,
                  city: editCity,
                  venueName: editVenue || null,
                  displayDate: editDate || c.displayDate,
                  startTime: editTime || c.startTime,
                  readyToPublish: result.readyToPublish,
                  readinessSummary: result.readinessSummary,
                  blockReason: result.readyToPublish
                    ? null
                    : result.readinessSummary,
                });
              });
            }}
          >
            <p className="font-semibold text-stone-900">Gegevens aanpassen</p>
            <p className="text-xs text-stone-600">
              Na opslaan controleren we automatisch opnieuw of publicatie mag.
            </p>
            <label className="block text-xs font-medium text-stone-600">
              Titel
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-stone-600">
                Datum
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-stone-600">
                Tijd
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-stone-600">
              Stad
              <input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-stone-600">
              Locatie
              <input
                value={editVenue}
                onChange={(e) => setEditVenue(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-stone-600">
              Prijs (€, leeg = ongewijzigd)
              <input
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="Prijs niet bekend → laat leeg"
                className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={editPending || pending}
                className="h-10 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                <PendingContent pending={editPending} pendingLabel="Bezig…">
                  Opslaan
                </PendingContent>
              </button>
              <button
                type="button"
                className="text-xs text-stone-500 underline-offset-4 hover:underline"
                onClick={onToggleEdit}
              >
                Annuleren
              </button>
            </div>
          </form>
        ) : null}

        {removeOpen ? (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-950">Waarom?</p>
            <div className="flex flex-col gap-1.5">
              {REMOVE_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={pending}
                  className="h-10 rounded-full border border-amber-300 bg-white px-3 text-left text-sm font-medium text-stone-800 disabled:opacity-60"
                  onClick={() => onRemove(c.id, reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-xs text-stone-500 underline-offset-4 hover:underline"
              onClick={onToggleRemove}
            >
              Annuleren
            </button>
          </div>
        ) : null}

        {aiOpen ? (
          <div className="space-y-1 rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs text-stone-600">
            <p>Route: {c.eligibilityRoute ?? "onbekend"}</p>
            <p>
              Singles only:{" "}
              {c.singlesOnly == null ? "?" : c.singlesOnly ? "ja" : "nee"} ·
              Oriented:{" "}
              {c.singlesOriented == null
                ? "?"
                : c.singlesOriented
                  ? "ja"
                  : "nee"}
            </p>
            <p>Oorsprong: {ORIGIN_LABEL[c.origin]}</p>
            {c.blockReason ? <p>Reden: {c.blockReason}</p> : null}
            <ImageWhyBlock candidate={c} />
            {c.internalNotes ? (
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] text-stone-500">
                {c.internalNotes.slice(0, 800)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ImageWhyBlock({ candidate: c }: { candidate: CockpitCandidateRow }) {
  const resolved = resolvePublicEventImage(
    {
      category: (c.category as "dating" | "meet_new_people" | "social") || "social",
      activities: [],
      tags: c.tags,
      title: c.title,
      minAge: c.minAge,
      maxAge: c.maxAge,
    },
    c.imageUrl,
    true,
    `event:${c.id}`,
  );
  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2">
      <p className="font-semibold text-stone-800">
        Beeld: {publicImageKindLabel(resolved.imageKind)}
      </p>
      <p className="mt-0.5 text-stone-600">
        Waarom gekozen: {(resolved.why ?? []).slice(0, 3).join(" · ") || "—"}
      </p>
      <p className="mt-0.5 text-stone-500">
        Activiteit: {resolved.profile?.primaryActivity?.replace(/_/g, " ")}
      </p>
    </div>
  );
}
