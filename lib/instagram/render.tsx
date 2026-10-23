/**
 * Render Instagram slides via next/og ImageResponse.
 * No Meta publish — images only for admin preview / later Graph API.
 */

import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import type { Event } from "@/types/event";
import { IG_FEED, type InstagramFormatId } from "@/lib/instagram/constants";
import { getLogoDataUrl, loadInstagramFonts } from "@/lib/instagram/assets";
import {
  BinnenkortCoverSlide,
  DezeWeekOverviewSlide,
  EventSlide,
  NieuwCoverSlide,
} from "@/lib/instagram/templates/slides";

export type InstagramRenderKind =
  | "binnenkort_cover"
  | "event"
  | "deze_week"
  | "nieuw_cover";

export type InstagramRenderInput = {
  kind: InstagramRenderKind;
  periodLabel?: string;
  eventCount?: number;
  events?: Event[];
  event?: Event;
  index?: number;
  total?: number;
  format?: InstagramFormatId;
};

export async function renderInstagramImage(
  input: InstagramRenderInput,
): Promise<ImageResponse> {
  const [logoSrc, fonts] = await Promise.all([
    getLogoDataUrl(),
    loadInstagramFonts(),
  ]);

  const fontList = [
    {
      name: fonts.heading.name,
      data: fonts.heading.data,
      weight: fonts.heading.weight,
      style: fonts.heading.style,
    },
    {
      name: fonts.body.name,
      data: fonts.body.data,
      weight: 400 as const,
      style: fonts.body.style,
    },
    {
      name: fonts.bodySemibold.name,
      data: fonts.bodySemibold.data,
      weight: 600 as const,
      style: fonts.bodySemibold.style,
    },
  ];

  let element: ReactElement;

  if (input.kind === "binnenkort_cover") {
    element = (
      <BinnenkortCoverSlide
        logoSrc={logoSrc}
        periodLabel={input.periodLabel ?? ""}
        eventCount={input.eventCount ?? 0}
      />
    );
  } else if (input.kind === "deze_week") {
    element = (
      <DezeWeekOverviewSlide
        logoSrc={logoSrc}
        periodLabel={input.periodLabel ?? ""}
        events={input.events ?? []}
      />
    );
  } else if (input.kind === "nieuw_cover") {
    element = (
      <NieuwCoverSlide
        logoSrc={logoSrc}
        periodLabel={input.periodLabel ?? ""}
      />
    );
  } else {
    if (!input.event) {
      throw new Error("event slide requires event");
    }
    const eyebrow =
      input.format === "nieuw"
        ? "Nieuw"
        : input.format === "deze_week"
          ? "Deze week"
          : "Binnenkort";
    element = (
      <EventSlide
        logoSrc={logoSrc}
        event={input.event}
        index={input.index ?? 1}
        total={input.total ?? 1}
        eyebrow={eyebrow}
      />
    );
  }

  return new ImageResponse(element, {
    width: IG_FEED.width,
    height: IG_FEED.height,
    fonts: fontList,
  });
}
