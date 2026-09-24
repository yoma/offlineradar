import Image from "next/image";
import { eventImageUrl } from "@/lib/images";
import type { ActivityId, EventCategory } from "@/types/event";
import { cn } from "@/lib/utils";

export function EventVisual({
  category,
  city,
  activities = [],
  imageUrl,
  className = "",
  label = true,
  priority = false,
}: {
  category: EventCategory;
  city: string;
  activities?: ActivityId[];
  imageUrl?: string | null;
  className?: string;
  label?: boolean;
  priority?: boolean;
}) {
  const src = eventImageUrl({ imageUrl, category, activities });
  return (
    <div className={cn("relative overflow-hidden bg-stone-200", className)}>
      <Image
        src={src}
        alt=""
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover transition duration-500 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
      {label ? (
        <p className="absolute bottom-3 left-3 text-xs font-semibold tracking-wide text-white uppercase">
          {city}
        </p>
      ) : null}
    </div>
  );
}
