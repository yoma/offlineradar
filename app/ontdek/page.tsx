import { DiscoverView } from "@/components/discover/discover-view";
import {
  EventsCatalogUnavailableError,
  isCanonicalEventsFeedEnabled,
  listEvents,
} from "@/lib/events";
import { parseSearchState } from "@/lib/search-state";

export const dynamic = "force-dynamic";

export default async function OntdekPage({
  searchParams,
}: PageProps<"/ontdek">) {
  const raw = await searchParams;
  const initial = parseSearchState(raw);

  try {
    const events = await listEvents();
    return <DiscoverView events={events} initial={initial} />;
  } catch (error) {
    if (
      isCanonicalEventsFeedEnabled() &&
      error instanceof EventsCatalogUnavailableError
    ) {
      return (
        <DiscoverView
          events={[]}
          initial={initial}
          catalogError="De eventcatalogus is tijdelijk niet beschikbaar. Probeer het later opnieuw."
        />
      );
    }
    throw error;
  }
}
