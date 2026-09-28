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
            "fixed inset-0 z-[60] bg-[#1a1214]/45 backdrop-blur-md",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            "duration-200",
          )}
        />
        <Dialog.Content
          aria-labelledby={titleId}
          aria-describedby={descId}
          className={cn(
            "fixed top-1/2 left-1/2 z-[60] w-[min(100vw-1.5rem,26rem)] -translate-x-1/2 -translate-y-1/2",
            "rounded-[1.75rem] border border-white/70 bg-white p-6 pt-7 text-center shadow-[0_24px_80px_-12px_rgba(26,18,20,0.45)] sm:p-8",
            "max-h-[min(90dvh,40rem)] overflow-y-auto outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            "duration-200",
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
          <Dialog.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 text-muted-foreground"
              aria-label="Sluiten"
            >
              <XIcon />
            </Button>
          </Dialog.Close>

          <div
            className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#e61e4d] text-lg font-bold tracking-tight text-white shadow-[0_10px_30px_-8px_rgba(230,30,77,0.55)]"
            aria-hidden
          >
            OR
          </div>

          <Dialog.Title
            id={titleId}
            className="mt-5 text-balance text-[1.65rem] leading-tight font-semibold tracking-tight text-foreground sm:text-[1.85rem]"
          >
            Psst… dit is nog een proefversie
          </Dialog.Title>

          <Dialog.Description asChild>
            <div
              id={descId}
              className="mx-auto mt-3 max-w-[22rem] space-y-3 text-sm leading-6 text-muted-foreground"
            >
              <p>
                Fijn dat je erbij bent. OfflineRadar helpt je offline
                singlesactiviteiten te vinden.
              </p>
              <p>
                Feedback geven kan op elk moment via de Feedback-knop rechtsonder.
                Account is optioneel.
              </p>
            </div>
          </Dialog.Description>

          <div className="mt-7 flex flex-col items-stretch gap-3">
            <Button
              type="button"
              data-beta-welcome-primary
              className="h-12 w-full rounded-full text-base font-semibold shadow-[0_12px_28px_-10px_rgba(230,30,77,0.65)]"
              onClick={() => {
                track("beta_welcome_skip");
                closeAndRemember();
              }}
            >
              Oké, laten we gaan
            </Button>
            <Link
              href={loginHref}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                track("beta_welcome_login_click");
                closeAndRemember();
              }}
            >
              Of inloggen met Google
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
