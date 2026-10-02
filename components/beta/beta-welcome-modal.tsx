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

export const WELCOME_OPEN_EVENT = "offlineradar:welcome-open-change";

function buildLoginHref(): string {
  if (typeof window === "undefined") return "/inloggen?callbackUrl=%2Fontdek";
  const path = `${window.location.pathname}${window.location.search}`;
  const safe =
    path.startsWith("/") && !path.startsWith("//") ? path : "/ontdek";
  return `/inloggen?callbackUrl=${encodeURIComponent(safe)}`;
}

function unlockBodyPointerEvents() {
  if (typeof document === "undefined") return;
  document.body.style.removeProperty("pointer-events");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
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

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(WELCOME_OPEN_EVENT, { detail: { open } }),
    );
    if (!open) unlockBodyPointerEvents();
  }, [open]);

  if (!enabled) return null;

  function closeAndRemember() {
    markBetaWelcomeSeen();
    setOpen(false);
    unlockBodyPointerEvents();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeAndRemember();
      }}
    >
      {open ? (
        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              "fixed inset-0 z-[60] bg-[#1a1214]/45 backdrop-blur-md",
              "data-open:animate-in data-open:fade-in-0",
              "duration-200",
            )}
          />
          <Dialog.Content
            aria-labelledby={titleId}
            aria-describedby={descId}
            className={cn(
              "fixed inset-0 z-[60] flex items-center justify-center p-4",
              "border-0 bg-transparent shadow-none outline-none",
              "data-open:animate-in data-open:fade-in-0",
              "duration-200",
            )}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) closeAndRemember();
            }}
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
            <div
              className={cn(
                "relative w-full max-w-[26rem] rounded-[1.75rem] border border-white/70 bg-white",
                "p-6 pt-7 text-center shadow-[0_24px_80px_-12px_rgba(26,18,20,0.45)] sm:p-8",
                "max-h-[min(90dvh,40rem)] overflow-y-auto",
              )}
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

              <div className="mx-auto flex justify-center" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/dateofflinehub-logo.png"
                  alt=""
                  width={96}
                  height={94}
                  className="h-16 w-16 object-contain drop-shadow-[0_10px_24px_-8px_rgba(156,124,37,0.55)]"
                />
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
                    Fijn dat je erbij bent. DateOfflineHub helpt je offline
                    singlesactiviteiten te vinden.
                  </p>
                  <p>
                    Feedback geven kan op elk moment via de Feedback-knop
                    rechtsonder. Account is optioneel.
                  </p>
                </div>
              </Dialog.Description>

              <div className="mt-7 flex flex-col items-stretch gap-3">
                <Button asChild className="h-12 w-full rounded-full text-base font-semibold shadow-[0_12px_28px_-10px_rgba(156,124,37,0.65)]">
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
                <button
                  type="button"
                  className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => {
                    track("beta_welcome_skip");
                    closeAndRemember();
                  }}
                >
                  Eerst even rondkijken
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
