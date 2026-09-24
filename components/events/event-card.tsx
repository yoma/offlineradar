"use client";

import Link from "next/link";
import { CapacityStatus } from "@/components/events/capacity-status";
import { EventVisual } from "@/components/events/event-visual";
import { FreshnessLabel } from "@/components/events/freshness-label";
import { SaveButton } from "@/components/events/save-button";
import {
  formatAgeRange,
  formatEventWhen,
  formatPrice,
} from "@/lib/format";
import type { PreparedEvent } from "@/lib/filters";

export function EventCard({ event }: { event: PreparedEvent }) {
  const age =
    event.eligibilityAgeRule === "unknown"
      ? null
      : formatAgeRange(event.eligibilityAgeMin, event.eligibilityAgeMax);
  const ageLine =
    age && event.eligibilityAgeRule === "guideline"
      ? `${age} · richtleeftijd`
      : age;

  return (
    <article className="group">
      <div className="relative">
        <Link href={`/event/${event.slug}`} className="block">
          <EventVisual
            category={event.category}
            city={event.city}
            activities={event.activities}
            imageUrl={event.imageUrl}
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
          <Link href={`/event/${event.slug}`} className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">
              {event.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {event.city} · {event.distanceKm} km
            </p>
          </Link>
          <p className="shrink-0 text-[15px] font-semibold">
            {formatPrice(event.price, event.currency)}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{formatEventWhen(event)}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {ageLine ? <span>{ageLine}</span> : <span>Leeftijd niet vermeld</span>}
          <CapacityStatus status={event.capacityStatus} />
        </div>

        <p className="text-sm font-medium">{event.eligibility.title}</p>
        <FreshnessLabel lastCheckedAt={event.lastCheckedAt} compact />
      </div>
    </article>
  );
}
