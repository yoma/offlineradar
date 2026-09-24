"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CapacityStatus } from "@/components/events/capacity-status";
import { EventVisual } from "@/components/events/event-visual";
import { FreshnessLabel } from "@/components/events/freshness-label";
import { SaveButton } from "@/components/events/save-button";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import {
  formatAgeRange,
  formatEventWhen,
  formatPrice,
} from "@/lib/format";
import type { PreparedEvent } from "@/lib/filters";

export function EventCard({ event }: { event: PreparedEvent }) {
  const age =
    event.eligibilityAgeRule === "unknown"
      ? "Leeftijd niet vermeld"
      : formatAgeRange(event.eligibilityAgeMin, event.eligibilityAgeMax);
  const ageLine =
    event.eligibilityAgeRule === "guideline" && age
      ? `${age} · richtleeftijd`
      : age;

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="grid md:grid-cols-[220px_1fr]">
        <EventVisual
          category={event.category}
          city={event.city}
          className="min-h-36 md:min-h-full"
        />
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl leading-tight">{event.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {event.city} · {event.distanceKm} km
              </p>
            </div>
            <SaveButton eventId={event.id} title={event.title} />
          </div>
          <p className="text-sm">{formatEventWhen(event)}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>{ageLine}</span>
            <span>{formatPrice(event.price, event.currency)}</span>
          </div>
          <CapacityStatus
            status={event.capacityStatus}
            spotsRemaining={event.spotsRemaining}
          />
          <p className="text-sm font-medium">{event.eligibility.title}</p>
          <FreshnessLabel lastCheckedAt={event.lastCheckedAt} compact />
          <ul className="flex flex-wrap gap-2">
            {event.tags.slice(0, 3).map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
              >
                {tag}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button asChild className="h-11 rounded-xl px-4">
              <Link href={`/event/${event.slug}`}>Bekijk event</Link>
            </Button>
            <a
              href={event.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track("organizer_clicked", {
                  eventId: event.id,
                  slug: event.slug,
                  source: "card",
                })
              }
              className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              Organisator
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
