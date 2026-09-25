import { notFound } from "next/navigation";
import { DiscoverView } from "@/components/discover/discover-view";
import {
  isInternalPreviewEnabled,
  listPreviewEvents,
} from "@/lib/events-preview";
import { parseSearchState } from "@/lib/search-state";

export const dynamic = "force-dynamic";

/**
 * Local-only internal preview of real singles events (Fase 5).
 * Requires OFFLINERADAR_INTERNAL_PREVIEW=1. Not part of the public feed.
 */
export default async function InternePreviewPage({
  searchParams,
}: PageProps<"/interne-preview">) {
  if (!isInternalPreviewEnabled()) notFound();

  const raw = await searchParams;
  const events = await listPreviewEvents();
  const initial = parseSearchState(raw);

  return (
    <DiscoverView
      events={events}
      initial={initial}
      listPath="/interne-preview"
      eventBasePath="/interne-preview/event"
      showInternalPreviewBanner
    />
  );
}
