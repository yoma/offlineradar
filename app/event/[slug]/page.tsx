import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { EventDetail } from "@/components/events/event-detail";
import {
  EventsCatalogUnavailableError,
  getEventBySlug,
  isCanonicalEventsFeedEnabled,
} from "@/lib/events";
import { isFollowingOrganizer } from "@/lib/users/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/event/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const event = await getEventBySlug(slug);
    return { title: event?.title ?? "Activiteit" };
  } catch {
    return { title: "Activiteit" };
  }
}

export default async function EventPage({
  params,
}: PageProps<"/event/[slug]">) {
  const { slug } = await params;
  try {
    const event = await getEventBySlug(slug);
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
