import type { MetadataRoute } from "next";
import { listEvents } from "@/lib/events";
import { SITE_URL } from "@/lib/site";

// Built per request: the catalog lives in Neon and changes daily.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/ontdek`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/over`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.1 },
  ];

  try {
    const events = await listEvents();
    return [
      ...pages,
      ...events.map((event) => ({
        url: `${SITE_URL}/event/${event.slug}`,
        lastModified: event.lastCheckedAt ?? undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    // Catalog down: still serve the static pages.
    return pages;
  }
}
