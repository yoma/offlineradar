/**
 * Generic website / websearch follow (no dedicated HTML parser).
 * Produces review candidates; never auto-publishes.
 */
import { createHash } from "node:crypto";
import { runAdminIntakeExtract } from "@/lib/aanvoer/extract";
import { buildDeepSearchQueries } from "@/lib/aanvoer/deep-verify";
import { blankProposal } from "@/lib/aanvoer/types";
import {
  htmlToPlainishText,
  safeFetchTipSource,
} from "@/lib/tips/safe-fetch";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";
import type { RefreshNormalizedCandidate } from "@/lib/source-refresh/types";
import type { FollowMethod } from "@/lib/aanvoer/follow-capability";

const MAX_GENERIC_CANDIDATES = 8;
const MAX_LINK_FETCHES = 5;

function externalKeyFor(url: string, title: string, date: string): string {
  return createHash("sha1")
    .update(`${url}|${title}|${date}`)
    .digest("hex")
    .slice(0, 24);
}

function harvestEventishLinks(html: string, baseUrl: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]!);
  const out: string[] = [];
  for (const href of hrefs) {
    try {
      const absolute = new URL(href, baseUrl).toString();
      const validated = validateAndNormalizeTipUrl(absolute);
      if (!validated.ok) continue;
      const lower = validated.normalizedUrl.toLowerCase();
      if (
        /login|cart|privacy|cookie|account|mailto:/.test(lower) ||
        /\.(pdf|jpg|png|svg|css|js)(\?|$)/.test(lower)
      ) {
        continue;
      }
      if (
        /event|agenda|kalender|activiteit|singles|date|rencontre|workshop|reis|weekend/.test(
          lower,
        )
      ) {
        out.push(validated.normalizedUrl);
      }
    } catch {
      // skip
    }
  }
  return [...new Set(out)].slice(0, MAX_LINK_FETCHES);
}

async function proposalToCandidate(
  proposal: Awaited<ReturnType<typeof runAdminIntakeExtract>>,
  fallbackUrl: string,
  organizerName: string,
): Promise<RefreshNormalizedCandidate | null> {
  const date = proposal.startDate.value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) >= 2090) {
    return null;
  }
  const title = proposal.title.value?.trim();
  if (!title) return null;
  const city = proposal.city.value?.trim() || "Onbekend";
  const startTime = (proposal.startTime.value ?? "12:00").slice(0, 5);
  const officialUrl =
    proposal.sourceUrl.value?.trim() ||
    proposal.organizerUrl.value?.trim() ||
    fallbackUrl;
  const checkedAt = new Date().toISOString();
  return {
    externalKey: externalKeyFor(officialUrl, title, date),
    title,
    organizer: proposal.organizer.value?.trim() || organizerName,
    date,
    startsAt: `${date}T${startTime}:00+02:00`,
    endsAt: null,
    venue: proposal.venue.value?.trim() || proposal.location.value?.trim() || null,
    city,
    address: null,
    minAge: null,
    maxAge: null,
    ageRule: "unknown",
    price: null,
    availability: null,
    officialUrl,
    ticketUrl: null,
    rawEvidenceSummary: `generic-follow:${proposal.startDate.evidence ?? "extract"}`,
    sourceCheckedAt: checkedAt,
  };
}

/**
 * Discover candidates from website fetch and/or web discovery queries.
 */
export async function runGenericSourceFollow(input: {
  sourceName: string;
  officialUrl: string;
  methods: FollowMethod[];
}): Promise<{
  candidates: RefreshNormalizedCandidate[];
  warnings: string[];
  fetchedUrl: string;
  httpStatus: number | null;
  methodUsed: string;
}> {
  const warnings: string[] = [];
  const candidates: RefreshNormalizedCandidate[] = [];
  const seen = new Set<string>();
  let fetchedUrl = input.officialUrl;
  let httpStatus: number | null = null;
  const methodsUsed: string[] = [];

  const pagesToScan: string[] = [];

  if (
    input.methods.includes("website") ||
    input.methods.includes("agenda") ||
    input.methods.includes("parser")
  ) {
    const home = await safeFetchTipSource(input.officialUrl);
    if (home.ok) {
      methodsUsed.push(
        input.methods.includes("agenda") ? "agenda" : "website",
      );
      fetchedUrl = home.finalUrl;
      httpStatus = 200;
      pagesToScan.push(home.finalUrl);
      for (const link of harvestEventishLinks(home.text, home.finalUrl)) {
        pagesToScan.push(link);
      }

      // Also try homepage itself as a single-event page
      const homeProposal = await runAdminIntakeExtract({
        mode: "url",
        url: home.finalUrl,
        text: htmlToPlainishText(home.text).slice(0, 12_000),
      });
      const homeCand = await proposalToCandidate(
        homeProposal,
        home.finalUrl,
        input.sourceName,
      );
      if (homeCand && !seen.has(homeCand.externalKey)) {
        seen.add(homeCand.externalKey);
        candidates.push(homeCand);
      }
    } else {
      warnings.push(`website_fetch_failed:${home.error}`);
    }
  }

  if (input.methods.includes("websearch") && candidates.length < 2) {
    methodsUsed.push("websearch");
    const seed = blankProposal({
      title: {
        value: input.sourceName,
        status: "found",
        evidence: "catalog source name",
      },
      organizer: {
        value: input.sourceName,
        status: "found",
        evidence: "catalog source name",
      },
      sourceUrl: {
        value: input.officialUrl,
        status: "found",
        evidence: "catalog official url",
      },
      sourceKindHint: "website_first",
      needsSourceVerification: true,
      routeAdvice: "needs_review",
      routeReason: "generic websearch follow",
    });
    const queries = buildDeepSearchQueries(seed).slice(0, 4);
    // Lightweight public search (same DDG path as deep-verify fallback)
    for (const q of queries) {
      try {
        const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
        const res = await fetch(endpoint, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; DateOfflineHub/1.0; +https://dateofflinehub.be)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const html = await res.text();
        for (const m of html.matchAll(
          /uddg=([^&"]+)|href="(https?:\/\/(?!duckduckgo)[^"]+)"/gi,
        )) {
          const raw = m[1] ? decodeURIComponent(m[1]) : m[2];
          if (!raw) continue;
          const validated = validateAndNormalizeTipUrl(raw);
          if (!validated.ok) continue;
          if (new URL(validated.normalizedUrl).hostname.includes("duckduckgo")) {
            continue;
          }
          pagesToScan.push(validated.normalizedUrl);
        }
      } catch {
        warnings.push(`websearch_query_failed:${q}`);
      }
    }
  }

  const uniquePages = [...new Set(pagesToScan)].slice(0, MAX_LINK_FETCHES + 2);
  for (const url of uniquePages) {
    if (candidates.length >= MAX_GENERIC_CANDIDATES) break;
    if (url === fetchedUrl && candidates.length > 0) continue;
    const fetched = await safeFetchTipSource(url);
    if (!fetched.ok) {
      warnings.push(`fetch_fail:${url}`);
      continue;
    }
    if (httpStatus == null) httpStatus = 200;
    const proposal = await runAdminIntakeExtract({
      mode: "url",
      url: fetched.finalUrl,
      text: htmlToPlainishText(fetched.text).slice(0, 12_000),
    });
    const cand = await proposalToCandidate(
      proposal,
      fetched.finalUrl,
      input.sourceName,
    );
    if (cand && !seen.has(cand.externalKey)) {
      seen.add(cand.externalKey);
      candidates.push(cand);
    }
  }

  if (candidates.length === 0) {
    warnings.push("no_dated_candidates");
  }

  return {
    candidates,
    warnings,
    fetchedUrl,
    httpStatus,
    methodUsed: methodsUsed.join("+") || "generic",
  };
}
