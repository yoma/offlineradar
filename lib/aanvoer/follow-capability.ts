/**
 * Auto-follow capability: custom parser is NOT required.
 * Methods: parser | website | agenda | websearch (combinable).
 */
import { isRefreshSupported } from "@/lib/source-refresh/registry";

export const FOLLOW_METHODS = [
  "parser",
  "website",
  "agenda",
  "websearch",
] as const;
export type FollowMethod = (typeof FOLLOW_METHODS)[number];

export const FOLLOW_METHOD_LABEL: Record<FollowMethod, string> = {
  parser: "Parser",
  website: "Website",
  agenda: "Agenda",
  websearch: "Websearch",
};

const SOCIAL_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
];

const AGENDA_PATH_RE =
  /\/(agenda|kalender|calendar|events?|activiteiten|aanbod|singles|speed-?dating|rencontres)/i;

export type SourceFollowCapability = {
  autoFollowable: boolean;
  methods: FollowMethod[];
  methodLabel: string;
  manualReason: string | null;
  isSocialOnly: boolean;
  fetchUrl: string | null;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isSocialHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function looksLikeAgendaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return AGENDA_PATH_RE.test(`${u.pathname}${u.search}`);
  } catch {
    return false;
  }
}

/**
 * Resolve how a catalog source can be auto-followed.
 * Manual only when no reliable automatic route exists.
 */
export function resolveSourceFollowCapability(input: {
  catalogSourceId: string;
  officialUrl: string;
  name?: string | null;
  intakeSourceType?: string | null;
}): SourceFollowCapability {
  const url = (input.officialUrl ?? "").trim();
  const methods = new Set<FollowMethod>();
  let fetchUrl: string | null = null;
  let isSocialOnly = false;

  if (isRefreshSupported(input.catalogSourceId)) {
    methods.add("parser");
  }

  let validHttp = false;
  try {
    const parsed = new URL(url);
    validHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    if (validHttp) fetchUrl = parsed.toString();
  } catch {
    validHttp = false;
  }

  if (!validHttp) {
    return {
      autoFollowable: methods.size > 0,
      methods: [...methods],
      methodLabel: formatMethodLabel([...methods]),
      manualReason:
        methods.size > 0
          ? null
          : "Geen bruikbare http(s)-URL om automatisch te volgen.",
      isSocialOnly: false,
      fetchUrl: null,
    };
  }

  const social = isSocialHost(url);
  const intakeSocial = input.intakeSourceType === "social";

  if (social || intakeSocial) {
    isSocialOnly = social && !looksLikeAgendaUrl(url);
    methods.add("websearch");
    // Social pages themselves are rarely scrapable; web discovery is the route.
  } else {
    methods.add("website");
    if (looksLikeAgendaUrl(url)) methods.add("agenda");
    // Website organizers also get periodic web discovery as corroboration.
    methods.add("websearch");
  }

  // Explicit handmatig intake tip without site still may have URL above.
  if (input.intakeSourceType === "handmatig" && methods.size === 0) {
    return {
      autoFollowable: false,
      methods: [],
      methodLabel: "Handmatig",
      manualReason: "Handmatige tip zonder betrouwbare automatische route.",
      isSocialOnly: false,
      fetchUrl,
    };
  }

  const list = FOLLOW_METHODS.filter((m) => methods.has(m));
  return {
    autoFollowable: list.length > 0,
    methods: list,
    methodLabel: formatMethodLabel(list),
    manualReason: null,
    isSocialOnly,
    fetchUrl,
  };
}

export function formatMethodLabel(methods: FollowMethod[]): string {
  if (methods.length === 0) return "Geen";
  return methods.map((m) => FOLLOW_METHOD_LABEL[m]).join(" + ");
}

/** Default cadence hours when no dedicated parser interval exists. */
export function defaultFollowIntervalHours(methods: FollowMethod[]): number {
  if (methods.includes("parser")) return 24;
  if (methods.includes("agenda")) return 48;
  if (methods.includes("website")) return 72;
  return 96; // websearch-only (social)
}
