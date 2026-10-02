"use client";

import type { VariantProps } from "class-variance-authority";
import { useFormStatus } from "react-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { PendingContent } from "@/components/ui/pending";
import { cn } from "@/lib/utils";

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

type CommonProps = {
  /** Shown while the parent form action is pending. */
  pendingLabel?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

/**
 * Submit control for `<form action={serverAction}>`.
 * Uses the same spinner + “Bezig…” cue site-wide via useFormStatus.
 */
export function ActionSubmitButton({
  pendingLabel = "Bezig…",
  children,
  className,
  disabled,
  ...props
}: CommonProps &
  Omit<React.ComponentProps<"button">, "children" | "type" | "disabled">) {
  const { pending } = useFormStatus();
  const busy = pending || Boolean(disabled);

  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <PendingContent pending={pending} pendingLabel={pendingLabel}>
        {children}
      </PendingContent>
    </button>
  );
}

/** Same pending behavior, styled as the shared Button. */
export function ActionButton({
  pendingLabel = "Bezig…",
  children,
  className,
  disabled,
  variant,
  size,
  ...props
}: CommonProps &
  ButtonVariantProps &
  Omit<
    React.ComponentProps<typeof Button>,
    "children" | "type" | "disabled" | "asChild"
  >) {
  const { pending } = useFormStatus();
  const busy = pending || Boolean(disabled);

  return (
    <Button
      type="submit"
      disabled={busy}
      aria-busy={pending || undefined}
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      {...props}
    >
      <PendingContent pending={pending} pendingLabel={pendingLabel}>
        {children}
      </PendingContent>
    </Button>
  );
}
