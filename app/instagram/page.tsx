import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/events/event-card";
import { isEligibleForEvent } from "@/lib/eligibility";
import { listEvents, readCatalog } from "@/lib/events";
import type { PreparedEvent } from "@/lib/filters";
import { listSingleEventCandidates } from "@/lib/instagram/drafts";
import { listRecentlyPostedEventIds } from "@/lib/instagram/queue";
import type { Event } from "@/types/event";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Van Instagram",
  description:
    "De activiteiten uit onze recente Instagram-posts: meer info en inschrijven bij de organisator.",
  alternates: { canonical: "/instagram" },
};

const FALLBACK_COUNT = 12;

function prepare(event: Event): PreparedEvent {
  return {
    ...event,
    distanceKm: Number.isFinite(event.distanceKm) ? event.distanceKm : 0,
    participation: isEligibleForEvent({ age: null, gender: null }, event),
  };
}

/**
 * Link-in-bio page: Instagram captions and stories point here
 * (links in captions are not clickable on Instagram).
 */
export default async function InstagramLinkPage() {
  const catalog = await readCatalog(listEvents);
  const upcoming = catalog.ok ? listSingleEventCandidates(catalog.value) : [];

  let postedIds: string[] = [];
  try {
    postedIds = await listRecentlyPostedEventIds();
  } catch {
    postedIds = [];
  }
  const posted = new Set(postedIds);
  const fromPosts = upcoming.filter((e) => posted.has(e.id));
  const events = (fromPosts.length > 0 ? fromPosts : upcoming.slice(0, FALLBACK_COUNT)).map(
    prepare,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl tracking-tight text-[var(--brand-bordeaux)] sm:text-3xl">
        {fromPosts.length > 0 ? "Uit onze Instagram-posts" : "Binnenkort te beleven"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Tik op een activiteit voor alle info. Inschrijven doe je rechtstreeks bij de
        organisator.
      </p>

      {events.length === 0 ? (
        <p className="mt-12 max-w-md text-[15px] leading-7 text-muted-foreground">
          Er staan nu geen activiteiten gepland. Kijk binnenkort opnieuw.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      <div className="mt-12 flex justify-center">
        <Link
          href="/"
          className="rounded-xl bg-[var(--brand-bordeaux)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-bordeaux-muted)]"
        >
          Bekijk alle activiteiten
        </Link>
      </div>
    </div>
  );
}
