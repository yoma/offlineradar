import { eventLabels, type EventLabelSurface } from "@/lib/event-labels";
import type { Event } from "@/types/event";

export function EventLabels({
  event,
  compact = false,
  surface = "public",
}: {
  event: Pick<
    Event,
    "singlesOnly" | "singlesFriendly" | "singlesOriented" | "meetActivation"
  >;
  compact?: boolean;
  /** Internal preview may pass "review" to show Singlesgericht. */
  surface?: EventLabelSurface;
}) {
  const labels = eventLabels(event, surface);
  if (labels.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-1"}`}>
      {labels.map((label) => (
        <span
          key={label.kind}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            label.kind === "meet"
              ? "border-foreground/20 bg-foreground text-white"
              : label.kind === "singles_only"
                ? "border-[#e61e4d]/30 bg-[#e61e4d]/8 text-foreground"
                : "border-border bg-white text-foreground"
          }`}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}
