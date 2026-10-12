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
                ? "border-[color-mix(in_srgb,var(--brand-bordeaux)_28%,var(--brand-gold)_20%)] bg-[var(--brand-bordeaux-soft)] text-[var(--brand-bordeaux)]"
                : "border-[color-mix(in_srgb,var(--border)_75%,var(--brand-rose)_25%)] bg-white text-foreground"
          }`}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}
