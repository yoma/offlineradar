/**
 * Audit public feed mood-image repetition (Fase 25).
 * Usage: node --env-file=.env.local --import tsx scripts/audit-image-diversity.ts
 */
import {
  CATEGORY_MOOD_POOLS,
  eventImageDiversityKey,
  inferRequiredImageCategory,
  resolvePublicEventImage,
} from "../lib/image-compatibility";
import { listEvents } from "../lib/events";

async function main() {
  const events = await listEvents();
  const byUrl = new Map<string, { events: number; organizers: Set<string> }>();
  const byRequired = new Map<string, number>();
  let fallbackCount = 0;

  for (const event of events) {
    const required = inferRequiredImageCategory({
      category: event.category,
      activities: event.activities,
      tags: event.tags,
      title: event.title,
      subCategory: event.subCategory,
    });
    byRequired.set(required, (byRequired.get(required) ?? 0) + 1);

    const key = eventImageDiversityKey({
      organizerId: event.organizerId,
      eventId: event.id,
      imageCategory: required,
    });
    const resolved = resolvePublicEventImage(
      {
        category: event.category,
        activities: event.activities,
        tags: event.tags,
        title: event.title,
        subCategory: event.subCategory,
      },
      event.imageUrl,
      event.imageIsAtmosphere === true,
      key,
    );
    if (resolved.usedFallback) fallbackCount++;
    const entry = byUrl.get(resolved.url) ?? {
      events: 0,
      organizers: new Set<string>(),
    };
    entry.events += 1;
    entry.organizers.add(event.organizerId ?? `event:${event.id}`);
    byUrl.set(resolved.url, entry);
  }

  const duplicates = [...byUrl.entries()]
    .filter(([, v]) => v.events >= 2)
    .sort((a, b) => b[1].events - a[1].events)
    .slice(0, 15)
    .map(([url, v]) => ({
      url: url.slice(0, 80),
      events: v.events,
      organizers: v.organizers.size,
      isPoolImage: Object.values(CATEGORY_MOOD_POOLS).some((pool) =>
        pool.includes(url),
      ),
    }));

  // Simulate legacy (no diversity): all fallbacks use pool[0]
  const legacyByUrl = new Map<string, number>();
  for (const event of events) {
    const resolved = resolvePublicEventImage(
      {
        category: event.category,
        activities: event.activities,
        tags: event.tags,
        title: event.title,
        subCategory: event.subCategory,
      },
      event.imageUrl,
      event.imageIsAtmosphere === true,
      null,
    );
    if (resolved.usedFallback) {
      legacyByUrl.set(resolved.url, (legacyByUrl.get(resolved.url) ?? 0) + 1);
    }
  }
  const legacyTop = [...legacyByUrl.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([url, n]) => ({ url: url.slice(0, 70), events: n }));

  const diverseTop = [...byUrl.entries()]
    .filter(([url]) =>
      Object.values(CATEGORY_MOOD_POOLS).some((pool) => pool.includes(url)),
    )
    .sort((a, b) => b[1].events - a[1].events)
    .slice(0, 8)
    .map(([url, v]) => ({
      url: url.slice(0, 70),
      events: v.events,
      organizers: v.organizers.size,
    }));

  console.log(
    JSON.stringify(
      {
        published: events.length,
        fallbackCount,
        requiredCounts: Object.fromEntries(byRequired),
        legacyFallbackTop: legacyTop,
        diversePoolTop: diverseTop,
        topSharedImages: duplicates,
        poolSizes: Object.fromEntries(
          Object.entries(CATEGORY_MOOD_POOLS).map(([k, v]) => [k, v.length]),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
