/**
 * Build Instagram post concepts (images + caption) without publishing.
 */

import type { Event } from "@/types/event";
import {
  buildInstagramCaption,
  buildSingleEventCaption,
} from "@/lib/instagram/captions";
import {
  type InstagramDraftStatus,
  type InstagramFormatId,
} from "@/lib/instagram/constants";
import {
  hasEnoughEventsForFormat,
  isInstagramBaseEligible,
  selectInstagramEvents,
} from "@/lib/instagram/selection";
import { brusselsToday } from "@/lib/dates";
import type { InstagramRenderKind } from "@/lib/instagram/render";

export type InstagramSlidePlan = {
  kind: InstagramRenderKind;
  label: string;
  /** Query params for /api/instagram/image */
  query: Record<string, string>;
};

export type InstagramDraft = {
  id: string;
  format: InstagramFormatId;
  status: InstagramDraftStatus;
  periodLabel: string;
  eventIds: string[];
  events: Event[];
  caption: string;
  altHint: string;
  slides: InstagramSlidePlan[];
  createdAt: string;
};

function slideQuery(
  kind: InstagramRenderKind,
  extra: Record<string, string> = {},
): Record<string, string> {
  return { kind, ...extra };
}

export function buildDraftSlides(
  format: InstagramFormatId,
  events: Event[],
  periodLabel: string,
): InstagramSlidePlan[] {
  if (format === "deze_week") {
    return [
      {
        kind: "deze_week",
        label: "Overzicht — Deze week",
        query: slideQuery("deze_week", {
          period: periodLabel,
          ids: events.map((e) => e.id).join(","),
        }),
      },
    ];
  }

  if (format === "nieuw") {
    const slides: InstagramSlidePlan[] = [
      {
        kind: "nieuw_cover",
        label: "Cover — Nieuw",
        query: slideQuery("nieuw_cover", {
          period: periodLabel,
          ids: events.map((e) => e.id).join(","),
        }),
      },
    ];
    events.forEach((event, i) => {
      slides.push({
        kind: "event",
        label: `Event — ${event.title}`,
        query: slideQuery("event", {
          id: event.id,
          index: String(i + 1),
          total: String(events.length),
          format: "nieuw",
        }),
      });
    });
    return slides;
  }

  // Format A carousel: overview cover + event slides
  const slides: InstagramSlidePlan[] = [
    {
      kind: "binnenkort_cover",
      label: "Cover — Binnenkort",
      query: slideQuery("binnenkort_cover", {
        period: periodLabel,
        count: String(events.length),
        ids: events.map((e) => e.id).join(","),
      }),
    },
  ];
  events.forEach((event, i) => {
    slides.push({
      kind: "event",
      label: `Event — ${event.title}`,
      query: slideQuery("event", {
        id: event.id,
        index: String(i + 1),
        total: String(events.length),
        format: "binnenkort",
      }),
    });
  });
  return slides;
}

export function buildInstagramDraft(
  format: InstagramFormatId,
  catalog: Event[],
  options?: {
    now?: Date;
    recentlyUsedIds?: ReadonlySet<string>;
  },
): InstagramDraft | null {
  const selection = selectInstagramEvents(catalog, {
    format,
    now: options?.now,
    recentlyUsedIds: options?.recentlyUsedIds,
  });

  if (!hasEnoughEventsForFormat(format, selection.events.length)) {
    return null;
  }

  const caption = buildInstagramCaption(
    format,
    selection.events,
    selection.periodLabel,
  );

  return {
    id: `ig-${format}-${Date.now()}`,
    format,
    status: "concept",
    periodLabel: selection.periodLabel,
    eventIds: selection.events.map((e) => e.id),
    events: selection.events,
    caption: caption.text,
    altHint: caption.altHint,
    slides: buildDraftSlides(
      format,
      selection.events,
      selection.periodLabel,
    ),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Phase 3A visual examples: always produce the three requested previews
 * when enough events exist, sharing a used-id set across formats.
 */
export function buildPhase3aPreviewDrafts(
  catalog: Event[],
  now = new Date(),
): {
  drafts: InstagramDraft[];
  notes: string[];
} {
  const notes: string[] = [];
  const used = new Set<string>();
  const drafts: InstagramDraft[] = [];

  const order: InstagramFormatId[] = ["binnenkort", "deze_week", "nieuw"];
  for (const format of order) {
    const draft = buildInstagramDraft(format, catalog, {
      now,
      recentlyUsedIds: used,
    });
    if (!draft) {
      // Retry without used-filter for preview so visuals still show
      const fallback = buildInstagramDraft(format, catalog, { now });
      if (!fallback) {
        notes.push(
          `${format}: onvoldoende geschikte evenementen — geen concept gemaakt.`,
        );
        continue;
      }
      notes.push(
        `${format}: hergebruik toegestaan voor preview (te weinig unieke events).`,
      );
      drafts.push(fallback);
      for (const id of fallback.eventIds) used.add(id);
      continue;
    }
    drafts.push(draft);
    for (const id of draft.eventIds) used.add(id);
  }

  return { drafts, notes };
}

export function imageUrlFromQuery(
  query: Record<string, string>,
  basePath = "/api/instagram/image",
): string {
  const params = new URLSearchParams(query);
  return `${basePath}?${params.toString()}`;
}

/** Upcoming events that may get their own post, soonest first. */
export function listSingleEventCandidates(
  catalog: Event[],
  now = new Date(),
): Event[] {
  const today = brusselsToday(now);
  return catalog
    .filter((e) => isInstagramBaseEligible(e, today, now))
    .sort((a, b) =>
      `${a.startDate} ${a.startTime ?? ""}`.localeCompare(
        `${b.startDate} ${b.startTime ?? ""}`,
      ),
    );
}

/**
 * Event for the weekly "in de kijker" post: not in a recent post, and
 * preferably 2–28 days after the post so there is time to sign up.
 */
export function pickSpotlightEvent(
  catalog: Event[],
  postAt: Date,
  recentlyUsedIds: ReadonlySet<string>,
): Event | null {
  const fresh = listSingleEventCandidates(catalog, postAt).filter(
    (e) => !recentlyUsedIds.has(e.id),
  );
  const postDay = brusselsToday(postAt);
  const inWindow = fresh.filter((e) => {
    const days = (Date.parse(e.startDate) - Date.parse(postDay)) / 86_400_000;
    return days >= 2 && days <= 28;
  });
  return inWindow[0] ?? fresh[0] ?? null;
}

/** One-slide post about a single event. */
export function buildSingleEventDraft(event: Event): InstagramDraft {
  const caption = buildSingleEventCaption(event);
  return {
    id: `ig-event-${event.id}-${Date.now()}`,
    format: "binnenkort",
    status: "concept",
    periodLabel: "",
    eventIds: [event.id],
    events: [event],
    caption: caption.text,
    altHint: caption.altHint,
    slides: [
      {
        kind: "event",
        label: `Event — ${event.title}`,
        query: slideQuery("event", {
          id: event.id,
          index: "1",
          total: "1",
          format: "binnenkort",
        }),
      },
    ],
    createdAt: new Date().toISOString(),
  };
}
