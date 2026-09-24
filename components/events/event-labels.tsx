import { eventLabels } from "@/lib/event-labels";
import type { Event } from "@/types/event";

export function EventLabels({
  event,
  compact = false,
}: {
  event: Pick<Event, "singlesOnly" | "singlesFriendly" | "meetActivation">;
  compact?: boolean;
}) {
  const labels = eventLabels(event);
  if (labels.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-1"}`}>
      {labels.map((label) => (
        <span
          key={label.kind}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            label.kind === "meet"
              ? "border-foreground/20 bg-foreground text-white"
              : "border-border bg-white text-foreground"
          }`}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}
