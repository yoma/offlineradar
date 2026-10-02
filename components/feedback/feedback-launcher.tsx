"use client";

import { Dialog } from "radix-ui";
import { MessageSquare, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useId, useState } from "react";
import { WELCOME_OPEN_EVENT } from "@/components/beta/beta-welcome-modal";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NUDGE_KEY = "offlineradar_feedback_nudge_seen_v1";
export const OPEN_FEEDBACK_EVENT = "offlineradar:open-feedback";

function shouldHideLauncher(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/interne-")) return true;
  if (pathname === "/inloggen" || pathname.startsWith("/inloggen/")) return true;
  return false;
}

function readNudgeSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(NUDGE_KEY) === "1";
  } catch {
    return true;
  }
}

function markNudgeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NUDGE_KEY, "1");
  } catch {
    // ignore
  }
}

function unlockBodyPointerEvents() {
  if (typeof document === "undefined") return;
  document.body.style.removeProperty("pointer-events");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
}

export function FeedbackLauncher() {
  const pathname = usePathname();
  const titleId = useId();
  const descId = useId();
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const hidden = shouldHideLauncher(pathname) || welcomeOpen;

  useEffect(() => {
    function onWelcome(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setWelcomeOpen(Boolean(detail?.open));
    }
    window.addEventListener(WELCOME_OPEN_EVENT, onWelcome);
    return () => window.removeEventListener(WELCOME_OPEN_EVENT, onWelcome);
  }, []);

  useEffect(() => {
    if (hidden) return;
    if (readNudgeSeen()) return;
    const timer = window.setTimeout(() => setNudge(true), 1200);
    return () => window.clearTimeout(timer);
  }, [hidden]);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      setNudge(false);
      markNudgeSeen();
    }
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) unlockBodyPointerEvents();
  }, [open]);

  if (hidden && !open) return null;

  function dismissNudge() {
    markNudgeSeen();
    setNudge(false);
  }

  function openFeedback() {
    dismissNudge();
    setOpen(true);
  }

  function setOpenSafe(next: boolean) {
    setOpen(next);
    if (!next) unlockBodyPointerEvents();
  }

  return (
    <>
      {!hidden ? (
        <div
          className={cn(
            "fixed right-4 z-50 flex flex-col items-end gap-2",
            "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6",
          )}
        >
          {nudge ? (
            <div
              role="status"
              className="relative max-w-[16.5rem] rounded-2xl border border-border/80 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-foreground shadow-[0_14px_40px_-12px_rgba(26,18,20,0.35)]"
            >
              <p className="pr-6 leading-5">Iets te melden? Heel graag!</p>
              <button
                type="button"
                className="absolute top-2 right-2 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Tip sluiten"
                onClick={dismissNudge}
              >
                <XIcon className="size-3.5" />
              </button>
              <span
                aria-hidden
                className="absolute -bottom-1.5 right-8 size-3 rotate-45 border-r border-b border-border/80 bg-white"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={openFeedback}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-border/70 bg-white px-3.5 py-2.5",
              "text-sm font-semibold text-foreground",
              "shadow-[0_12px_32px_-10px_rgba(26,18,20,0.35)]",
              "transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_rgba(26,18,20,0.4)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <span
              className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-primary"
              aria-hidden
            >
              <MessageSquare className="size-3.5" />
            </span>
            Feedback
          </button>
        </div>
      ) : null}

      <Dialog.Root open={open} onOpenChange={setOpenSafe}>
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
                if (event.target === event.currentTarget) setOpenSafe(false);
              }}
            >
              <div
                className={cn(
                  "relative w-full max-w-[26rem] rounded-[1.75rem] border border-white/70 bg-white",
                  "max-h-[min(92dvh,40rem)] overflow-y-auto p-5 pt-6 shadow-[0_24px_80px_-12px_rgba(26,18,20,0.45)] sm:p-7",
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
                    width={80}
                    height={78}
                    className="h-14 w-14 object-contain drop-shadow-[0_10px_24px_-8px_rgba(156,124,37,0.55)]"
                  />
                </div>

                <Dialog.Title
                  id={titleId}
                  className="mt-4 text-center text-[1.55rem] leading-tight font-semibold tracking-tight text-foreground sm:text-[1.7rem]"
                >
                  Psst… tip voor DateOfflineHub?
                </Dialog.Title>
                <Dialog.Description
                  id={descId}
                  className="mt-2 text-center text-sm text-muted-foreground"
                >
                  Schermcontext sturen we automatisch mee. Geen account nodig.
                </Dialog.Description>

                <div className="mt-5">
                  <Suspense
                    fallback={
                      <p className="text-center text-sm text-muted-foreground">
                        Laden…
                      </p>
                    }
                  >
                    <FeedbackForm
                      variant="modal"
                      onSuccess={() => {
                        window.setTimeout(() => setOpenSafe(false), 1400);
                      }}
                    />
                  </Suspense>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </Dialog.Root>
    </>
  );
}
