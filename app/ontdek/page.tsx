import { DiscoverView } from "@/components/discover/discover-view";
import { auth } from "@/auth";
import {
  EventsCatalogUnavailableError,
  isCanonicalEventsFeedEnabled,
  listEvents,
} from "@/lib/events";
import { parseResultRefinement } from "@/lib/result-refinement";
import { parseSearchState } from "@/lib/search-state";
import { getUserPreferences } from "@/lib/users/store";

export const dynamic = "force-dynamic";

export default async function OntdekPage({
  searchParams,
}: PageProps<"/ontdek">) {
  const raw = await searchParams;
  const initial = parseSearchState(raw);
  const initialRefinement = parseResultRefinement(raw);

  // Session is JWT-only (no DB). Preferences load only when logged in.
  const session = await auth();
  const userId = session?.user?.id;
  let serverPreferences = null;
  if (userId) {
    try {
      serverPreferences = await getUserPreferences(userId);
    } catch {
      serverPreferences = null;
    }
  }

  try {
    const events = await listEvents();
    return (
      <DiscoverView
        events={events}
        initial={initial}
        initialRefinement={initialRefinement}
        isLoggedIn={Boolean(userId)}
        serverPreferences={serverPreferences}
      />
    );
  } catch (error) {
    if (
      isCanonicalEventsFeedEnabled() &&
      error instanceof EventsCatalogUnavailableError
    ) {
      return (
        <DiscoverView
          events={[]}
          initial={initial}
          initialRefinement={initialRefinement}
          isLoggedIn={Boolean(userId)}
          serverPreferences={serverPreferences}
          catalogError="De eventcatalogus is tijdelijk niet beschikbaar. Probeer het later opnieuw."
        />
      );
    }
    throw error;
  }
}
