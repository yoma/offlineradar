"use client";

import Link from "next/link";
import { EventLabels } from "@/components/events/event-labels";
import { EventVisual } from "@/components/events/event-visual";
import { FreshnessLabel } from "@/components/events/freshness-label";
import { ReportSinglesCta } from "@/components/events/report-singles-cta";
import { SaveButton } from "@/components/events/save-button";
import { displayEligibilityAge } from "@/lib/eligibility";
import {
  formatAgeRange,
  formatCardWhen,
  formatPrice,
  formatPriceFrom,
} from "@/lib/format";
import {
  formatCardAgeLine,
  publicCapacityBadge,
} from "@/lib/public-copy";
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
  const range = formatAgeRange(ageInfo.min, ageInfo.max);
  const ageLine = formatCardAgeLine(
    ageInfo.rule,
    ageInfo.min != null && ageInfo.max == null && range
      ? range.replace(" jaar", "")
      : range,
  );
  const detailHref = `${hrefBase}/${event.slug}`;
  const priceLabel = event.priceIsFrom
    ? formatPriceFrom(event.price, event.currency)
    : formatPrice(event.price, event.currency);
  const capacityBadge = publicCapacityBadge(event.capacityStatus);
  const showReport = hrefBase === "/event";

  return (
    <article className="group min-w-0">
      <div className="relative min-w-0">
        <Link href={detailHref} className="block min-w-0">
          <EventVisual
            category={event.category}
            city={event.city}
            activities={event.activities}
            tags={event.tags}
            title={event.title}
            subCategory={event.subCategory}
            imageUrl={event.imageUrl}
            imageAlt={event.imageAlt}
            imageIsAtmosphere={event.imageIsAtmosphere === true}
            organizerId={event.organizerId}
            eventId={event.id}
            className="aspect-[4/3] w-full min-w-0 rounded-2xl"
            label={false}
          />
        </Link>
        <div className="absolute top-3 right-3">
          <SaveButton eventId={event.id} title={event.title} overlay />
        </div>
      </div>

      <div className="mt-3 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={detailHref} className="min-w-0 flex-1">
            <h2 className="line-clamp-2 break-words text-[15px] font-semibold tracking-tight">
              {event.title}
            </h2>
          </Link>
          <p className="shrink-0 text-[15px] font-semibold tabular-nums">
            {priceLabel}
          </p>
        </div>

        <p className="truncate text-sm text-muted-foreground">{event.city}</p>
        <p className="text-sm text-muted-foreground">{formatCardWhen(event)}</p>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <EventLabels event={event} compact />
          {capacityBadge ? (
            <span className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-0.5 text-xs font-medium text-foreground">
              {capacityBadge}
            </span>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">{ageLine}</p>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <FreshnessLabel lastCheckedAt={event.lastCheckedAt} compact />
          {showReport ? (
            <>
              <span className="text-xs text-muted-foreground" aria-hidden>
                ·
              </span>
              <ReportSinglesCta eventId={event.id} compact />
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
