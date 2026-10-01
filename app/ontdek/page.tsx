import { DiscoverView } from "@/components/discover/discover-view";
import { auth } from "@/auth";
import {
  EventsCatalogUnavailableError,
  isCanonicalEventsFeedEnabled,
  listEvents,
} from "@/lib/events";
import { parseResultRefinement } from "@/lib/result-refinement";
import { parseSearchState } from "@/lib/search-state";
import {
  getUserPreferences,
  listFollowedOrganizerIds,
} from "@/lib/users/store";

export const dynamic = "force-dynamic";

export default async function OntdekPage({
  searchParams,
}: PageProps<"/ontdek">) {
  const raw = await searchParams;
  const initial = parseSearchState(raw);
  const initialRefinement = parseResultRefinement(raw);

  // Session is JWT-only (no DB). Preferences/follows load only when logged in.
  const session = await auth();
  const userId = session?.user?.id;
  let serverPreferences = null;
  let followedOrganizerIds: string[] = [];
  if (userId) {
    try {
      const [prefs, followed] = await Promise.all([
        getUserPreferences(userId),
        listFollowedOrganizerIds(userId),
      ]);
      serverPreferences = prefs;
      followedOrganizerIds = followed;
    } catch {
      serverPreferences = null;
      followedOrganizerIds = [];
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
        followedOrganizerIds={followedOrganizerIds}
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
          followedOrganizerIds={followedOrganizerIds}
          catalogError="De eventcatalogus is tijdelijk niet beschikbaar. Probeer het later opnieuw."
        />
      );
    }
    throw error;
  }
}
