import { SavedView } from "@/components/saved/saved-view";
import {
  EventsCatalogUnavailableError,
  isCanonicalEventsFeedEnabled,
  listEvents,
} from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  try {
    const events = await listEvents();
    return <SavedView events={events} />;
  } catch (error) {
    if (
      isCanonicalEventsFeedEnabled() &&
      error instanceof EventsCatalogUnavailableError
    ) {
      return <SavedView events={[]} />;
    }
    throw error;
  }
}
