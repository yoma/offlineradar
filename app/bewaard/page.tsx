import type { Metadata } from "next";
import { SavedView } from "@/components/saved/saved-view";
import {
  EventsCatalogUnavailableError,
  isCanonicalEventsFeedEnabled,
  listEvents,
} from "@/lib/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bewaard",
  robots: { index: false },
};

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
