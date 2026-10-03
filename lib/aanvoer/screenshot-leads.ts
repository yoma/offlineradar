/**
 * Turn screenshot / intake text into followable web leads.
 * Bare domains like timeleft.com must become https URLs for deep-verify.
 */
import { coerceToHttpUrl, validateAndNormalizeTipUrl } from "@/lib/tips/url";
import type { IntakeProposal } from "@/lib/aanvoer/types";

/** Known social-dining / singles brands often mislabeled on Facebook. */
const KNOWN_BRAND_HOMEPAGES: Array<{
  match: RegExp;
  urls: string[];
  label: string;
}> = [
  {
    match: /\btimeleft\b/i,
    urls: ["https://timeleft.com", "https://app.timeleft.com"],
    label: "Timeleft",
  },
  {
    match: /\bthursday\b/i,
    urls: ["https://thursday.com"],
    label: "Thursday",
  },
  {
    match: /\bhoptodate\b/i,
    urls: ["https://hoptodate.com"],
    label: "HopToDate",
  },
  {
    match: /\bspeeddaten\b/i,
    urls: ["https://www.speeddaten.be"],
    label: "Speeddaten.be",
  },
  {
    match: /\btomeeto\b/i,
    urls: ["https://tomeeto.be"],
    label: "Tomeeto",
  },
  {
    match: /\bjuntas\b/i,
    urls: ["https://juntas.be"],
    label: "Juntas",
  },
];

const DOMAIN_RE =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^\s<>"')\]]*)?/gi;

const NOISE_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "instagram.com",
  "www.instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "google.com",
  "maps.google.com",
]);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function harvestUrlsFromText(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(DOMAIN_RE)) {
    const raw = match[0]!.replace(/[.,);:!]+$/, "");
    const coerced = coerceToHttpUrl(raw);
    const validated = validateAndNormalizeTipUrl(coerced);
    if (!validated.ok) continue;
    const host = hostOf(validated.normalizedUrl);
    if (!host || NOISE_HOSTS.has(host)) continue;
    // Canonical form without trailing slash (except bare origin ok either way).
    out.push(validated.normalizedUrl.replace(/\/$/, ""));
  }
  return [...new Set(out)];
}

export function collectProposalTextBlob(proposal: IntakeProposal): string {
  const fields = [
    proposal.organizer,
    proposal.title,
    proposal.notes,
    proposal.sourceUrl,
    proposal.organizerUrl,
    proposal.category,
    proposal.location,
    proposal.venue,
    proposal.city,
    proposal.priceNotes,
    proposal.ageNotes,
    proposal.availability,
  ];
  return [
    ...fields.map((f) => `${f.value ?? ""} ${f.evidence ?? ""}`),
    proposal.routeReason,
    ...(proposal.visibleUrls ?? []),
  ].join("\n");
}

/** Facebook route reasons often hide the real name in parentheses. */
export function augmentTextForBrandScan(text: string): string {
  const paren = [...text.matchAll(/\(([A-Za-z][A-Za-z0-9\s&.'-]{2,48})\)/g)]
    .map((m) => m[1]!.trim())
    .join("\n");
  return [text, paren].filter(Boolean).join("\n");
}

export function knownBrandUrlsFromText(text: string): {
  label: string | null;
  urls: string[];
} {
  const haystack = augmentTextForBrandScan(text);
  for (const brand of KNOWN_BRAND_HOMEPAGES) {
    if (brand.match.test(haystack)) {
      return { label: brand.label, urls: [...brand.urls] };
    }
  }
  return { label: null, urls: [] };
}

/**
 * After Pass-1 vision: attach every visible / known website so Pass-2 can fetch.
 * Softens false “internetprovider / not suitable” when a real brand site is present.
 */
export function enrichProposalWithScreenshotLeads(
  proposal: IntakeProposal,
  extraVisibleUrls: string[] = [],
): IntakeProposal {
  const blob = collectProposalTextBlob(proposal);
  const harvested = [
    ...harvestUrlsFromText(blob),
    ...extraVisibleUrls.flatMap((u) => harvestUrlsFromText(u)),
  ];
  const brand = knownBrandUrlsFromText(blob);
  const leads = [...new Set([...brand.urls, ...harvested])];

  const next: IntakeProposal = {
    ...proposal,
    visibleUrls: [...new Set([...(proposal.visibleUrls ?? []), ...leads])],
  };

  if (!next.organizer.value?.trim() && brand.label) {
    next.organizer = {
      value: brand.label,
      status: "found",
      evidence: "Merknaam zichtbaar / herkend uit screenshot",
    };
  }
  if (!next.title.value?.trim() && brand.label) {
    next.title = {
      value: brand.label,
      status: "uncertain",
      evidence: "Merknaam uit screenshot; concrete editie nog te bevestigen via website",
    };
  }

  const primary =
    leads.find((u) => !/facebook|instagram/i.test(u)) ?? leads[0] ?? null;
  if (primary) {
    if (!next.sourceUrl.value?.trim()) {
      next.sourceUrl = {
        value: primary,
        status: "found",
        evidence: "Website/domein zichtbaar of bekende merk-site uit screenshot",
      };
    }
    if (!next.organizerUrl.value?.trim()) {
      next.organizerUrl = {
        value: primary,
        status: "found",
        evidence: "Organisator-site uit screenshot-leads",
      };
    }
  }

  const facebookMislabel =
    /internetprovider|provider-app|facebook.*categor/i.test(blob) ||
    /internetprovider/i.test(proposal.category.value ?? "");

  // Facebook business categories are often wrong (e.g. Timeleft → "Internetprovider").
  // Any brand/website lead, or obvious FB mislabel: never hard-reject from the screenshot alone.
  if (
    next.routeAdvice === "not_suitable" &&
    (leads.length > 0 || facebookMislabel)
  ) {
    next.routeAdvice = "needs_review";
    next.routeReason =
      "Screenshot toont een merk/pagina met opvolgbare website. Nog niet afwijzen: eerst de officiële site checken (Facebook-categorie telt niet als bewijs).";
    next.singlesOriented = {
      value: "unknown",
      status: "uncertain",
      evidence: "Nog te bevestigen via officiële site, niet via Facebook-label",
    };
    next.needsSourceVerification = true;
  }

  if (next.sourceKindHint === "manual_only" && leads.length > 0) {
    next.sourceKindHint = "website_first";
  }

  if (leads.length > 0) {
    const stamp = `Website-leads uit screenshot: ${leads.slice(0, 4).join(", ")}`;
    const prevNotes = next.notes.value?.trim() ?? "";
    if (!prevNotes.includes("Website-leads uit screenshot")) {
      next.notes = {
        value: [prevNotes, stamp].filter(Boolean).join("\n"),
        status: "found",
        evidence: next.notes.evidence ?? "Automatisch uit screenshot",
      };
    }
  }

  return next;
}
