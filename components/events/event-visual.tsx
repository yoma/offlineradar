import type { EventCategory } from "@/types/event";
import { CATEGORY_LABEL } from "@/lib/format";

const wash: Record<EventCategory, string> = {
  dating: "from-stone-800 via-emerald-900 to-stone-700",
  meet_new_people: "from-amber-900 via-stone-800 to-emerald-950",
  social: "from-emerald-950 via-teal-900 to-stone-800",
};

export function EventVisual({
  category,
  city,
  className = "",
}: {
  category: EventCategory;
  city: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${wash[category]} ${className}`}
    >
      <div className="absolute -right-6 -top-8 size-32 rounded-full border border-white/20" />
      <div className="absolute right-6 top-6 size-16 rounded-full border border-white/25" />
      <div className="absolute bottom-4 left-4 text-sm font-medium text-white/90">
        {CATEGORY_LABEL[category]} · {city}
      </div>
    </div>
  );
}
