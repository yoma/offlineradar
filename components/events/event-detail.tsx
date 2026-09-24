"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CapacityStatus } from "@/components/events/capacity-status";
import { EventVisual } from "@/components/events/event-visual";
import { FreshnessLabel } from "@/components/events/freshness-label";
import { SaveButton } from "@/components/events/save-button";
import { Button } from "@/components/ui/button";
import { findPlace } from "@/data/places";
import { track } from "@/lib/analytics";
import { formatLongDate } from "@/lib/dates";
import { withUserDistance } from "@/lib/distance";
import { isEligibleForEvent } from "@/lib/eligibility";
import { CATEGORY_LABEL, formatAgeRange, formatPrice, formatSchedule } from "@/lib/format";
import { defaultSearchState } from "@/lib/search-state";
import { readProfile } from "@/lib/storage";
import { whyThisFits } from "@/lib/why";
import type { Event } from "@/types/event";
import type { SearchState } from "@/types/search";

export function EventDetail({ event }: { event: Event }) {
  const [state, setState] = useState<SearchState>(defaultSearchState());

  useEffect(() => {
    track("event_opened", { eventId: event.id, slug: event.slug });
    const profile = readProfile();
    const params = new URLSearchParams(window.location.search);
    const ageFromQuery = Number(params.get("age"));
    setState({
      ...defaultSearchState(),
      age: Number.isFinite(ageFromQuery) && ageFromQuery >= 18 ? ageFromQuery : profile.age,
      placeId: params.get("place") || profile.placeId,
      maxDistanceKm: profile.maxDistanceKm,
      preferredAgeMin: profile.preferredAgeMin,
      preferredAgeMax: profile.preferredAgeMax,
      activities: profile.interests,
    });
  }, [event.id, event.slug]);

  const place = findPlace(state.placeId);
  const placed = withUserDistance(event, state.placeId);
  const eligibility = isEligibleForEvent({ age: state.age }, placed);
  const prepared = { ...placed, eligibility };
  const reasons = whyThisFits(prepared, state);
  const ageLabel = formatAgeRange(event.eligibilityAgeMin, event.eligibilityAgeMax);
  const ticketHref = event.ticketUrl ?? event.officialUrl;
  const preference =
    state.preferredAgeMin != null || state.preferredAgeMax != null
      ? formatAgeRange(state.preferredAgeMin, state.preferredAgeMax)
      : null;

  return (
    <article className="pb-36 md:pb-16">
      <EventVisual
        category={event.category}
        city={event.city}
        className="h-56 w-full sm:h-72"
      />
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {CATEGORY_LABEL[event.category]} · {event.subCategory}
            </p>
            <SaveButton eventId={event.id} title={event.title} />
          </div>
          <h1 className="font-heading text-4xl leading-tight">{event.title}</h1>
          <p className="text-lg">{event.organizerName}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Locatie</dt>
              <dd>
                {event.venue ? `${event.venue}, ` : ""}
                {event.city}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Datum</dt>
              <dd>{formatSchedule(event)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Prijs</dt>
              <dd>{formatPrice(event.price, event.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Afstand</dt>
              <dd>
                {placed.distanceKm} km van {place.label}
              </dd>
            </div>
          </dl>
        </header>

        <section
          className={`rounded-2xl border p-4 ${
            eligibility.status === "ineligible"
              ? "border-red-200 bg-red-50"
              : eligibility.status === "unknown" || eligibility.status === "needs_age"
                ? "border-amber-200 bg-amber-50"
                : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <h2 className="font-heading text-2xl">{eligibility.title}</h2>
          <p className="mt-2 text-sm leading-6">{eligibility.detail}</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-2xl">Waarom past dit bij jou?</h2>
          <ul className="space-y-2 text-sm">
            {reasons.map((reason) => (
              <li key={reason}>✓ {reason}</li>
            ))}
          </ul>
          {preference ? (
            <p className="text-sm text-muted-foreground">
              Je ontmoet liefst {preference}. Dat is een voorkeur, geen deelnamevoorwaarde.
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-2xl">Over deze activiteit</h2>
          <p className="text-sm leading-6 text-muted-foreground">{event.shortDescription}</p>
          {event.description ? (
            <p className="leading-7">{event.description}</p>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Info label="Leeftijdsregel" value={ageRuleText(event, ageLabel)} />
          <Info
            label="Singles only"
            value={
              event.singlesOnly == null
                ? "Niet vermeld"
                : event.singlesOnly
                  ? "Ja"
                  : "Nee"
            }
          />
          <Info label="Type" value={`${CATEGORY_LABEL[event.category]} · ${event.subCategory}`} />
          <Info label="Beschikbaarheid" value={event.capacityStatus === "unknown" ? "Onbekend" : undefined}>
            <CapacityStatus status={event.capacityStatus} spotsRemaining={event.spotsRemaining} />
          </Info>
          <Info
            label="Inschrijvingsdeadline"
            value={
              event.registrationDeadline
                ? formatLongDate(event.registrationDeadline)
                : "Niet vermeld"
            }
          />
          <Info
            label="Publiek"
            value={
              formatAgeRange(event.preferredAudienceAgeMin, event.preferredAudienceAgeMax) ??
              "Niet vermeld"
            }
          />
        </section>

        {event.genderAvailability ? (
          <p className="text-sm text-muted-foreground">{event.genderAvailability}</p>
        ) : null}

        {event.practicalInfo.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-heading text-2xl">Praktisch</h2>
            <ul className="space-y-2 text-sm leading-6">
              {event.practicalInfo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-heading text-2xl">Bron & actualiteit</h2>
          <FreshnessLabel lastCheckedAt={event.lastCheckedAt} />
          <p className="text-sm">
            Bron
            <br />
            <span className="text-muted-foreground">{event.sourceName}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            In dit prototype opent de knop een voorbeeldlink. Er is geen echte organisator aan gekoppeld.
          </p>
          <a
            href={event.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              track("organizer_clicked", {
                eventId: event.id,
                slug: event.slug,
                source: "detail",
              })
            }
            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            Bekijk actuele info bij organisator
            <ArrowUpRight className="size-4" />
          </a>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex w-full max-w-3xl">
          <Button asChild className="h-12 w-full rounded-xl text-base">
            <a
              href={ticketHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track("ticket_clicked", { eventId: event.id, slug: event.slug })
              }
            >
              Tickets / inschrijven bij organisator
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}

function ageRuleText(event: Event, ageLabel: string | null): string {
  if (event.eligibilityAgeRule === "unknown" || !ageLabel) {
    return "Niet vermeld door de bron";
  }
  if (event.eligibilityAgeRule === "guideline") {
    return `${ageLabel} · richtleeftijd`;
  }
  return `${ageLabel} · strikte voorwaarde`;
}

function Info({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children ?? <p className="mt-1 text-sm">{value}</p>}
    </div>
  );
}
