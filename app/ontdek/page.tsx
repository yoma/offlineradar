import { DiscoverView } from "@/components/discover/discover-view";
import { listEvents } from "@/lib/events";
import { parseSearchState } from "@/lib/search-state";

export const dynamic = "force-dynamic";

export default async function OntdekPage({
  searchParams,
}: PageProps<"/ontdek">) {
  const raw = await searchParams;
  const events = await listEvents();
  const initial = parseSearchState(raw);
  return <DiscoverView events={events} initial={initial} />;
}
