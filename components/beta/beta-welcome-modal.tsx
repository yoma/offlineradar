"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Dialog } from "radix-ui";
import { useEffect, useId, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import {
  isBetaWelcomeEnabled,
  markBetaWelcomeSeen,
  readBetaWelcomeSeen,
  shouldSkipBetaWelcomePath,
} from "@/lib/beta-welcome";
import { cn } from "@/lib/utils";

function buildLoginHref(): string {
  if (typeof window === "undefined") return "/inloggen?callbackUrl=%2Fontdek";
  const path = `${window.location.pathname}${window.location.search}`;
  const safe =
    path.startsWith("/") && !path.startsWith("//") ? path : "/ontdek";
  return `/inloggen?callbackUrl=${encodeURIComponent(safe)}`;
}

export function BetaWelcomeModal() {
  const enabled = isBetaWelcomeEnabled();
  const pathname = usePathname();
  const { status } = useSession();
  const titleId = useId();
  const descId = useId();
  const [open, setOpen] = useState(false);
  const [loginHref, setLoginHref] = useState("/inloggen?callbackUrl=%2Fontdek");

  useEffect(() => {
    setLoginHref(buildLoginHref());
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;
    if (status === "loading") return;
    if (status === "authenticated") return;
    if (shouldSkipBetaWelcomePath(pathname)) return;
    if (readBetaWelcomeSeen()) return;
    setOpen(true);
    track("beta_welcome_shown");
  }, [enabled, status, pathname]);

  if (!enabled) return null;

  function closeAndRemember() {
    markBetaWelcomeSeen();
    setOpen(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeAndRemember();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-[60] bg-black/40",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            "duration-150",
          )}
        />
        <Dialog.Content
          aria-labelledby={titleId}
          aria-describedby={descId}
          className={cn(
            "fixed top-1/2 left-1/2 z-[60] w-[min(100vw-1.5rem,36rem)] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-background p-5 shadow-lg sm:p-6",
            "max-h-[min(90dvh,40rem)] overflow-y-auto outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            "duration-150",
          )}
          onOpenAutoFocus={(event) => {
            const target = (event.currentTarget as HTMLElement).querySelector(
              "[data-beta-welcome-primary]",
            );
            if (target instanceof HTMLElement) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title
              id={titleId}
              className="pr-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
              Welkom bij de OfflineRadar beta 👋
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label="Sluiten"
              >
                <XIcon />
              </Button>
            </Dialog.Close>
          </div>

          <Dialog.Description asChild>
            <div
              id={descId}
              className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground sm:text-[0.95rem]"
            >
              <p className="font-medium text-foreground">Fijn dat je mee test.</p>
              <p>
                OfflineRadar verzamelt activiteiten en events waar je andere
                singles offline kunt ontmoeten.
              </p>
              <p>Je kunt meteen rondkijken zonder account.</p>
              <p>
                Log je in met Google, dan onthouden we je voorkeuren en bewaarde
                events.
              </p>
              <p>
                Feedback geven kan op elk moment via{" "}
                <Link
                  href="/feedback"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={closeAndRemember}
                >
                  Feedback
                </Link>
                .
              </p>
            </div>
          </Dialog.Description>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <Button asChild className="h-11 w-full rounded-full sm:flex-1">
              <Link
                href={loginHref}
                data-beta-welcome-primary
                onClick={() => {
                  track("beta_welcome_login_click");
                  closeAndRemember();
                }}
              >
                Inloggen met Google
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-full sm:flex-1"
              onClick={() => {
                track("beta_welcome_skip");
                closeAndRemember();
              }}
            >
              Eerst even rondkijken
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
