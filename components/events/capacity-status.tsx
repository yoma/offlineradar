import type { CapacityStatus } from "@/types/event";
import { capacityLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const dotClass: Record<CapacityStatus, string> = {
  available: "bg-emerald-600",
  limited: "bg-amber-500",
  almost_full: "bg-red-600",
  sold_out: "bg-stone-900",
  waitlist: "bg-sky-700",
  unknown: "bg-stone-300 ring-1 ring-stone-400",
};

export function CapacityStatus({
  status,
  spotsRemaining,
}: {
  status: CapacityStatus;
  spotsRemaining?: number | null;
}) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className={cn("size-2.5 rounded-full", dotClass[status])} />
      <span>{capacityLabel(status)}</span>
      {spotsRemaining != null && status !== "sold_out" ? (
        <span className="text-muted-foreground">· nog {spotsRemaining}</span>
      ) : null}
    </p>
  );
}
