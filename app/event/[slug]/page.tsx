import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { EventDetail } from "@/components/events/event-detail";
import {
  EventsCatalogUnavailableError,
  getEventBySlug,
  isCanonicalEventsFeedEnabled,
} from "@/lib/events";
import { formatLongDate } from "@/lib/dates";
import { resolveWebsiteVisibleEventImage } from "@/lib/images";
import { isFollowingOrganizer } from "@/lib/users/store";
import type { Event } from "@/types/event";

export const dynamic = "force-dynamic";

/** One catalog lookup per request, shared by metadata and page. */
const loadEvent = cache(getEventBySlug);

/** "Zondag 25 oktober, 11:00 in Turnhout. <organiser text>" (max ~160 chars). */
function eventDescription(event: Event): string {
  const when = `${formatLongDate(event.startDate)}${event.startTime ? `, ${event.startTime}` : ""}`;
  const lead = `${when.charAt(0).toUpperCase()}${when.slice(1)}${event.city ? ` in ${event.city}` : ""}.`;
  const text = `${lead} ${(event.shortDescription ?? "").trim()}`.trim();
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export async function generateMetadata({
  params,
}: PageProps<"/event/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const event = await loadEvent(slug);
    if (!event) return { title: "Activiteit" };
    const description = eventDescription(event);
    // Same image the page shows; the neutral data-URI fallback is no share image.
    const image = resolveWebsiteVisibleEventImage(event).url;
    const images = image.startsWith("data:")
      ? undefined
      : [{ url: image, alt: event.imageAlt ?? event.title }];
    return {
      title: event.title,
      description,
      alternates: { canonical: `/event/${slug}` },
      openGraph: {
        type: "website",
        url: `/event/${slug}`,
        title: event.title,
        description,
        ...(images ? { images } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: event.title,
        description,
        ...(images ? { images } : {}),
      },
    };
  } catch {
    return { title: "Activiteit" };
  }
}

export default async function EventPage({
  params,
}: PageProps<"/event/[slug]">) {
  const { slug } = await params;
  try {
    const event = await loadEvent(slug);
    if (!event) notFound();

    let initialFollowingOrganizer = false;
    const session = await auth();
    const userId = session?.user?.id;
    if (userId && event.organizerId) {
      try {
        initialFollowingOrganizer = await isFollowingOrganizer(
          userId,
          event.organizerId,
        );
      } catch {
        initialFollowingOrganizer = false;
      }
    }

    return (
      <EventDetail
        event={event}
        initialFollowingOrganizer={initialFollowingOrganizer}
      />
    );
  } catch (error) {
    if (
      isCanonicalEventsFeedEnabled() &&
      error instanceof EventsCatalogUnavailableError
    ) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Catalogus tijdelijk niet beschikbaar
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            We konden deze activiteit nu niet laden. Probeer het later opnieuw.
          </p>
        </div>
      );
    }
    throw error;
  }
}
