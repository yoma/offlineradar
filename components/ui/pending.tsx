"use client";

import { cn } from "@/lib/utils";

/** Shared motion cue for in-flight actions (forms, transitions, fetches). */
export function PendingSpinner({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        size === "sm" ? "size-3.5" : "size-4",
        className,
      )}
      aria-hidden
    />
  );
}

/** Idle label vs spinner + pending label (same look everywhere). */
export function PendingContent({
  pending,
  pendingLabel = "Bezig…",
  children,
}: {
  pending: boolean;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  if (!pending) return children;
  return (
    <>
      <PendingSpinner />
      <span>{pendingLabel}</span>
    </>
  );
}
