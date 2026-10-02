/**
 * Backend tools for the admin AI chat.
 * All actions reuse the same refresh/diagnose functions as buttons and cron.
 */
import { getEventsSql } from "@/lib/events/db";
import {
  listCatalogSources,
  updateCatalogSourceFields,
} from "@/lib/events/catalog-sources";
import {
  FOLLOW_DISABLED_TAG,
  FOLLOW_PAUSED_TAG,
  FOLLOW_ARCHIVED_TAG,
  getSourceFollowCapability,
  patchFollowNotes,
} from "@/lib/aanvoer/source-follow";
import { startSourceRefresh } from "@/lib/source-refresh/engine";
import {
  normalizeRefreshUrl,
  urlsReferToSameEvent,
  urlPathKey,
} from "@/lib/source-refresh/normalize";
import { runRefreshParser } from "@/lib/source-refresh/parsers";
import { REFRESH_PILOTS, getRefreshPilot } from "@/lib/source-refresh/registry";
import { safeFetchHtmlSource } from "@/lib/source-refresh/safe-fetch-html";
import {
  getLatestRefreshRun,
  listRefreshItemsForRun,
  listFutureEditionsForOrganizerSlug,
  setSourceRefreshEnabled,
} from "@/lib/source-refresh/store";

export type ResolvedSource = {
  id: string;
  name: string;
  officialUrl: string;
  parserKey: string | null;
  label: string;
};

export type AmbiguousSource = {
  ambiguous: true;
  message: string;
  options: Array<{ id: string; name: string; url: string }>;
};

export type ToolProgressStep =
  | "resolve"
  | "fetch_agenda"
  | "parse_events"
  | "compare"
  | "save"
  | "done"
  | "error";

export type ToolResult = {
  ok: boolean;
  summary: string;
  progress?: ToolProgressStep[];
  data?: Record<string, unknown>;
  runId?: string;
  links?: Array<{ label: string; href: string }>;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Resolve organizer/domain query to catalog source(s). Never guess silently. */
export async function resolveSourceQuery(
  query: string,
): Promise<ResolvedSource | AmbiguousSource | { ok: false; error: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return { ok: false, error: "Geen bronnaam of domein opgegeven." };

  const all = await listCatalogSources();
  const pilots = REFRESH_PILOTS;

  const scored: Array<{
    source: (typeof all)[0];
    score: number;
    parserKey: string | null;
    label: string;
  }> = [];

  for (const source of all) {
    let score = 0;
    const name = source.name.toLowerCase();
    const url = (source.officialUrl ?? "").toLowerCase();
    const host = hostOf(source.officialUrl ?? "");
    if (name === q || host === q) score += 100;
    if (name.includes(q) || q.includes(name)) score += 40;
    if (host.includes(q) || q.includes(host)) score += 50;
    if (url.includes(q)) score += 30;
    // common aliases
    if (
      (q.includes("speeddaten") || q.includes("smartvibes")) &&
      (host.includes("speeddaten") || name.includes("smartvibes"))
    ) {
      score += 80;
    }
    if (score > 0) {
      const pilot = getRefreshPilot(source.id);
      scored.push({
        source,
        score,
        parserKey: pilot?.parserKey ?? null,
        label: pilot?.label ?? source.name,
      });
    }
  }

  // Also match pilots by label even if catalog name differs
  for (const pilot of pilots) {
    if (
      pilot.label.toLowerCase().includes(q) ||
      pilot.fetchUrl.toLowerCase().includes(q) ||
      pilot.organizerSlug.includes(q)
    ) {
      const source = all.find((s) => s.id === pilot.catalogSourceId);
      if (source && !scored.some((s) => s.source.id === source.id)) {
        scored.push({
          source,
          score: 70,
          parserKey: pilot.parserKey,
          label: pilot.label,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score >= 40);
  if (top.length === 0) {
    return {
      ok: false,
      error: `Geen bron gevonden voor “${query}”. Probeer een domein (bv. speeddaten.be) of exacte organisatienaam.`,
    };
  }
  if (top.length > 1 && top[0]!.score - top[1]!.score < 20) {
    return {
      ambiguous: true,
      message: `Meerdere bronnen passen bij “${query}”. Welke bedoel je?`,
      options: top.slice(0, 5).map((t) => ({
        id: t.source.id,
        name: t.label,
        url: t.source.officialUrl,
      })),
    };
  }

  const best = top[0]!;
  return {
    id: best.source.id,
    name: best.label,
    officialUrl: best.source.officialUrl,
    parserKey: best.parserKey,
    label: best.label,
  };
}

export async function toolScanSource(input: {
  query: string;
  email: string;
  thorough?: boolean;
}): Promise<ToolResult | AmbiguousSource> {
  const progress: ToolProgressStep[] = ["resolve"];
  const resolved = await resolveSourceQuery(input.query);
  if ("ambiguous" in resolved && resolved.ambiguous) return resolved;
  if ("ok" in resolved && resolved.ok === false) {
    return { ok: false, summary: resolved.error, progress: ["error"] };
  }
  const source = resolved as ResolvedSource;
  progress.push("fetch_agenda", "parse_events", "compare", "save");

  const result = await startSourceRefresh({
    catalogSourceId: source.id,
    triggeredBy: input.email,
    triggerType: "manual",
    mode: input.thorough ? "thorough" : "standard",
    skipCooldown: true,
  });

  if (!result.ok) {
    return {
      ok: false,
      summary: `${source.label}: ${result.error}`,
      progress: [...progress, "error"],
      runId: result.run?.id,
      data: { code: result.code, report: result.run?.report ?? null },
      links: result.run?.id
        ? [
            {
              label: "Bekijk scanrun",
              href: `/interne-events/refresh/${result.run.id}`,
            },
          ]
        : [],
    };
  }

  const report = result.run.report;
  const summaryParts = [
    `${source.label} gescand (${input.thorough ? "grondig" : "standaard"}).`,
    `Ontdekt: ${result.run.candidateCount}.`,
    `Nieuw: ${result.run.newCount}, gewijzigd: ${result.run.changedCount}, ongewijzigd: ${result.run.unchangedCount}.`,
  ];
  if (report) {
    summaryParts.push(
      `Drafts aangemaakt: ${report.drafted}, veilige updates: ${report.applied}.`,
      `Volledigheid: ${report.completeness} — ${report.completenessNote}`,
    );
  }
  progress.push("done");
  return {
    ok: true,
    summary: summaryParts.join(" "),
    progress,
    runId: result.run.id,
    data: {
      newCount: result.run.newCount,
      changedCount: result.run.changedCount,
      unchangedCount: result.run.unchangedCount,
      drafted: report?.drafted ?? 0,
      applied: report?.applied ?? 0,
      completeness: report?.completeness,
      report,
    },
    links: [
      {
        label: "Bekijk scanrun",
        href: `/interne-events/refresh/${result.run.id}`,
      },
      { label: "Bronnen", href: "/interne-aanvoer?tab=bronnen" },
    ],
  };
}

export async function toolDiagnoseSourceGaps(input: {
  query: string;
}): Promise<ToolResult | AmbiguousSource> {
  const progress: ToolProgressStep[] = ["resolve", "fetch_agenda", "parse_events", "compare"];
  const resolved = await resolveSourceQuery(input.query);
  if ("ambiguous" in resolved && resolved.ambiguous) return resolved;
  if ("ok" in resolved && resolved.ok === false) {
    return { ok: false, summary: resolved.error, progress: ["error"] };
  }
  const source = resolved as ResolvedSource;
  const pilot = getRefreshPilot(source.id);
  if (!pilot) {
    return {
      ok: false,
      summary: `${source.label} heeft geen vaste parser; diagnose beperkt tot laatste scanrapport.`,
      progress: ["error"],
      data: { lastRun: await getLatestRefreshRun(source.id) },
    };
  }

  const fetched = await safeFetchHtmlSource(pilot.fetchUrl);
  if (!fetched.ok) {
    return {
      ok: false,
      summary: `Agenda ophalen mislukt: ${fetched.error}`,
      progress: [...progress, "error"],
    };
  }

  const parsed = runRefreshParser(pilot.parserKey, fetched.html);
  const future = await listFutureEditionsForOrganizerSlug(pilot.organizerSlug);
  const dbUrls = future.flatMap((e) => e.sourceUrls);
  const liveUrls = parsed.candidates.map((c) => ({
    title: c.title,
    url: c.officialUrl,
    date: c.date,
    norm: normalizeRefreshUrl(c.officialUrl),
    pathKey: urlPathKey(c.officialUrl),
  }));

  const missingOnPlatform = liveUrls.filter(
    (c) => !dbUrls.some((u) => urlsReferToSameEvent(c.url, u)),
  );
  const onlyOnPlatform = future.filter(
    (e) =>
      !liveUrls.some((c) =>
        e.sourceUrls.some((u) => urlsReferToSameEvent(c.url, u)),
      ),
  );

  // Also check title+day matches when URL differs (kalender vs detail)
  const missingAfterTitleMatch = missingOnPlatform.filter((c) => {
    return !future.some(
      (e) =>
        e.startsAt.slice(0, 10) === c.date &&
        e.title.toLowerCase().includes(c.title.split(",")[0]?.toLowerCase().slice(-20) ?? "___"),
    );
  });

  progress.push("done");
  return {
    ok: true,
    summary: [
      `${source.label}: bron heeft ${parsed.candidates.length} toekomstige items, platform ${future.length} actieve edities.`,
      `Op bron maar niet via URL in DB: ${missingOnPlatform.length}.`,
      `Na titel+datum-check nog steeds vermoedelijk ontbrekend: ${missingAfterTitleMatch.length}.`,
      `Op platform maar niet in huidige agenda: ${onlyOnPlatform.length}.`,
      `ListingCoverage: ${parsed.listingCoverage ?? "unknown"}.`,
    ].join(" "),
    progress,
    data: {
      liveCount: parsed.candidates.length,
      dbCount: future.length,
      missingByUrl: missingOnPlatform.slice(0, 30),
      missingAfterTitleMatch: missingAfterTitleMatch.slice(0, 20),
      onlyOnPlatform: onlyOnPlatform.slice(0, 20).map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        status: e.publicationStatus,
      })),
      skipped: parsed.skipped ?? [],
    },
    links: [
      { label: "Bronnen", href: "/interne-aanvoer?tab=bronnen" },
      {
        label: "Open agenda",
        href: pilot.fetchUrl,
      },
    ],
  };
}

export async function toolExplainMissingEvent(input: {
  url: string;
}): Promise<ToolResult> {
  const progress: ToolProgressStep[] = ["resolve", "compare"];
  let norm: string;
  try {
    norm = normalizeRefreshUrl(input.url);
  } catch {
    return {
      ok: false,
      summary: "Ongeldige URL.",
      progress: ["error"],
    };
  }

  const sql = getEventsSql();
  if (!sql) {
    return { ok: false, summary: "Database niet beschikbaar.", progress: ["error"] };
  }

  const sources = (await sql`
    SELECT es.event_edition_id, es.url, e.title, e.publication_status, e.starts_at, e.slug
    FROM event_sources es
    JOIN event_editions e ON e.id = es.event_edition_id
    WHERE es.normalized_url = ${norm}
       OR lower(trim(trailing '/' from es.url)) = ${norm}
    LIMIT 5
  `) as Array<{
    event_edition_id: string;
    url: string;
    title: string;
    publication_status: string;
    starts_at: string;
    slug: string;
  }>;

  const refreshItems = (await sql`
    SELECT id, refresh_run_id, detection_type, status, detected_title, catalog_source_id
    FROM source_refresh_items
    WHERE normalized_url = ${norm}
       OR detected_source_url ILIKE ${`%${norm.split("/").pop() ?? norm}%`}
    ORDER BY created_at DESC
    LIMIT 10
  `) as Array<{
    id: string;
    refresh_run_id: string;
    detection_type: string;
    status: string;
    detected_title: string | null;
    catalog_source_id: string;
  }>;

  if (sources.length > 0) {
    const s = sources[0]!;
    progress.push("done");
    const why =
      s.publication_status === "published"
        ? "Dit evenement staat al gepubliceerd op het platform."
        : s.publication_status === "draft"
          ? "Dit evenement bestaat als concept (draft), nog niet gepubliceerd."
          : s.publication_status === "rejected"
            ? "Dit evenement is afgewezen (rejected) en wordt niet getoond."
            : `Status op platform: ${s.publication_status}.`;
    return {
      ok: true,
      summary: `${why} Titel: “${s.title}”.`,
      progress,
      data: { editions: sources, refreshItems },
      links: [
        {
          label: "Open in admin",
          href: `/interne-events?q=${encodeURIComponent(s.slug)}`,
        },
        { label: "Bronlink", href: input.url },
      ],
    };
  }

  if (refreshItems.length > 0) {
    const item = refreshItems[0]!;
    progress.push("done");
    const reason =
      item.status === "needs_review"
        ? "Gevonden in een scan, maar nog in review (niet geaccepteerd als draft)."
        : item.status === "rejected"
          ? "Afgewezen in refresh-review."
          : item.status === "ignored"
            ? "Gemarkeerd als genegeerd in refresh-review."
            : `Scanstatus: ${item.status} (${item.detection_type}).`;
    return {
      ok: true,
      summary: `${reason} Titel in scan: “${item.detected_title ?? "?"}”.`,
      progress,
      data: { refreshItems },
      links: [
        {
          label: "Bekijk scanitem",
          href: `/interne-events/refresh/${item.refresh_run_id}`,
        },
        { label: "Bronlink", href: input.url },
      ],
    };
  }

  progress.push("done");
  return {
    ok: true,
    summary:
      "Deze URL staat niet in de catalogus en niet in recente scanitems. Mogelijke oorzaken: nog nooit gescand, parsefout, of URL valt buiten de huidige agenda-scope.",
    progress,
    data: { found: false },
    links: [{ label: "Bronlink", href: input.url }],
  };
}

export async function toolLastScanSummary(input: {
  query: string;
}): Promise<ToolResult | AmbiguousSource> {
  const resolved = await resolveSourceQuery(input.query);
  if ("ambiguous" in resolved && resolved.ambiguous) return resolved;
  if ("ok" in resolved && resolved.ok === false) {
    return { ok: false, summary: resolved.error, progress: ["error"] };
  }
  const source = resolved as ResolvedSource;
  const run = await getLatestRefreshRun(source.id);
  if (!run) {
    return {
      ok: false,
      summary: `Nog geen scan voor ${source.label}.`,
      progress: ["done"],
    };
  }
  const items = await listRefreshItemsForRun(run.id);
  const added = items.filter(
    (i) => i.detectionType === "new" && (i.status === "accepted" || i.status === "needs_review"),
  );
  const applied = items.filter((i) => i.status === "applied");

  return {
    ok: true,
    summary: [
      `Laatste scan ${source.label}: ${run.status} op ${run.completedAt ?? run.startedAt}.`,
      `Nieuw: ${run.newCount}, gewijzigd: ${run.changedCount}, ongewijzigd: ${run.unchangedCount}.`,
      run.report
        ? `Drafts: ${run.report.drafted}, toegepast: ${run.report.applied}, volledigheid: ${run.report.completeness}.`
        : "",
      `Voorbeelden nieuw: ${added
        .slice(0, 5)
        .map((i) => i.detectedTitle)
        .filter(Boolean)
        .join("; ") || "geen"}.`,
    ]
      .filter(Boolean)
      .join(" "),
    progress: ["done"],
    runId: run.id,
    data: {
      run,
      addedTitles: added.slice(0, 15).map((i) => ({
        title: i.detectedTitle,
        status: i.status,
        url: i.detectedSourceUrl,
      })),
      appliedCount: applied.length,
    },
    links: [
      {
        label: "Bekijk scanrun",
        href: `/interne-events/refresh/${run.id}`,
      },
    ],
  };
}

export async function toolEnableAutoFollow(input: {
  query: string;
}): Promise<ToolResult | AmbiguousSource> {
  const resolved = await resolveSourceQuery(input.query);
  if ("ambiguous" in resolved && resolved.ambiguous) return resolved;
  if ("ok" in resolved && resolved.ok === false) {
    return { ok: false, summary: resolved.error, progress: ["error"] };
  }
  const source = resolved as ResolvedSource;
  const all = await listCatalogSources();
  const catalog = all.find((s) => s.id === source.id);
  if (!catalog) {
    return { ok: false, summary: "Bron niet gevonden.", progress: ["error"] };
  }

  const capability = getSourceFollowCapability({
    catalogSourceId: catalog.id,
    officialUrl: catalog.officialUrl,
    name: catalog.name,
  });
  if (!capability.autoFollowable) {
    return {
      ok: false,
      summary:
        capability.manualReason ??
        "Automatische opvolging is voor deze bron niet mogelijk.",
      progress: ["error"],
    };
  }

  const notes = patchFollowNotes(catalog.notes ?? "", {
    clear: [FOLLOW_PAUSED_TAG, FOLLOW_DISABLED_TAG, FOLLOW_ARCHIVED_TAG],
  });
  await updateCatalogSourceFields({
    id: catalog.id,
    notes,
    status: "active",
  });
  await setSourceRefreshEnabled(catalog.id, true);

  return {
    ok: true,
    summary: `${source.label} wordt nu automatisch opgevolgd.`,
    progress: ["done"],
    links: [{ label: "Bronnen", href: "/interne-aanvoer?tab=bronnen" }],
  };
}
