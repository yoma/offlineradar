"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AanvoerClient } from "@/app/interne-aanvoer/aanvoer-client";
import {
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
import {
  SOURCE_FOLLOW_LABEL,
  type SourceFollowStatus,
} from "@/lib/aanvoer/source-follow";
import { INTAKE_MAX_TEXT_CHARS } from "@/lib/aanvoer/types";
import {
  publicImageKindLabel,
  resolvePublicEventImage,
} from "@/lib/image-compatibility";

type TabId =
  | "nieuw"
  | "aandacht"
  | "toegevoegd"
  | "niet_toegevoegd"
  | "bronnen";

const TABS: { id: TabId; label: string }[] = [
  { id: "nieuw", label: "Nieuw event" },
  { id: "aandacht", label: "Jouw aandacht nodig" },
  { id: "toegevoegd", label: "Toegevoegd" },
  { id: "niet_toegevoegd", label: "Niet toegevoegd" },
  { id: "bronnen", label: "Bronnen" },
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
}: {
  data: AanvoerCockpitData;
  initialTab?: TabId | "klaar" | "controle" | "kandidaten" | "te_bekijken";
  highlightSourceId?: string | null;
  highlightEditionId?: string | null;
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Jouw aandacht nodig", value: data.counts.aandacht },
          { label: "Toegevoegd", value: data.counts.added },
          { label: "Niet toegevoegd", value: data.counts.dismissed },
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

      <div className="overflow-x-auto">
        <div
          className="inline-flex min-w-full gap-1 rounded-2xl border border-stone-200/80 bg-white/70 p-1 shadow-sm backdrop-blur sm:min-w-0"
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
                className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-stone-900 text-white shadow"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {item.label}
                {count != null ? (
                  <span className="ml-1.5 opacity-70">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

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

function FollowBadge({ status }: { status: SourceFollowStatus }) {
  if (status === "gevolgd") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
        ✓ {SOURCE_FOLLOW_LABEL.gevolgd}
      </span>
    );
  }
  if (status === "aandacht_nodig") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
        ⚠ {SOURCE_FOLLOW_LABEL.aandacht_nodig}
      </span>
    );
  }
  if (status === "gepauzeerd") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-950">
        {SOURCE_FOLLOW_LABEL.gepauzeerd}
      </span>
    );
  }
  if (status === "uitgeschakeld") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-800">
        {SOURCE_FOLLOW_LABEL.uitgeschakeld}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-950">
      {SOURCE_FOLLOW_LABEL.handmatig}
    </span>
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
  const [sort, setSort] = useState("next");
  const [page, setPage] = useState(0);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
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
      if (sort === "name") return a.name.localeCompare(b.name, "nl");
      if (sort === "newest") {
        return sortKey(b.createdAt).localeCompare(sortKey(a.createdAt));
      }
      if (sort === "last") {
        return sortKey(b.lastScanAt).localeCompare(sortKey(a.lastScanAt));
      }
      // next scan: due first, then soonest
      const an = a.nextScanAt ? sortKey(a.nextScanAt) : "9999";
      const bn = b.nextScanAt ? sortKey(b.nextScanAt) : "9999";
      if (a.followStatus === "gevolgd" && b.followStatus !== "gevolgd") return -1;
      if (b.followStatus === "gevolgd" && a.followStatus !== "gevolgd") return 1;
      return an.localeCompare(bn);
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

  function runScan(sourceId: string) {
    setActionErr(null);
    setActionMsg(null);
    setScanningId(sourceId);
    const fd = new FormData();
    fd.set("sourceId", sourceId);
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

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Zoek bron of organisator…"
          className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm sm:max-w-md"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as SourceFollowStatus | "all");
            setPage(0);
          }}
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        >
          <option value="all">Alle</option>
          <option value="gevolgd">Wordt gevolgd</option>
          <option value="handmatig">Handmatig</option>
          <option value="gepauzeerd">Gepauzeerd</option>
          <option value="aandacht_nodig">Aandacht nodig</option>
          <option value="uitgeschakeld">Uitgeschakeld</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        >
          <option value="next">Volgende scan</option>
          <option value="last">Laatst gescand</option>
          <option value="newest">Laatst toegevoegd</option>
          <option value="name">Naam A–Z</option>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((s) => {
          const highlighted = highlightId === s.id;
          const moreOpen = moreId === s.id;
          const detailOpen = detailId === s.id;
          const scanning = scanningId === s.id;
          return (
            <article
              key={s.id}
              id={`source-${s.id}`}
              className={`flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm ${
                highlighted
                  ? "border-rose-300 ring-2 ring-rose-200"
                  : "border-stone-200/80"
              }`}
            >
              <div className="space-y-1">
                <h3 className="text-[15px] font-semibold tracking-tight text-stone-900">
                  {s.name}
                </h3>
                <p className="truncate text-sm text-stone-600">{s.domain}</p>
                <p className="text-[11px] font-medium text-stone-500">
                  {s.userSupplied
                    ? "Door jou aangebracht"
                    : "Automatisch ontdekt"}
                </p>
              </div>

              <FollowBadge status={s.followStatus} />

              {s.followMethods.length > 0 ? (
                <p className="text-sm text-stone-700">
                  <span className="text-xs font-semibold text-stone-500">
                    Followmethode:{" "}
                  </span>
                  {s.followMethodLabel}
                </p>
              ) : null}

              {s.followStatus === "handmatig" && !s.refreshSupported ? (
                <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                  Automatische opvolging momenteel niet mogelijk
                  <span className="mt-1 block text-xs text-stone-500">
                    Reden:{" "}
                    {s.manualFollowReason ??
                      "Geen betrouwbare website-, agenda- of websearch-route."}
                  </span>
                </p>
              ) : null}

              {s.followStatus === "aandacht_nodig" ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
                  {s.consecutiveFailures} opeenvolgende scans mislukt
                </p>
              ) : null}

              <dl className="space-y-1.5 text-sm text-stone-700">
                <div>
                  <dt className="text-xs font-semibold text-stone-500">
                    Laatste scan
                  </dt>
                  <dd>{s.lastScanLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-stone-500">
                    Volgende scan
                  </dt>
                  <dd>{s.nextScanLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-stone-500">
                    Frequentie
                  </dt>
                  <dd>{s.frequencyLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-stone-500">
                    Laatste resultaat
                  </dt>
                  <dd>{s.lastResultLabel}</dd>
                </div>
              </dl>

              <p className="text-sm text-stone-700">
                <span className="font-semibold">{s.futureEventCount}</span>{" "}
                toekomstige events
                {s.publishedEventCount > 0 ? (
                  <>
                    {" · "}
                    <span className="font-semibold">{s.publishedEventCount}</span>{" "}
                    gepubliceerd
                  </>
                ) : null}
              </p>

              <div className="text-sm text-stone-700">
                <p className="text-xs font-semibold text-stone-500">
                  Laatste gevonden event
                </p>
                {s.lastFoundEvent ? (
                  s.lastFoundEvent.slug ? (
                    <Link
                      href={`/event/${s.lastFoundEvent.slug}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {s.lastFoundEvent.title}
                    </Link>
                  ) : (
                    <p className="font-medium">{s.lastFoundEvent.title}</p>
                  )
                ) : (
                  <p>Nog geen geschikte events gevonden</p>
                )}
              </div>

              <div className="mt-auto flex flex-col gap-2">
                {s.refreshSupported ? (
                  <>
                    <button
                      type="button"
                      disabled={pending || scanning}
                      onClick={() => runScan(s.id)}
                      className="h-11 w-full rounded-full bg-stone-900 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {scanning ? "Bezig met controleren…" : "Nu controleren"}
                    </button>
                    {s.followStatus === "handmatig" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runFollow(s.id, "enable")}
                        className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                      >
                        Automatisch volgen aanzetten
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                    Automatische opvolging momenteel niet mogelijk
                    <span className="mt-1 block text-stone-500">
                      Reden:{" "}
                      {s.manualFollowReason ??
                        "Geen betrouwbare website-, agenda- of websearch-route."}
                    </span>
                  </p>
                )}

                {s.followStatus === "gevolgd" ||
                s.followStatus === "aandacht_nodig" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runFollow(s.id, "pause")}
                    className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                  >
                    Pauzeren
                  </button>
                ) : null}

                {s.followStatus === "gepauzeerd" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runFollow(s.id, "resume")}
                    className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                  >
                    Opnieuw volgen
                  </button>
                ) : null}

                {s.followStatus === "uitgeschakeld" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runFollow(s.id, "enable")}
                    className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                  >
                    Opnieuw inschakelen
                  </button>
                ) : null}

                <a
                  href={s.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 w-full items-center justify-center rounded-full border border-stone-300 text-sm font-semibold text-stone-800"
                >
                  Bekijk bron
                </a>

                {s.linkedFutureEvents.length > 0 ? (
                  <details className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-semibold text-stone-800">
                      Bekijk events ({s.linkedFutureEvents.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-stone-600">
                      {s.linkedFutureEvents.slice(0, 8).map((ev) => (
                        <li key={ev.id} className="truncate">
                          {ev.title} · {ev.startsAt.slice(0, 10)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <button
                  type="button"
                  className="text-left text-xs font-medium text-stone-500 underline-offset-4 hover:underline"
                  onClick={() => setMoreId(moreOpen ? null : s.id)}
                >
                  {moreOpen ? "Minder opties" : "Meer opties"}
                </button>

                {moreOpen ? (
                  <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    {s.followStatus !== "uitgeschakeld" &&
                    s.followStatus !== "gepauzeerd" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runFollow(s.id, "disable")}
                        className="h-10 w-full rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-800 disabled:opacity-60"
                      >
                        Uitschakelen
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => runFollow(s.id, "archive")}
                      className="h-10 w-full rounded-full text-sm font-medium text-red-800 underline-offset-4 hover:underline disabled:opacity-60"
                    >
                      Bron verwijderen (archiveren)
                    </button>
                    <p className="text-[11px] text-stone-500">
                      Hard delete is niet veilig door gekoppelde events/historie.
                      Archiveren schakelt de bron uit en bewaart alles.
                    </p>
                  </div>
                ) : null}

                {(s.lastRunError || s.consecutiveFailures > 0) && (
                  <>
                    <button
                      type="button"
                      className="text-left text-xs font-medium text-stone-500 underline-offset-4 hover:underline"
                      onClick={() => setDetailId(detailOpen ? null : s.id)}
                    >
                      {detailOpen ? "Verberg details" : "Bekijk details"}
                    </button>
                    {detailOpen ? (
                      <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs text-stone-600">
                        {s.lastRunHttpStatus != null ? (
                          <p>HTTP: {s.lastRunHttpStatus}</p>
                        ) : null}
                        {s.lastRunError ? (
                          <p className="mt-1 break-words">{s.lastRunError}</p>
                        ) : null}
                        <p className="mt-1">
                          Opeenvolgende mislukkingen: {s.consecutiveFailures}
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
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

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`candidate-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => {
      if (bucket === "aandacht" && c.adminStatus !== "aandacht_nodig") return false;
      if (bucket === "toegevoegd" && c.adminStatus !== "toegevoegd") return false;
      if (bucket === "niet_toegevoegd" && c.adminStatus !== "niet_toegevoegd") {
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
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [candidates, q, bucket, origin]);

  const emptyLabel =
    bucket === "toegevoegd"
      ? "Nog geen live events via deze aanvoer."
      : bucket === "niet_toegevoegd"
        ? "Nog geen weggehaalde of afgewezen events."
        : "Geen events die jouw aandacht nodig hebben.";

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
          outcome === "new_info"
            ? "new_info"
            : outcome === "failed"
              ? "failed"
              : "no_new_info";
        setSearchFeedback((prev) => ({
          ...prev,
          [editionId]: {
            kind,
            text: result.deepOutcomeMessage || result.message || "Klaar",
          },
        }));
        setSearchingId(null);
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
          className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm sm:max-w-md"
        />
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm"
        >
          <option value="all">Alle oorsprong</option>
          <option value="admin_intake">Admin intake</option>
          <option value="tip">Tip</option>
          <option value="parser">Parser</option>
          <option value="ai_scan">AI scan</option>
        </select>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-stone-700 uppercase">
          {bucket === "aandacht"
            ? "Jouw aandacht nodig"
            : bucket === "toegevoegd"
              ? "Toegevoegd"
              : "Niet toegevoegd"}{" "}
          — {filtered.length}
        </h2>
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
  onToggleAi,
  onToggleEdit,
  onTogglePaste,
  onToggleRemove,
  onIntent,
  onPasteInfo,
  onRemove,
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
  onToggleAi: () => void;
  onToggleEdit: () => void;
  onTogglePaste: () => void;
  onToggleRemove: () => void;
  onIntent: (editionId: string, intent: string) => void;
  onPasteInfo: (editionId: string, text: string) => void;
  onRemove: (editionId: string, reason: string) => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const age = formatAge(c.minAge, c.maxAge);
  const when = [
    formatDateNl(c.displayDate),
    c.startTime && c.startTime !== "12:00" ? c.startTime : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const place = [c.venueName, c.city].filter(Boolean).join(" · ");

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
            {c.title}
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

        <StatusBadge status={c.adminStatus} />

        {bucket === "aandacht" && c.blockReason ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
            {c.blockReason}
          </p>
        ) : null}

        {bucket === "aandacht" ? (
          <ul className="space-y-0.5 text-xs text-stone-600">
            <li>{c.checks.date ? "✓" : "?"} Datum bevestigd</li>
            <li>{c.checks.source ? "✓" : "?"} Bron bevestigd</li>
            <li>{c.checks.singles ? "✓" : "?"} Singlesevent bevestigd</li>
            <li>{c.checks.location ? "✓" : "?"} Locatie bevestigd</li>
            <li>
              {c.priceAmount != null || c.priceNote
                ? `✓ ${formatPrice(c)}`
                : "? Prijs onbekend"}
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
                className="h-11 w-full rounded-full border border-stone-300 text-sm font-semibold text-stone-800 disabled:opacity-60"
                onClick={onToggleEdit}
              >
                Aanpassen
              </button>
              <button
                type="button"
                disabled={pending}
                className="h-11 w-full rounded-full text-sm font-medium text-stone-500 underline-offset-4 hover:underline disabled:opacity-60"
                onClick={() => onIntent(c.id, "niet_toegevoegd")}
              >
                Niet toevoegen
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
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
              disabled={pending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending || !pasteText.trim()}
                className="h-10 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => onPasteInfo(c.id, pasteText)}
              >
                {pending ? "Verwerken…" : "Info verwerken"}
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
          <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
            <p className="text-stone-700">
              Pas het event aan via de eventsbeheerpagina. Na opslaan wordt de
              gate opnieuw uitgevoerd.
            </p>
            <Link
              href="/interne-events"
              className="inline-flex h-10 items-center rounded-full bg-stone-900 px-4 text-sm font-semibold text-white"
            >
              Open aanpassen
            </Link>
          </div>
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
