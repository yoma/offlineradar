import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventDetail } from "@/components/events/event-detail";
import {
  getPreviewEventBySlug,
  isInternalPreviewEnabled,
} from "@/lib/events-preview";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/interne-preview/event/[slug]">): Promise<Metadata> {
  if (!isInternalPreviewEnabled()) {
    return { title: "Niet gevonden" };
  }
  const { slug } = await params;
  const event = await getPreviewEventBySlug(slug);
  return { title: event ? `${event.title} (interne preview)` : "Activiteit" };
}

export default async function InternePreviewEventPage({
  params,
}: PageProps<"/interne-preview/event/[slug]">) {
  if (!isInternalPreviewEnabled()) notFound();

  const { slug } = await params;
  const event = await getPreviewEventBySlug(slug);
  if (!event) notFound();

  return <EventDetail event={event} backHref="/interne-preview" showInternalReview />;
}
