/**
 * Phase 12: curate SmartVibes + HopToDate refresh "new" candidates.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/curate-phase12-refresh.ts
 *   node --env-file=.env.local --import tsx scripts/curate-phase12-refresh.ts --apply
 *   node --env-file=.env.local --import tsx scripts/curate-phase12-refresh.ts --apply --publish
 *
 * Never auto-publishes unless --publish. Never touches Sportieve Singles.
 */
import { createDraftFromRefreshCandidate } from "@/lib/source-refresh/draft-from-candidate";
import { getRefreshPilot } from "@/lib/source-refresh/registry";
import { normalizeText } from "@/lib/source-refresh/normalize";
import type { RefreshNormalizedCandidate } from "@/lib/source-refresh/types";
import {
  updateEditionPublication,
  getEditionById,
} from "@/lib/events/neon-store";
import { updateCatalogSourceFields } from "@/lib/events/catalog-sources";
import { getEventsSql } from "@/lib/events/db";

const REVIEWER = "phase12-curation";
const TODAY = "2026-09-26"; // execution day (Europe/Brussels)

type Row = {
  id: string;
  parser_key: string;
  status: string;
  detection_type: string;
  detected_title: string | null;
  detected_start: string | null;
  proposed_data: RefreshNormalizedCandidate;
  match_event_edition_id: string | null;
};

type CatalogRow = {
  id: string;
  title: string;
  starts_at: string;
  city: string;
  min_age: number | null;
  max_age: number | null;
  publication_status: string;
  organizer_slug: string;
  slug: string;
};

type Decision =
  | "duplicate"
  | "expired"
  | "conflict"
  | "accept_draft"
  | "already_accepted"
  | "skip_hoptodate_bruxelles";

type PlanItem = {
  item: Row;
  decision: Decision;
  reason: string;
  candidate: RefreshNormalizedCandidate;
  publishPriority: number; // higher = publish first; 0 = draft only / don't publish
  matchedEditionId?: string;
};

function extractExternalId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/-(\d{4,6})(?:\.htm|\/)?$/i);
  return m?.[1] ?? null;
}

function normalizeCity(raw: string, title: string): string {
  const t = title.toLowerCase();
  if (/sint[-\s]?niklaas|st[-\s]?niklaas/.test(t)) return "Sint-Niklaas";
  if (/kempen|\(geel\)|geel/.test(t)) return "Geel";
  if (/bruxelles|brussel/.test(t) || /bruxelles|brussel/i.test(raw)) {
    return "Brussel";
  }
  if (/louvain[-\s]?la[-\s]?neuve/i.test(raw) || /louvain/i.test(t)) {
    return "Louvain-la-Neuve";
  }
  if (/li[eè]ge/i.test(raw) || /li[eè]ge/i.test(t)) return "Liège";
  const cleaned = raw.trim();
  if (cleaned === "St" || cleaned === "Sint" || cleaned === "Kempen") {
    return cleaned; // still broken; caller may reject
  }
  if (cleaned === "Bruxelles") return "Brussel";
  return cleaned;
}

function polishTitle(c: RefreshNormalizedCandidate, parserKey: string): string {
  const city = c.city;
  const age =
    c.minAge != null && c.maxAge != null
      ? `${c.minAge}–${c.maxAge}`
      : null;
  const hoger = /hogeropgeleiden/i.test(c.title);
  const fr = /bruxelles\s*fr|\bfr\b/i.test(c.title);
  if (parserKey === "hoptodate") {
    const bits = [
      "Speed Dating",
      city + (fr ? " FR" : ""),
      age ? `${age} ans` : null,
    ].filter(Boolean);
    return bits.join(", ");
  }
  const bits = [
    "Speeddate",
    city + (fr ? " FR" : ""),
    hoger ? "Hogeropgeleiden" : null,
    age ? `${age} jaar` : null,
  ].filter(Boolean);
  // "Speeddate Gent Hogeropgeleiden, 35–45 jaar"
  if (bits.length >= 3) {
    return `${bits.slice(0, -1).join(" ")}, ${bits[bits.length - 1]}`;
  }
  return bits.join(" ");
}

function cityKey(city: string): string {
  return normalizeText(city)
    .replace(/\s+/g, "-")
    .replace(/bruxelles/g, "brussel");
}

function regionBoost(city: string): number {
  const c = cityKey(city);
  if (["hasselt", "geel", "lochristi"].includes(c)) return 40;
  if (["kortrijk", "brugge"].includes(c)) return 35;
  if (
    ["wavre", "mons", "liege", "louvain-la-neuve", "namur"].includes(c)
  ) {
    return 45;
  }
  if (["aalst", "sint-niklaas", "mechelen"].includes(c)) return 30;
  if (["leuven"].includes(c)) return 25;
  if (["gent", "antwerpen"].includes(c)) return 15;
  if (["brussel"].includes(c)) return 5;
  return 10;
}

function ageKey(min: number | null, max: number | null): string {
  return `${min ?? "?"}-${max ?? "?"}`;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function agesOverlap(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): boolean {
  if (aMin == null || aMax == null || bMin == null || bMax == null) {
    return aMin === bMin && aMax === bMax;
  }
  return aMin === bMin && aMax === bMax;
}

function ageBoost(min: number | null, max: number | null): number {
  if (min == null || max == null) return 0;
  if (min >= 50) return 12;
  if (min >= 45) return 10;
  if (min <= 25 && max <= 35) return 8;
  if (min >= 22 && max <= 30) return 10;
  return 4;
}

async function loadCandidates(sql: NonNullable<ReturnType<typeof getEventsSql>>) {
  const rows = (await sql`
    SELECT i.id, r.parser_key, i.status, i.detection_type,
           i.detected_title, i.detected_start::text,
           i.proposed_data, i.match_event_edition_id
    FROM source_refresh_items i
    JOIN source_refresh_runs r ON r.id = i.refresh_run_id
    WHERE i.detection_type = 'new'
      AND r.parser_key IN ('speeddaten', 'hoptodate')
    ORDER BY r.parser_key, i.detected_start ASC NULLS LAST
  `) as Row[];
  return rows;
}

async function loadCatalog(sql: NonNullable<ReturnType<typeof getEventsSql>>) {
  const rows = (await sql`
    SELECT e.id, e.title, e.starts_at::text, e.city, e.min_age, e.max_age,
           e.publication_status, e.slug, o.slug AS organizer_slug
    FROM event_editions e
    JOIN organizers o ON o.id = e.organizer_id
    WHERE e.publication_status NOT IN ('rejected', 'cancelled', 'expired')
    ORDER BY e.starts_at ASC
  `) as CatalogRow[];
  return rows;
}

function findCatalogMatch(
  c: RefreshNormalizedCandidate,
  catalog: CatalogRow[],
  _externalId: string | null,
): CatalogRow | null {
  const hits = catalog.filter(
    (row) =>
      dayKey(row.starts_at) === c.date &&
      cityKey(row.city) === cityKey(c.city) &&
      agesOverlap(row.min_age, row.max_age, c.minAge, c.maxAge),
  );
  if (hits.length === 0) return null;
  return (
    hits.find((h) => h.publication_status === "published") ||
    hits.find((h) => h.publication_status === "draft") ||
    hits[0]
  );
}

function planAll(items: Row[], catalog: CatalogRow[]): PlanItem[] {
  const seenExternal = new Set<string>();
  // Prefer SmartVibes (speeddaten) over HopToDate for shared ids.
  const ordered = [...items].sort((a, b) => {
    if (a.parser_key === b.parser_key) {
      return (a.detected_start ?? "").localeCompare(b.detected_start ?? "");
    }
    if (a.parser_key === "speeddaten") return -1;
    if (b.parser_key === "speeddaten") return 1;
    return a.parser_key.localeCompare(b.parser_key);
  });

  const plan: PlanItem[] = [];

  for (const item of ordered) {
    const raw = item.proposed_data;
    if (!raw?.title || !raw.startsAt || !raw.date) {
      plan.push({
        item,
        decision: "conflict",
        reason: "incomplete edition",
        candidate: raw,
        publishPriority: 0,
      });
      continue;
    }

    const city = normalizeCity(raw.city || "", raw.title);
    const candidate: RefreshNormalizedCandidate = {
      ...raw,
      city,
      title: polishTitle({ ...raw, city }, item.parser_key),
      venue:
        raw.venue === "s Bar"
          ? "Scott's Bar"
          : raw.venue === "A Pilori"
            ? "Au Pilori"
            : raw.venue,
    };

    if (candidate.date < TODAY) {
      plan.push({
        item,
        decision: "expired",
        reason: "expired",
        candidate,
        publishPriority: 0,
      });
      continue;
    }

    if (
      city === "St" ||
      city === "Sint" ||
      city === "Kempen" ||
      !city.trim()
    ) {
      plan.push({
        item,
        decision: "conflict",
        reason: "conflicting data (city parse)",
        candidate,
        publishPriority: 0,
      });
      continue;
    }

    const externalId = extractExternalId(candidate.officialUrl);
    const match = findCatalogMatch(candidate, catalog, externalId);

    if (match) {
      if (match.publication_status === "draft") {
        plan.push({
          item,
          decision: "already_accepted",
          reason: "already accepted as draft",
          candidate,
          publishPriority:
            regionBoost(city) + ageBoost(candidate.minAge, candidate.maxAge),
          matchedEditionId: match.id,
        });
        continue;
      }
      plan.push({
        item,
        decision: "duplicate",
        reason:
          match.publication_status === "published"
            ? "already published"
            : "duplicate",
        candidate,
        publishPriority: 0,
        matchedEditionId: match.id,
      });
      continue;
    }

    // HopToDate Bruxelles FR is the same SmartVibes FR agenda (shared ticket ids).
    if (
      item.parser_key === "hoptodate" &&
      cityKey(city) === "brussel" &&
      /fr/i.test(candidate.title)
    ) {
      if (externalId && seenExternal.has(`sv:${externalId}`)) {
        plan.push({
          item,
          decision: "skip_hoptodate_bruxelles",
          reason: "duplicate (SmartVibes FR network)",
          candidate,
          publishPriority: 0,
        });
        continue;
      }
      // Even without prior SV accept this run, treat as cross-source duplicate risk
      // if SmartVibes candidate exists in the batch for same id.
      const svSibling = ordered.find(
        (o) =>
          o.parser_key === "speeddaten" &&
          extractExternalId(o.proposed_data?.officialUrl) === externalId,
      );
      if (svSibling) {
        plan.push({
          item,
          decision: "skip_hoptodate_bruxelles",
          reason: "duplicate (SmartVibes FR network)",
          candidate,
          publishPriority: 0,
        });
        continue;
      }
    }

    if (externalId) {
      const key = `${item.parser_key === "speeddaten" ? "sv" : "ht"}:${externalId}`;
      const cross = `cross:${externalId}`;
      if (seenExternal.has(cross)) {
        plan.push({
          item,
          decision: "duplicate",
          reason: "duplicate (shared ticket id)",
          candidate,
          publishPriority: 0,
        });
        continue;
      }
      seenExternal.add(cross);
      seenExternal.add(key);
    }

    if (item.status === "accepted") {
      plan.push({
        item,
        decision: "already_accepted",
        reason: "already accepted as draft",
        candidate,
        publishPriority:
          regionBoost(city) + ageBoost(candidate.minAge, candidate.maxAge),
      });
      continue;
    }

    const priority =
      regionBoost(city) + ageBoost(candidate.minAge, candidate.maxAge);
    plan.push({
      item,
      decision: "accept_draft",
      reason: "new concrete edition",
      candidate,
      publishPriority: priority,
    });
  }

  return plan;
}

async function markItem(
  sql: NonNullable<ReturnType<typeof getEventsSql>>,
  id: string,
  status: string,
  matchEditionId: string | null,
) {
  await sql`
    UPDATE source_refresh_items SET
      status = ${status},
      match_event_edition_id = COALESCE(${matchEditionId}, match_event_edition_id),
      reviewed_at = now(),
      reviewed_by = ${REVIEWER}
    WHERE id = ${id}
  `;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const doPublish = process.argv.includes("--publish");
  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL: events SQL unavailable (check env)");
    process.exit(1);
  }

  const items = await loadCandidates(sql);
  const catalog = await loadCatalog(sql);
  const plan = planAll(items, catalog);

  const counts = {
    total: plan.length,
    future: plan.filter((p) => p.decision !== "expired").length,
    expired: plan.filter((p) => p.decision === "expired").length,
    duplicate: plan.filter(
      (p) =>
        p.decision === "duplicate" ||
        p.decision === "skip_hoptodate_bruxelles",
    ).length,
    conflict: plan.filter((p) => p.decision === "conflict").length,
    accept: plan.filter((p) => p.decision === "accept_draft").length,
    already: plan.filter((p) => p.decision === "already_accepted").length,
    smartvibes: plan.filter((p) => p.item.parser_key === "speeddaten").length,
    hoptodate: plan.filter((p) => p.item.parser_key === "hoptodate").length,
  };

  console.log("\n=== Phase 12 plan ===");
  console.log(JSON.stringify(counts, null, 2));
  console.log("\nDecisions:");
  for (const p of plan) {
    console.log(
      `${p.decision.padEnd(28)} ${p.item.parser_key.padEnd(12)} ${p.candidate.date} ${p.candidate.city.padEnd(18)} ${ageKey(p.candidate.minAge, p.candidate.maxAge).padEnd(8)} prio=${p.publishPriority} · ${p.candidate.title} · ${p.reason}`,
    );
  }

  // Publish selection: top priority accepts + already_accepted, cap ~28 to keep format balance.
  const publishPool = plan
    .filter(
      (p) =>
        (p.decision === "accept_draft" || p.decision === "already_accepted") &&
        p.publishPriority > 0,
    )
    .sort((a, b) => b.publishPriority - a.publishPriority);

  // Prefer geo diversity: at most 4 Brussel publishes from this batch.
  const publishSelected: PlanItem[] = [];
  let brussel = 0;
  for (const p of publishPool) {
    if (publishSelected.length >= 28) break;
    if (cityKey(p.candidate.city) === "brussel") {
      if (brussel >= 4) continue;
      brussel++;
    }
    publishSelected.push(p);
  }

  console.log(`\nPublish selection (${publishSelected.length}):`);
  for (const p of publishSelected) {
    console.log(
      `  PUB ${p.candidate.date} ${p.candidate.city} ${ageKey(p.candidate.minAge, p.candidate.maxAge)} · ${p.candidate.title}`,
    );
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply [--publish].");
    return;
  }

  const createdEditionIds = new Map<string, string>(); // itemId → editionId

  // Fix prior bad duplicate draft (Bruxelles FR 40-50 already published).
  const badDraft = catalog.find(
    (c) =>
      c.slug.includes("12-10-bruxelles-fr-40-50a") &&
      c.publication_status === "draft",
  );
  if (badDraft) {
    await updateEditionPublication({
      id: badDraft.id,
      publicationStatus: "rejected",
      rejectedAt: new Date().toISOString(),
    });
    console.log(`Rejected duplicate draft ${badDraft.id}`);
  }

  for (const p of plan) {
    if (p.decision === "expired") {
      await markItem(sql, p.item.id, "rejected", null);
      continue;
    }
    if (
      p.decision === "duplicate" ||
      p.decision === "skip_hoptodate_bruxelles"
    ) {
      await markItem(sql, p.item.id, "rejected", p.matchedEditionId ?? null);
      continue;
    }
    if (p.decision === "conflict") {
      await markItem(sql, p.item.id, "rejected", null);
      continue;
    }
    if (p.decision === "already_accepted") {
      if (p.matchedEditionId) {
        createdEditionIds.set(p.item.id, p.matchedEditionId);
      }
      await markItem(sql, p.item.id, "accepted", p.matchedEditionId ?? null);
      continue;
    }
    if (p.decision === "accept_draft") {
      const pilotCfg =
        p.item.parser_key === "speeddaten"
          ? getRefreshPilot("de8d83b1-217b-4004-9a83-9c6378b2f764")
          : getRefreshPilot("c2b5a9b4-75c1-4fac-8cb7-f599669c133b");
      if (!pilotCfg) {
        console.error("Missing pilot for", p.item.id);
        continue;
      }
      const edition = await createDraftFromRefreshCandidate({
        candidate: p.candidate,
        organizerSlug: pilotCfg.organizerSlug,
        organizerName: pilotCfg.organizerName,
        organizerWebsite: pilotCfg.fetchUrl,
      });
      if (!edition) {
        console.error("Draft failed", p.item.id);
        await markItem(sql, p.item.id, "needs_review", null);
        continue;
      }
      createdEditionIds.set(p.item.id, edition.id);
      await markItem(sql, p.item.id, "accepted", edition.id);
      console.log(`Draft ${edition.slug} ← ${p.candidate.title}`);
    }
  }

  let published = 0;
  if (doPublish) {
    for (const p of publishSelected) {
      let editionId = createdEditionIds.get(p.item.id);
      if (!editionId) {
        const cat = await loadCatalog(sql);
        const hit = cat.find(
          (c) =>
            dayKey(c.starts_at) === p.candidate.date &&
            cityKey(c.city) === cityKey(p.candidate.city) &&
            agesOverlap(
              c.min_age,
              c.max_age,
              p.candidate.minAge,
              p.candidate.maxAge,
            ) &&
            (c.publication_status === "draft" ||
              c.publication_status === "published"),
        );
        if (!hit) continue;
        if (hit.publication_status === "published") continue;
        editionId = hit.id;
      }
      // Polish title/city/venue on draft before explicit publish.
      await sql`
        UPDATE event_editions SET
          title = ${p.candidate.title},
          city = ${p.candidate.city},
          venue_name = ${p.candidate.venue},
          updated_at = now()
        WHERE id = ${editionId}
          AND publication_status = 'draft'
      `;
      const bundle = await getEditionById(editionId);
      if (!bundle || bundle.edition.publicationStatus === "published") continue;
      const now = new Date().toISOString();
      const updated = await updateEditionPublication({
        id: editionId,
        publicationStatus: "published",
        publishedAt: now,
        approvedAt: now,
      });
      if (updated) {
        published++;
        console.log(`Published ${updated.slug}`);
      }
    }
  }

  // Source Map yield notes
  const svAccepted = plan.filter(
    (p) =>
      p.item.parser_key === "speeddaten" &&
      (p.decision === "accept_draft" || p.decision === "already_accepted"),
  ).length;
  const svRejected = plan.filter(
    (p) =>
      p.item.parser_key === "speeddaten" &&
      (p.decision === "duplicate" ||
        p.decision === "expired" ||
        p.decision === "conflict"),
  ).length;
  const htAccepted = plan.filter(
    (p) =>
      p.item.parser_key === "hoptodate" && p.decision === "accept_draft",
  ).length;
  const htRejected = plan.filter(
    (p) =>
      p.item.parser_key === "hoptodate" &&
      (p.decision === "duplicate" ||
        p.decision === "skip_hoptodate_bruxelles" ||
        p.decision === "expired" ||
        p.decision === "conflict"),
  ).length;

  await updateCatalogSourceFields({
    id: "de8d83b1-217b-4004-9a83-9c6378b2f764",
    notes: `[fase12] channel=organizer langs=NL,FR yield=high effort=low | refresh new=${counts.smartvibes} accepted≈${svAccepted} rejected≈${svRejected} | parser quality: good dates/ages/URLs; city truncations (St/Sint/Kempen) need title fallback. Best scheduled-refresh candidate.`,
    touchChecked: true,
  });
  await updateCatalogSourceFields({
    id: "c2b5a9b4-75c1-4fac-8cb7-f599669c133b",
    notes: `[fase12] channel=organizer langs=FR yield=high effort=medium | refresh new=${counts.hoptodate} accepted≈${htAccepted} rejected≈${htRejected} | Bruxelles FR = shared SmartVibes ticket ids (dedupe required). Strong for Wallonie (Wavre/Mons/Liège/LLN). Venue parse: "s Bar"→Scott's.`,
    touchChecked: true,
  });

  console.log(`\nApplied. Drafts created: ${createdEditionIds.size}. Published: ${published}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
