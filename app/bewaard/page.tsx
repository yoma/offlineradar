import { SavedView } from "@/components/saved/saved-view";
import { listEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const events = await listEvents();
  return <SavedView events={events} />;
}
