import { BrandShapes } from "@/components/brand/brand-shapes";
import { HomeHero } from "@/components/home/home-search";
import { TipSection } from "@/components/tips/tip-section";
import { brusselsToday } from "@/lib/dates";
import {
  EventsCatalogUnavailableError,
  isCanonicalEventsFeedEnabled,
  listEvents,
} from "@/lib/events";
import { listPublishedOrganizerOptions } from "@/lib/organizers/published-options";
import { selectUpcomingEvents } from "@/lib/upcoming";
import type { Event } from "@/types/event";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let organizerOptions: Awaited<
    ReturnType<typeof listPublishedOrganizerOptions>
  > = [];
  let upcomingEvents: Event[] = [];
  let catalogUnavailable = false;
  const today = brusselsToday();

  try {
    organizerOptions = await listPublishedOrganizerOptions();
  } catch {
    organizerOptions = [];
  }

  try {
    // Only upcoming strip on the homepage - full catalog stays off the HTML
    // (Meer-filters count uses countHomeFilterMatches server action).
    const catalogEvents = await listEvents();
    upcomingEvents = selectUpcomingEvents(catalogEvents).events;
  } catch (error) {
    if (
      isCanonicalEventsFeedEnabled() &&
      error instanceof EventsCatalogUnavailableError
    ) {
      catalogUnavailable = true;
    }
    upcomingEvents = [];
  }

  return (
    <div>
      <HomeHero
        organizerOptions={organizerOptions}
        upcomingEvents={upcomingEvents}
        today={today}
      />
      {catalogUnavailable ? (
        <p
          className="mx-auto w-full max-w-6xl px-4 pt-8 text-sm text-muted-foreground sm:px-6"
          role="status"
        >
          De catalogus is tijdelijk niet beschikbaar. Zoeken kan zo opnieuw
          lukken.
        </p>
      ) : null}
      {/* Organic shapes only below the hero photo. */}
      <div className="relative overflow-x-clip">
        <BrandShapes variant="home-lower" />
        <div className="relative">
          <TipSection />
          <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <h2 className="font-heading text-3xl tracking-tight text-[var(--brand-bordeaux)] sm:text-[2rem]">
              Zo werkt DateOfflineHub
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted-foreground">
              Geen swipes, geen chat. Alleen ontdekken wat er binnenkort
              gebeurt, en doorklikken naar de organisator.
            </p>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-10">
              <Step
                n="01"
                title="Zoek"
                text="Kies waar, wanneer en wat je wilt doen."
              />
              <Step
                n="02"
                title="Controleer"
                text="Je leeftijd bepaalt of je mag deelnemen."
              />
              <Step
                n="03"
                title="Ga erheen"
                text="Tickets en reservatie blijven bij de organisator."
              />
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li className="rounded-2xl border border-border/80 bg-white/70 px-5 py-5 shadow-[0_8px_24px_-16px_rgba(47,48,53,0.2)]">
      <p className="text-sm font-semibold tracking-[0.08em] text-primary">{n}</p>
      <h3 className="font-heading mt-2 text-xl text-[var(--brand-bordeaux)]">
        {title}
      </h3>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{text}</p>
    </li>
  );
}
