"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { CapacityStatus } from "@/components/events/capacity-status";
import { EventVisual } from "@/components/events/event-visual";
import { FreshnessLabel } from "@/components/events/freshness-label";
import { SaveButton } from "@/components/events/save-button";
import { Button } from "@/components/ui/button";
import { findPlace } from "@/data/places";
import { track } from "@/lib/analytics";
import { withUserDistance } from "@/lib/distance";
import {
  displayEligibilityAge,
  isEligibleForEvent,
} from "@/lib/eligibility";
import {
  CATEGORY_LABEL,
  formatAgeRange,
  formatDeadlineDetail,
  formatMeetPreferenceSentence,
  formatPrice,
  formatSchedule,
} from "@/lib/format";
import { defaultSearchState } from "@/lib/search-state";
import { readProfile } from "@/lib/storage";
import { whyThisFits } from "@/lib/why";
import type { Event, UserGender } from "@/types/event";
import type { SearchState } from "@/types/search";

export function EventDetail({ event }: { event: Event }) {
  const [state, setState] = useState<SearchState>(defaultSearchState());

  useEffect(() => {
    track("event_opened", { eventId: event.id, slug: event.slug });
    const profile = readProfile();
    const params = new URLSearchParams(window.location.search);
    const ageFromQuery = Number(params.get("age"));
    const genderParam = params.get("gender") as UserGender | null;
    queueMicrotask(() => {
      setState({
        ...defaultSearchState(),
        age:
          Number.isFinite(ageFromQuery) && ageFromQuery >= 18
            ? ageFromQuery
            : profile.age,
        gender: genderParam || profile.gender,
        placeId: params.get("place") || profile.placeId,
        maxDistanceKm: profile.maxDistanceKm,
        preferredAgeMin: profile.preferredAgeMin,
        preferredAgeMax: profile.preferredAgeMax,
        preferredMeetGender: profile.preferredMeetGender,
        activities: profile.interests,
      });
    });
  }, [event.id, event.slug]);

  const place = findPlace(state.placeId);
  const placed = withUserDistance(event, state.placeId);
  const eligibility = isEligibleForEvent(
    { age: state.age, gender: state.gender },
    placed,
  );
  const prepared = { ...placed, participation: eligibility };
  const reasons = whyThisFits(prepared, state);
  const ageInfo = displayEligibilityAge(event, state.gender);
  const ageLabel = formatAgeRange(ageInfo.min, ageInfo.max);
  const ticketHref = event.ticketUrl ?? event.officialUrl;
  const preferenceSentence = formatMeetPreferenceSentence(
    state.preferredMeetGender,
    state.preferredAgeMin,
    state.preferredAgeMax,
  );
  const expectedAudience =
    event.audienceAgeFromSource
      ? formatAgeRange(
          event.preferredAudienceAgeMin,
          event.preferredAudienceAgeMax,
        )
      : null;

  return (
    <article className="pb-32 md:pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <EventVisual
          category={event.category}
          city={event.city}
          activities={event.activities}
          imageUrl={event.imageUrl}
          className="aspect-[16/10] rounded-2xl sm:aspect-[21/9]"
          label={false}
          priority
        />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-10">
          <header className="space-y-3 border-b border-border pb-8">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {CATEGORY_LABEL[event.category]} · {event.subCategory}
              </p>
              <SaveButton eventId={event.id} title={event.title} />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {event.title}
            </h1>
            <p className="text-[15px] text-muted-foreground">
              {event.venue ? `${event.venue}, ` : ""}
              {event.city} · {placed.distanceKm} km van {place.label}
            </p>
            <p className="text-[15px]">
              {formatSchedule(event)} ·{" "}
              {formatPrice(event.price, event.currency)} · {event.organizerName}
            </p>
          </header>

          <section
            className={`rounded-2xl border px-5 py-4 ${
              eligibility.status === "ineligible"
                ? "border-red-200 bg-red-50"
                : eligibility.status === "unknown" ||
                    eligibility.status === "needs_age" ||
                    eligibility.status === "needs_gender" ||
                    (eligibility.status === "guideline" &&
                      eligibility.inRange === false)
                  ? "border-amber-200 bg-amber-50"
                  : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <h2 className="text-lg font-semibold">{eligibility.title}</h2>
            <p className="mt-1.5 text-sm leading-6 text-foreground/80">
              {eligibility.detail}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">
              Waarom past dit bij jou?
            </h2>
            <ul className="space-y-2 text-[15px] leading-6">
              {reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span className="text-emerald-700">✓</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            {preferenceSentence ? (
              <p className="text-sm text-muted-foreground">
                {preferenceSentence} Dat is een voorkeur, geen
                deelnamevoorwaarde.
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">
              Over deze activiteit
            </h2>
            <p className="text-[15px] leading-7 text-muted-foreground">
              {event.shortDescription}
            </p>
            {event.description ? (
              <p className="text-[15px] leading-7">{event.description}</p>
            ) : null}
          </section>

          {event.practicalInfo.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Praktisch</h2>
              <ul className="space-y-2 text-[15px] leading-6 text-muted-foreground">
                {event.practicalInfo.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="lg:pt-2">
          <div className="listing-shadow sticky top-24 space-y-4 rounded-2xl border border-border bg-white p-5">
            <div className="flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold">
                {formatPrice(event.price, event.currency)}
              </p>
              {event.capacityStatus === "unknown" ? (
                <p className="text-sm text-muted-foreground">
                  Beschikbaarheid onbekend
                </p>
              ) : (
                <CapacityStatus
                  status={event.capacityStatus}
                  spotsRemaining={event.spotsRemaining}
                />
              )}
            </div>

            <dl className="space-y-3 border-t border-border pt-4 text-sm">
              <Meta
                label="Deelnamevoorwaarden"
                value={ageRuleText(ageInfo.rule, ageLabel, event)}
              />
              {expectedAudience ? (
                <Meta
                  label="Verwachte leeftijdsgroep"
                  value={expectedAudience}
                />
              ) : null}
              <Meta
                label="Singles only"
                value={
                  event.singlesOnly == null
                    ? "Niet vermeld"
                    : event.singlesOnly
                      ? "Ja"
                      : "Nee"
                }
              />
              <Meta
                label="Deadline"
                value={formatDeadlineDetail(event.registrationDeadline)}
              />
            </dl>

            {event.genderAvailability ? (
              <p className="text-sm text-muted-foreground">
                {event.genderAvailability}
              </p>
            ) : null}

            <Button
              asChild
              className="hidden h-12 w-full rounded-full text-base md:inline-flex"
            >
              <a
                href={ticketHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("ticket_clicked", {
                    eventId: event.id,
                    slug: event.slug,
                  })
                }
              >
                Tickets / inschrijven bij organisator
                <ArrowUpRight className="size-4" />
              </a>
            </Button>

            <div className="space-y-2 border-t border-border pt-4">
              <FreshnessLabel lastCheckedAt={event.lastCheckedAt} />
              <p className="text-sm text-muted-foreground">
                Bron: {event.sourceName}
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
                className="inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
              >
                Bekijk officiële bron
                <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-white/95 p-3 backdrop-blur md:hidden">
        <Button asChild className="h-12 w-full rounded-full text-base">
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
    </article>
  );
}

function ageRuleText(
  rule: Event["eligibilityAgeRule"],
  ageLabel: string | null,
  event: Event,
): string {
  if (event.eligibility.byGender) {
    const parts: string[] = [];
    if (event.eligibility.byGender.man) {
      const band = event.eligibility.byGender.man;
      const label = formatAgeRange(band.ageMin, band.ageMax);
      if (label) {
        parts.push(
          `mannen ${label}${band.ageRule === "guideline" ? " (richtlijn)" : ""}`,
        );
      }
    }
    if (event.eligibility.byGender.woman) {
      const band = event.eligibility.byGender.woman;
      const label = formatAgeRange(band.ageMin, band.ageMax);
      if (label) {
        parts.push(
          `vrouwen ${label}${band.ageRule === "guideline" ? " (richtlijn)" : ""}`,
        );
      }
    }
    if (parts.length) return parts.join(" · ");
  }
  if (rule === "unknown" || !ageLabel) {
    return "Niet vermeld door de bron";
  }
  if (rule === "guideline") return `Richtleeftijd: ${ageLabel}`;
  return `Deelnamevoorwaarde: ${ageLabel}`;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
