/**
 * Render Instagram slides via next/og ImageResponse.
 * No Meta publish — images only for admin preview / later Graph API.
 */

import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import type { Event } from "@/types/event";
import { IG_FEED, type InstagramFormatId } from "@/lib/instagram/constants";
import { getLogoMarkDataUrl, loadInstagramFonts } from "@/lib/instagram/assets";
import {
  IG_NEUTRAL_FALLBACK_DATA_URI,
  imageForEvent,
  resolveMoodBundle,
} from "@/lib/instagram/mood";
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

/** Brand fonts in the shape ImageResponse expects. */
export async function loadInstagramFontList() {
  const fonts = await loadInstagramFonts();
  return [
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
}

export async function renderInstagramImage(
  input: InstagramRenderInput,
): Promise<ImageResponse> {
  const [logoSrc, fontList] = await Promise.all([
    getLogoMarkDataUrl(),
    loadInstagramFontList(),
  ]);

  let element: ReactElement;

  // Photos = the website-visible image per event, resolved on every render
  // (same pipeline as the site). A neutral fallback means "no photo".
  const photoOrEmpty = (src: string) =>
    src === IG_NEUTRAL_FALLBACK_DATA_URI ? "" : src;

  if (input.kind === "binnenkort_cover" || input.kind === "deze_week") {
    const events = input.events ?? [];
    const urls = events.map((e) => imageForEvent(e).url);
    const mood = await resolveMoodBundle({
      heroSrc: IG_NEUTRAL_FALLBACK_DATA_URI,
      thumbs: urls,
    });
    const thumbSrcs = mood.thumbs.map((src, i) =>
      urls[i] === IG_NEUTRAL_FALLBACK_DATA_URI ? "" : photoOrEmpty(src),
    );
    const Slide =
      input.kind === "binnenkort_cover"
        ? BinnenkortCoverSlide
        : DezeWeekOverviewSlide;
    element = (
      <Slide
        logoSrc={logoSrc}
        periodLabel={input.periodLabel ?? ""}
        events={events}
        thumbSrcs={thumbSrcs}
      />
    );
  } else if (input.kind === "nieuw_cover") {
    const first = input.events?.[0];
    const image = first ? imageForEvent(first) : null;
    const mood = image
      ? await resolveMoodBundle({ heroSrc: image.url })
      : { hero: "" };
    element = (
      <NieuwCoverSlide
        logoSrc={logoSrc}
        heroSrc={photoOrEmpty(mood.hero)}
        showAtmosphereLabel={image?.isAtmosphere === true}
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
    const image = imageForEvent(input.event);
    const mood = await resolveMoodBundle({ heroSrc: image.url });
    element = (
      <EventSlide
        logoSrc={logoSrc}
        heroSrc={photoOrEmpty(mood.hero)}
        event={input.event}
        index={input.index ?? 1}
        total={input.total ?? 1}
        eyebrow={eyebrow}
        showAtmosphereLabel={image.isAtmosphere}
      />
    );
  }

  return new ImageResponse(element, {
    width: IG_FEED.width,
    height: IG_FEED.height,
    fonts: fontList,
  });
}
