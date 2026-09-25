"use client";

import Link from "next/link";
import { EventLabels } from "@/components/events/event-labels";
import { EventVisual } from "@/components/events/event-visual";
import { SaveButton } from "@/components/events/save-button";
import { displayEligibilityAge } from "@/lib/eligibility";
import {
  formatAgeRange,
  formatCardWhen,
  formatPrice,
  formatPriceFrom,
} from "@/lib/format";
import type { PreparedEvent } from "@/lib/filters";
import type { UserGender } from "@/types/event";

export function EventCard({
  event,
  gender = null,
  hrefBase = "/event",
}: {
  event: PreparedEvent;
  gender?: UserGender | null;
  /** Detail URL prefix without trailing slash (internal preview uses /interne-preview/event). */
  hrefBase?: string;
}) {
  const ageInfo = displayEligibilityAge(event, gender);
  const age = formatAgeRange(ageInfo.min, ageInfo.max);
  const ageLine =
    age && ageInfo.rule === "guideline"
      ? `Richtleeftijd ${age}`
      : age && ageInfo.rule === "strict"
        ? `${age} · strikt`
        : age;
  const guidelineOutside =
    event.participation.status === "guideline" &&
    event.participation.inRange === false;
  const detailHref = `${hrefBase}/${event.slug}`;
  const priceLabel = event.priceIsFrom
    ? formatPriceFrom(event.price, event.currency)
    : formatPrice(event.price, event.currency);
  const availability = event.availabilityNote?.trim() || null;

  return (
    <article className="group">
      <div className="relative">
        <Link href={detailHref} className="block">
          <EventVisual
            category={event.category}
            city={event.city}
            activities={event.activities}
            imageUrl={event.imageUrl}
            imageAlt={event.imageAlt}
            imageIsAtmosphere={event.imageIsAtmosphere === true}
            className="aspect-[4/3] rounded-2xl"
            label={false}
          />
        </Link>
        <div className="absolute top-3 right-3">
          <SaveButton eventId={event.id} title={event.title} overlay />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={detailHref} className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">
              {event.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{event.city}</p>
          </Link>
          <p className="shrink-0 text-[15px] font-semibold">{priceLabel}</p>
        </div>

        <p className="text-sm text-muted-foreground">{formatCardWhen(event)}</p>

        <EventLabels event={event} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {ageLine ? <span>{ageLine}</span> : <span>Leeftijd niet vermeld</span>}
        </div>

        {guidelineOutside ? (
          <p className="text-sm text-muted-foreground">
            Deelname buiten de richtleeftijd is niet bevestigd.
          </p>
        ) : null}

        {availability ? (
          <p className="text-sm text-muted-foreground">{availability}</p>
        ) : null}
      </div>
    </article>
  );
}
