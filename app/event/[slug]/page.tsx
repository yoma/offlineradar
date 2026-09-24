import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventDetail } from "@/components/events/event-detail";
import { getEventBySlug } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/event/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  return { title: event?.title ?? "Activiteit" };
}

export default async function EventPage({
  params,
}: PageProps<"/event/[slug]">) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  return <EventDetail event={event} />;
}
