"use client";

import Link from "next/link";
import { EventVisual } from "@/components/events/event-visual";
import { displayEligibilityAge } from "@/lib/eligibility";
import { formatAgeRange, formatPrice, formatPriceFrom } from "@/lib/format";
import type { PreparedEvent } from "@/lib/filters";
import { upcomingUrgencyLabel } from "@/lib/upcoming";
import type { UserGender } from "@/types/event";

export function UpcomingCard({
  event,
  gender = null,
  hrefBase = "/event",
  today,
}: {
  event: PreparedEvent;
  gender?: UserGender | null;
  hrefBase?: string;
  today: string;
}) {
  const detailHref = `${hrefBase}/${event.slug}`;
  const urgency = upcomingUrgencyLabel(event.startDate, today);
  const ageInfo = displayEligibilityAge(event, gender);
  const range = formatAgeRange(ageInfo.min, ageInfo.max);
  const ageBit =
    ageInfo.min != null && ageInfo.max == null && range
      ? range.replace(" jaar", "")
      : range
        ? range.replace(" jaar", "")
        : null;
  const priceLabel =
    event.price == null
      ? null
      : event.priceIsFrom
        ? formatPriceFrom(event.price, event.currency)
        : formatPrice(event.price, event.currency);
  const meta = [event.city, ageBit].filter(Boolean).join(" · ");

  return (
    <article className="group w-[min(72vw,17.5rem)] sm:w-[15.5rem]">
      <Link
        href={detailHref}
        className="block min-w-0 rounded-2xl outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
      >
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
          className="aspect-[16/10] w-full min-w-0 rounded-xl"
          label={false}
        />
        <div className="mt-2.5 min-w-0 space-y-0.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {urgency}
          </p>
          <h3 className="line-clamp-2 break-words text-sm font-semibold tracking-tight text-foreground">
            {event.title}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
          {priceLabel ? (
            <p className="text-xs font-medium tabular-nums text-foreground/80">
              {priceLabel}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
