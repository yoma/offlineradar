import { getEventsSql } from "@/lib/events/db";
import {
  listCatalogSources,
  normalizeCatalogSourceUrl,
} from "@/lib/events/catalog-sources";
import { normalizeRefreshUrl } from "@/lib/source-refresh/normalize";
import type { IntakeEditableDraft, IntakeMatch } from "@/lib/aanvoer/types";

export async function findIntakeMatches(
  draft: IntakeEditableDraft,
): Promise<IntakeMatch[]> {
  const matches: IntakeMatch[] = [];
  const sql = getEventsSql();
  const urls = [draft.sourceUrl, draft.organizerUrl]
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length > 0) {
    const sources = await listCatalogSources();
    for (const url of urls) {
      const normalizedCatalog = normalizeCatalogSourceUrl(url);
      const normalizedRefresh = normalizeRefreshUrl(url);
      for (const source of sources) {
        if (
          source.normalizedUrl === normalizedCatalog ||
          normalizeRefreshUrl(source.officialUrl) === normalizedRefresh
        ) {
          matches.push({
            kind: "catalog_source",
            id: source.id,
            label: source.name,
            detail: source.officialUrl,
            matchReason: "Zelfde bron-URL in Source Map",
          });
        }
      }
    }
  }

  if (!sql) return dedupeMatches(matches);

  for (const url of urls) {
    const normalized = normalizeRefreshUrl(url);
    const rows = (await sql`
      SELECT DISTINCT e.id, e.slug, e.title, e.city, e.starts_at, e.publication_status
      FROM event_editions e
      JOIN event_sources s ON s.event_edition_id = e.id
      WHERE s.normalized_url = ${normalized}
      LIMIT 8
    `) as {
      id: string;
      slug: string;
      title: string;
      city: string;
      starts_at: string;
      publication_status: string;
    }[];
    for (const row of rows) {
      matches.push({
        kind: "event_edition",
        id: row.id,
        label: row.title,
        detail: `${row.city} · ${String(row.starts_at).slice(0, 10)} · ${row.publication_status}`,
        matchReason: "Zelfde eventbron-URL",
      });
    }
  }

  const title = draft.title.trim().toLowerCase();
  const city = draft.city.trim().toLowerCase();
  const date = draft.startDate.trim();
  if (title && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const rows = (
      city
        ? ((await sql`
            SELECT id, slug, title, city, starts_at, publication_status
            FROM event_editions
            WHERE lower(title) = ${title}
              AND starts_at::date = ${date}::date
              AND lower(city) = ${city}
            LIMIT 8
          `) as {
            id: string;
            slug: string;
            title: string;
            city: string;
            starts_at: string;
            publication_status: string;
          }[])
        : ((await sql`
            SELECT id, slug, title, city, starts_at, publication_status
            FROM event_editions
            WHERE lower(title) = ${title}
              AND starts_at::date = ${date}::date
            LIMIT 8
          `) as {
            id: string;
            slug: string;
            title: string;
            city: string;
            starts_at: string;
            publication_status: string;
          }[])
    );
    for (const row of rows) {
      matches.push({
        kind: "event_edition",
        id: row.id,
        label: row.title,
        detail: `${row.city} · ${String(row.starts_at).slice(0, 10)} · ${row.publication_status}`,
        matchReason: "Zelfde titel + datum" + (city ? " + stad" : ""),
      });
    }
  }

  const organizer = draft.organizer.trim().toLowerCase();
  if (organizer) {
    const rows = (await sql`
      SELECT id, name, website_url
      FROM organizers
      WHERE lower(name) = ${organizer}
      LIMIT 5
    `) as { id: string; name: string; website_url: string | null }[];
    for (const row of rows) {
      matches.push({
        kind: "organizer",
        id: row.id,
        label: row.name,
        detail: row.website_url ?? "geen website",
        matchReason: "Zelfde organisatornaam",
      });
    }
  }

  return dedupeMatches(matches);
}

function dedupeMatches(matches: IntakeMatch[]): IntakeMatch[] {
  const seen = new Set<string>();
  const out: IntakeMatch[] = [];
  for (const match of matches) {
    const key = `${match.kind}:${match.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}
