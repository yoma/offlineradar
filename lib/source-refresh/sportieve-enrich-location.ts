/**
 * When listing location evidence is weak, fetch the matched /events/ detail
 * page (bounded) and re-resolve city. Never invents a place.
 */
import { safeFetchHtmlSource } from "@/lib/source-refresh/safe-fetch-html";
import {
  isWeakSportieveCity,
  resolveSportieveLocation,
} from "@/lib/source-refresh/parsers/sportieve-location";
import { stripTags } from "@/lib/source-refresh/normalize";
import type { RefreshNormalizedCandidate } from "@/lib/source-refresh/types";

const MAX_DETAIL_FETCHES = 8;

export async function enrichSportieveCandidatesFromDetailPages(
  candidates: RefreshNormalizedCandidate[],
): Promise<{
  candidates: RefreshNormalizedCandidate[];
  fetched: number;
  improved: number;
  pages: Array<{ url: string; ok: boolean; error?: string }>;
}> {
  let fetched = 0;
  let improved = 0;
  const pages: Array<{ url: string; ok: boolean; error?: string }> = [];
  const out: RefreshNormalizedCandidate[] = [];

  for (const c of candidates) {
    if (!isWeakSportieveCity(c.city)) {
      out.push(c);
      continue;
    }
    const detailUrl = c.ticketUrl || c.officialUrl;
    if (
      !detailUrl ||
      !/sportievesingles\.be\/events\//i.test(detailUrl) ||
      fetched >= MAX_DETAIL_FETCHES
    ) {
      out.push(c);
      continue;
    }

    fetched += 1;
    const res = await safeFetchHtmlSource(detailUrl);
    if (!res.ok) {
      pages.push({ url: detailUrl, ok: false, error: res.error });
      out.push(c);
      continue;
    }
    pages.push({ url: detailUrl, ok: true });
    const text = stripTags(res.html);
    const loc = resolveSportieveLocation(c.title, text);
    if (!loc.confirmed || !loc.city || isWeakSportieveCity(loc.city)) {
      out.push(c);
      continue;
    }
    improved += 1;
    out.push({
      ...c,
      city: loc.city,
      address: loc.postalCode
        ? `${loc.postalCode} ${loc.placeName ?? loc.city}`.trim()
        : c.address,
      officialUrl: detailUrl,
      ticketUrl: detailUrl,
      rawEvidenceSummary: `${c.rawEvidenceSummary} | detail-locatie:[${loc.evidence.join("; ")}]`.slice(
        0,
        280,
      ),
    });
  }

  return { candidates: out, fetched, improved, pages };
}
