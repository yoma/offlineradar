/**
 * Render three definitive Phase 3A PNG samples (1080×1350) for visual review.
 * Uses published catalog when available; otherwise demo events.
 *
 * Usage: npx tsx scripts/render-instagram-phase3a-samples.ts [outDir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listEvents } from "@/lib/events";
import { buildPhase3aPreviewDrafts } from "@/lib/instagram/drafts";
import { renderInstagramImage } from "@/lib/instagram/render";
import type { Event } from "@/types/event";

function demoCatalog(now: Date): Event[] {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const add = (days: number) => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d! + days, 12));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  };

  const base = {
    slug: "demo",
    shortDescription: "",
    description: null,
    category: "dating" as const,
    subCategory: "wandelen",
    organizerId: null,
    venue: null,
    venueId: null,
    latitude: 50.8,
    longitude: 4.7,
    distanceKm: 20,
    endDate: null,
    endTime: null,
    price: 25,
    currency: "EUR" as const,
    eligibility: { default: null, byGender: null, allowedGenders: null },
    eligibilityAgeMin: 30,
    eligibilityAgeMax: 50,
    eligibilityAgeRule: "guideline" as const,
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    knownAudienceGenders: null,
    singlesOnly: true,
    singlesOriented: true,
    singlesFriendly: false,
    listingPath: "organic" as const,
    meetActivation: null,
    genderAvailability: null,
    capacityStatus: "unknown" as const,
    spotsRemaining: null,
    registrationDeadline: null,
    socialSuitability: "high" as const,
    sourceType: "official_website" as const,
    sourceName: "demo",
    officialUrl: "https://dateofflinehub.be",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: null,
    addedAt: now.toISOString(),
    imageUrl: null,
    tags: [] as string[],
    practicalInfo: [] as string[],
  };

  return [
    {
      ...base,
      id: "demo-1",
      title: "Waargebeurde Leuvense griezel- en gruwelsagen",
      startDate: add(2),
      startTime: "19:30",
      city: "Leuven",
      region: "Vlaams-Brabant",
      organizerName: "Sportieve Singles",
      activities: ["wandelen"],
      shortDescription: "Halloween stadswandeling door Leuven.",
      subCategory: "wandelen",
    },
    {
      ...base,
      id: "demo-2",
      title: "Speeddate Gent 35-45",
      startDate: add(3),
      startTime: "20:00",
      city: "Gent",
      region: "Oost-Vlaanderen",
      organizerName: "SmartVibes",
      activities: ["speeddate"],
      subCategory: "speeddate",
    },
    {
      ...base,
      id: "demo-3",
      title: "Singles bowling Antwerpen",
      startDate: add(4),
      startTime: "19:00",
      city: "Antwerpen",
      region: "Antwerpen",
      organizerName: "Will You Date Me",
      activities: ["sport"],
      subCategory: "bowling",
    },
    {
      ...base,
      id: "demo-4",
      title: "Apero & connecties Mechelen",
      startDate: add(5),
      startTime: "18:30",
      city: "Mechelen",
      region: "Antwerpen",
      organizerName: "The Sircle",
      activities: ["drinken"],
      subCategory: "drinken",
    },
    {
      ...base,
      id: "demo-5",
      title: "Halloween feest Brugge",
      startDate: add(6),
      startTime: "21:00",
      city: "Brugge",
      region: "West-Vlaanderen",
      organizerName: "Single Events",
      activities: ["party"],
      subCategory: "party",
    },
  ];
}

async function pngBytes(response: Response): Promise<Buffer> {
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}

async function main() {
  const outDir =
    process.argv[2] ||
    path.join("/opt/cursor/artifacts");
  await mkdir(outDir, { recursive: true });

  const now = new Date();
  let catalog: Event[] = [];
  let source = "demo";
  try {
    catalog = await listEvents();
    if (catalog.length >= 4) source = "published";
    else catalog = demoCatalog(now);
  } catch {
    catalog = demoCatalog(now);
  }

  const { drafts, notes } = buildPhase3aPreviewDrafts(catalog, now);
  console.log(`source=${source} drafts=${drafts.length}`);
  for (const n of notes) console.log(`note: ${n}`);

  const binnenkort = drafts.find((d) => d.format === "binnenkort");
  const week = drafts.find((d) => d.format === "deze_week");

  if (!binnenkort || binnenkort.events.length === 0) {
    throw new Error("No binnenkort draft — cannot render samples");
  }

  const cover = await renderInstagramImage({
    kind: "binnenkort_cover",
    periodLabel: binnenkort.periodLabel,
    events: binnenkort.events,
  });
  const eventSlide = await renderInstagramImage({
    kind: "event",
    event: binnenkort.events[0],
    index: 1,
    total: binnenkort.events.length,
    format: "binnenkort",
  });

  const weekEvents = week?.events?.length
    ? week.events
    : binnenkort.events.slice(0, 4);
  const weekLabel = week?.periodLabel ?? binnenkort.periodLabel;
  const weekPng = await renderInstagramImage({
    kind: "deze_week",
    periodLabel: weekLabel,
    events: weekEvents,
  });

  const files = [
    ["ig-format-a-cover.png", cover],
    ["ig-format-a-event-slide.png", eventSlide],
    ["ig-format-b-deze-week.png", weekPng],
  ] as const;

  for (const [name, res] of files) {
    const buf = await pngBytes(res as unknown as Response);
    const dest = path.join(outDir, name);
    await writeFile(dest, buf);
    console.log(`wrote ${dest} (${buf.byteLength} bytes)`);
  }

  console.log("OK: Instagram Phase 3A sample PNGs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
