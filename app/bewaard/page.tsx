import type { Metadata } from "next";
import { SavedView } from "@/components/saved/saved-view";
import { listEvents, readCatalog } from "@/lib/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bewaard",
  robots: { index: false },
};

export default async function SavedPage() {
  const catalog = await readCatalog(listEvents);
  return <SavedView events={catalog.ok ? catalog.value : []} />;
}
