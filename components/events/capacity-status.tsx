import type { CapacityStatus as Capacity } from "@/types/event";
import { capacityLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const tone: Record<Capacity, string> = {
  available: "text-emerald-700",
  limited: "text-amber-700",
  almost_full: "text-red-700",
  sold_out: "text-foreground",
  waitlist: "text-sky-700",
  unknown: "text-muted-foreground",
};

const dot: Record<Capacity, string> = {
  available: "bg-emerald-600",
  limited: "bg-amber-500",
  almost_full: "bg-red-600",
  sold_out: "bg-stone-800",
  waitlist: "bg-sky-600",
  unknown: "bg-stone-300",
};

export function CapacityStatus({
  status,
  spotsRemaining,
}: {
  status: Capacity;
  spotsRemaining?: number | null;
}) {
  if (status === "unknown") return null;
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-sm", tone[status])}>
      <span className={cn("size-1.5 rounded-full", dot[status])} />
      <span>{capacityLabel(status)}</span>
      {spotsRemaining != null && status !== "sold_out" ? (
        <span className="text-muted-foreground">· {spotsRemaining}</span>
      ) : null}
    </p>
  );
}
