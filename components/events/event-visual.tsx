import Image from "next/image";
import {
  eventImageDiversityKey,
  inferRequiredImageCategory,
  resolvePublicEventImage,
} from "@/lib/image-compatibility";
import type { ActivityId, EventCategory } from "@/types/event";
import { cn } from "@/lib/utils";

export function EventVisual({
  category,
  city,
  activities = [],
  tags = [],
  title = null,
  subCategory = null,
  minAge = null,
  maxAge = null,
  imageUrl,
  imageAlt = null,
  imageIsAtmosphere = false,
  organizerId = null,
  eventId = null,
  className = "",
  label = true,
  priority = false,
}: {
  category: EventCategory;
  city: string;
  activities?: ActivityId[];
  tags?: string[];
  title?: string | null;
  subCategory?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageIsAtmosphere?: boolean;
  organizerId?: string | null;
  eventId?: string | null;
  className?: string;
  label?: boolean;
  priority?: boolean;
}) {
  const ctx = {
    category,
    activities,
    tags,
    title,
    subCategory,
    minAge,
    maxAge,
  };
  const required = inferRequiredImageCategory(ctx);
  const diversityKey = eventImageDiversityKey({
    organizerId,
    eventId,
    imageCategory: required,
  });
  const resolved = resolvePublicEventImage(
    ctx,
    imageUrl,
    imageIsAtmosphere,
    diversityKey,
  );
  const src = resolved.url;
  const showAtmosphere = resolved.keptAtmosphere;
  const alt =
    imageAlt?.trim() && !resolved.usedFallback
      ? imageAlt.trim()
      : showAtmosphere
        ? `Sfeerbeeld voor een ${category}-activiteit in ${city}`
        : `Beeld bij activiteit in ${city}`;

  return (
    <div className={cn("relative min-w-0 overflow-hidden bg-stone-200", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        unoptimized={src.startsWith("data:")}
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover transition duration-500 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
      {showAtmosphere ? (
        <p className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white">
          Sfeerbeeld
        </p>
      ) : null}
      {label ? (
        <p className="absolute bottom-3 left-3 text-xs font-semibold tracking-wide text-white uppercase">
          {city}
        </p>
      ) : null}
    </div>
  );
}
