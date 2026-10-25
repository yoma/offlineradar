"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { EventLabels } from "@/components/events/event-labels";
import { EventVisual } from "@/components/events/event-visual";
import { FreshnessLabel } from "@/components/events/freshness-label";
import { ReportSinglesCta } from "@/components/events/report-singles-cta";
import { SaveButton } from "@/components/events/save-button";
import { track } from "@/lib/analytics";
import { isCurrentEvent } from "@/lib/event-visibility";
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
  const capacityBadge = publicCapacityBadge(
    event.capacityStatus,
    event.genderAvailability,
  );
  const showReport = hrefBase === "/event";

  function onCardClick() {
    if (hrefBase !== "/event") return;
    track("event_card_click", {
      eventId: event.id,
      slug: event.slug,
      organizerId: event.organizerId ?? null,
      category: event.category ?? null,
    });
  }

  return (
    <article className="group min-w-0 rounded-2xl border border-[color-mix(in_srgb,var(--border)_75%,var(--brand-bordeaux)_25%)] bg-white p-2.5 shadow-[0_10px_28px_-18px_rgba(47,48,53,0.22),0_2px_10px_-8px_color-mix(in_srgb,var(--brand-bordeaux)_16%,transparent)] transition duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--brand-bordeaux)_38%,var(--border))] hover:bg-[color-mix(in_srgb,var(--brand-rose-soft)_55%,white)] hover:shadow-[0_16px_36px_-18px_rgba(47,48,53,0.28),0_4px_14px_-10px_color-mix(in_srgb,var(--brand-bordeaux)_22%,transparent)] sm:p-3">
      <div className="relative min-w-0">
        <Link href={detailHref} className="block min-w-0" onClick={onCardClick}>
          <EventVisual
            category={event.category}
            city={event.city}
            activities={event.activities}
            tags={event.tags}
            title={event.title}
            subCategory={event.subCategory}
            minAge={event.eligibilityAgeMin}
            maxAge={event.eligibilityAgeMax}
            imageUrl={event.imageUrl}
            imageAlt={event.imageAlt}
            imageIsAtmosphere={event.imageIsAtmosphere === true}
            organizerId={event.organizerId}
            eventId={event.id}
            className="aspect-[4/3] w-full min-w-0 rounded-xl"
            label={false}
          />
        </Link>
        <div className="absolute top-3 right-3">
          <SaveButton eventId={event.id} title={event.title} overlay />
        </div>
      </div>

      <div className="mt-3 min-w-0 space-y-1.5 px-0.5 pb-0.5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={detailHref}
            className="min-w-0 flex-1 brand-focus-ring rounded-sm"
            onClick={onCardClick}
          >
            <h2 className="brand-event-title line-clamp-2 break-words text-[15px] font-semibold tracking-tight transition group-hover:text-[var(--brand-bordeaux-muted)]">
              {event.title}
            </h2>
          </Link>
          <p className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--brand-gold-ink)]">
            {priceLabel}
          </p>
        </div>

        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
          <MapPin
            className="brand-meta-icon size-3.5 shrink-0"
            aria-hidden
            strokeWidth={2.25}
          />
          <span className="truncate">{event.city}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays
            className="brand-meta-icon size-3.5 shrink-0"
            aria-hidden
            strokeWidth={2.25}
          />
          <span>{formatCardWhen(event)}</span>
          {!isCurrentEvent(event) ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
              Voorbij
            </span>
          ) : null}
        </p>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <EventLabels event={event} compact />
          {capacityBadge ? (
            <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--border)_65%,var(--brand-bordeaux)_35%)] bg-[var(--brand-cream)] px-2.5 py-0.5 text-xs font-medium text-[var(--brand-bordeaux)]">
              {capacityBadge}
            </span>
          ) : null}
        </div>

        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Users
            className="brand-meta-icon size-3.5 shrink-0"
            aria-hidden
            strokeWidth={2.25}
          />
          <span>{ageLine}</span>
        </p>

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
