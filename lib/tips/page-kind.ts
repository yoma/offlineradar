/**
 * Tip URL page kinds: single event vs agenda/list vs organizer home.
 * Used to steer admin actions (don't force one concept-event from a calendar).
 */

import type { TipAiPrep, TipPageKind } from "@/types/tips";

export const TIP_PAGE_KIND_LABEL: Record<TipPageKind, string> = {
  single_event: "Één eventpagina",
  agenda_list: "Agenda / lijst met meerdere events",
  organizer_home: "Organisator- of homepage",
  unknown: "Onbekend paginatype",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Prefer AI-reported pageKind; fall back to URL + AI text signals so older
 * scans (without pageKind) still get a clear agenda treatment.
 */
export function resolveTipPageKind(
  tipUrl: string,
  prep: TipAiPrep | null | undefined,
): TipPageKind {
  if (
    prep?.pageKind === "single_event" ||
    prep?.pageKind === "agenda_list" ||
    prep?.pageKind === "organizer_home"
  ) {
    return prep.pageKind;
  }

  const blob = [
    prep?.routeReason,
    prep?.rawNotes,
    prep?.suggestSourceWatchReason,
    ...(prep?.gaps ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /meerdere events|volledige agenda|agenda met|lijst van|kalender met|veel edities|meerdere data/.test(
      blob,
    )
  ) {
    return "agenda_list";
  }

  const host = hostOf(tipUrl);
  const path = (() => {
    try {
      return new URL(tipUrl).pathname.toLowerCase();
    } catch {
      return tipUrl.toLowerCase();
    }
  })();

  // Known catalog calendar hosts / path patterns.
  if (host === "speeddaten.be" || host.endsWith(".speeddaten.be")) {
    if (
      path.includes("kalender") ||
      /\/nl\/[a-z0-9-]+-\d+\.htm$/i.test(path) ||
      path === "/nl/" ||
      path === "/nl"
    ) {
      return "agenda_list";
    }
  }
  if (host.includes("hoptodate.") && path.includes("speed-dating")) {
    return "agenda_list";
  }
  if (host.includes("sportievesingles.") && path.includes("kalender")) {
    return "agenda_list";
  }
  if (/\/(kalender|agenda|events|evenementen)(\/|$)/i.test(path)) {
    return "agenda_list";
  }

  if (prep?.pageKind === "unknown") return "unknown";
  return "unknown";
}

export function isAgendaLikePageKind(kind: TipPageKind): boolean {
  return kind === "agenda_list" || kind === "organizer_home";
}
