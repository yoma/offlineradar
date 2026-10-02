import Link from "next/link";
import { Lock } from "lucide-react";
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
  const today = brusselsToday();

  try {
    organizerOptions = await listPublishedOrganizerOptions();
  } catch {
    organizerOptions = [];
  }

  try {
    // Only upcoming strip on the homepage — full catalog stays off the HTML
    // (Meer-filters count uses countHomeFilterMatches server action).
    const catalogEvents = await listEvents();
    upcomingEvents = selectUpcomingEvents(catalogEvents).events;
  } catch (error) {
    if (
      !(
        isCanonicalEventsFeedEnabled() &&
        error instanceof EventsCatalogUnavailableError
      )
    ) {
      // Soft-fail: homepage still works without the strip.
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
      {/* Tip section sits where the first discovery strip would continue:
          visible after the hero, before the product explainer. */}
      <TipSection />
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Zo werkt DateOfflineHub
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Geen swipes, geen chat. Alleen ontdekken wat er binnenkort gebeurt, en doorklikken naar de organisator.
        </p>
        <ol className="mt-10 grid gap-10 sm:grid-cols-3">
          <Step n="01" title="Zoek" text="Kies waar, wanneer en wat je wilt doen." />
          <Step n="02" title="Controleer" text="Je leeftijd bepaalt of je mag deelnemen." />
          <Step n="03" title="Ga erheen" text="Tickets en reservatie blijven bij de organisator." />
        </ol>
      </section>
      <div className="mx-auto flex w-full max-w-6xl justify-start px-4 pb-24 sm:px-6 md:pb-10">
        <Link
          href="/interne-tips"
          className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
          aria-label="Interne tipwachtrij (beheerder)"
          title="Beheer"
        >
          <Lock className="size-5" aria-hidden />
          <span className="sr-only">Beheer</span>
        </Link>
      </div>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li>
      <p className="text-sm font-semibold text-primary">{n}</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{text}</p>
    </li>
  );
}
