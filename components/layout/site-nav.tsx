"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  Compass,
  Home,
  Info,
  Menu,
  Plus,
  Settings,
} from "lucide-react";
import { useEffect, useState, type SVGProps } from "react";
import { AccountNavLink } from "@/components/auth/account-nav-link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function unlockBodyAfterSheet() {
  if (typeof document === "undefined") return;
  // Radix dialog can leave body pointer-events:none after close on iOS Safari.
  document.body.style.removeProperty("pointer-events");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
}

const INSTAGRAM_URL = "https://www.instagram.com/dateofflinehub/";

const links = [
  { href: "/ontdek", label: "Ontdek", icon: Compass },
  { href: "/bewaard", label: "Bewaard", icon: Bookmark },
  { href: "/over", label: "Over", icon: Info },
];

const mobileLinks = [
  {
    href: "/",
    label: "Home",
    icon: Home,
    isActive: (pathname: string) => pathname === "/",
  },
  {
    href: "/ontdek",
    label: "Ontdek",
    icon: Compass,
    isActive: (pathname: string) => pathname.startsWith("/ontdek"),
  },
  {
    href: "/bewaard",
    label: "Bewaard",
    icon: Bookmark,
    isActive: (pathname: string) => pathname.startsWith("/bewaard"),
  },
  {
    href: "/over",
    label: "Over",
    icon: Info,
    isActive: (pathname: string) => pathname.startsWith("/over"),
  },
];

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InstagramNavLink({
  light,
  className,
}: {
  light: boolean;
  className?: string;
}) {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="DateOfflineHub op Instagram"
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full transition",
        // Always gold so it stands out on both the dark hero header and light pages.
        light
          ? "text-[var(--brand-gold-deep)] hover:bg-[var(--brand-gold-soft)] hover:text-[var(--brand-gold-ink)]"
          : "text-[var(--brand-gold)] hover:bg-white/15 hover:text-[var(--brand-gold-soft)]",
        className,
      )}
    >
      <InstagramIcon className="size-6" strokeWidth={2} />
    </a>
  );
}

function openTipForm() {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.dispatchEvent(new Event("offlineradar:open-tip"));
  }, 0);
}

function MobileMenuSheet({
  light,
  showAdminEntry,
}: {
  light: boolean;
  showAdminEntry: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const adminActive = pathname.startsWith("/interne-");
  const accountActive =
    pathname.startsWith("/account") || pathname.startsWith("/inloggen");

  function closeMenu() {
    setOpen(false);
    // Next tick: after Radix teardown, clear leftover body locks on iOS.
    window.setTimeout(unlockBodyAfterSheet, 0);
    window.setTimeout(unlockBodyAfterSheet, 300);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          window.setTimeout(unlockBodyAfterSheet, 0);
          window.setTimeout(unlockBodyAfterSheet, 300);
        }
      }}
    >
      <SheetTrigger
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition",
          light
            ? "border-border bg-white text-foreground hover:bg-muted/60"
            : "border-white/45 bg-white/15 text-white hover:bg-white/25",
        )}
        aria-label="Menu openen"
      >
        <Menu className="size-5" aria-hidden />
        Menu
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(100%,20rem)] gap-0 p-0"
        showCloseButton
      >
        <SheetHeader className="border-b border-border px-4 py-5 text-left">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>
            Alle pagina’s en acties op één plek.
          </SheetDescription>
        </SheetHeader>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Menu">
          {mobileLinks.map((link) => {
            const Icon = link.icon;
            const active = link.isActive(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={closeMenu}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold transition",
                  active
                    ? "bg-[var(--brand-gold-soft)] text-[var(--brand-gold-ink)]"
                    : "text-foreground hover:bg-muted/70",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {link.label}
              </Link>
            );
          })}
          {showAdminEntry ? (
            <Link
              href="/interne-goedkeuren"
              aria-current={adminActive ? "page" : undefined}
              onClick={closeMenu}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold transition",
                adminActive
                  ? "bg-[var(--brand-gold-soft)] text-[var(--brand-gold-ink)]"
                  : "text-foreground hover:bg-muted/70",
              )}
            >
              <Settings className="size-5 shrink-0" aria-hidden />
              Beheer
            </Link>
          ) : null}
          <div className="my-2 border-t border-border" />
          <AccountNavLink
            light
            menuRow
            onNavigate={closeMenu}
            className={
              accountActive
                ? "bg-[var(--brand-gold-soft)] text-[var(--brand-gold-ink)] hover:bg-[var(--brand-gold-soft)]"
                : undefined
            }
          />
        </nav>
        <SheetFooter className="border-t border-border p-4">
          <Link
            href="/#tip-een-activiteit"
            aria-label="Ken je een singlesevent? Geef het aan ons door."
            onClick={() => {
              closeMenu();
              openTipForm();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            Singlesevent doorgeven
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader({
  showAdminEntry = false,
}: {
  showAdminEntry?: boolean;
}) {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const adminActive = pathname.startsWith("/interne-");

  useEffect(() => {
    if (!onHome) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onHome]);

  const light = !onHome || scrolled;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 overflow-visible transition-colors duration-200",
        light
          ? "border-b border-border bg-white/95 text-foreground backdrop-blur"
          : "border-transparent bg-transparent text-white",
      )}
    >
      <div className="mx-auto flex h-16 w-full min-w-0 max-w-6xl items-center justify-between gap-3 overflow-visible px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-2.5 overflow-visible"
            aria-label="DateOfflineHub home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/dateofflinehub-mark.png"
              alt=""
              width={64}
              height={52}
              className="h-12 w-auto shrink-0 object-contain sm:h-[3.25rem]"
            />
            <span
              className={cn(
                "truncate text-[16px] font-semibold tracking-tight sm:text-[18px]",
                light ? "text-[var(--brand-gold-deep)]" : "text-white",
              )}
            >
              DateOfflineHub
            </span>
          </Link>
          {/* Brand-side social: keep away from account/login in the menu. */}
          <InstagramNavLink light={light} />
        </div>
        <div className="hidden min-w-0 items-center gap-6 md:flex lg:gap-8">
          <nav className="flex items-center gap-5 text-sm font-medium lg:gap-7">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    light
                      ? active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                      : active
                        ? "text-white"
                        : "text-white/75 hover:text-white",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            {showAdminEntry ? (
              <Link
                href="/interne-goedkeuren"
                aria-current={adminActive ? "page" : undefined}
                className={cn(
                  light
                    ? adminActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                    : adminActive
                      ? "text-white"
                      : "text-white/75 hover:text-white",
                )}
              >
                Beheer
              </Link>
            ) : null}
            <AccountNavLink light={light} />
          </nav>
          <Link
            href="/#tip-een-activiteit"
            aria-label="Ken je een singlesevent? Geef het aan ons door."
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
              light
                ? "bg-primary text-primary-foreground hover:bg-[var(--brand-gold-ink)]"
                : "bg-white text-primary hover:bg-white/90",
            )}
            onClick={openTipForm}
          >
            Singlesevent doorgeven
          </Link>
        </div>
        <div className="flex shrink-0 items-center md:hidden">
          <MobileMenuSheet light={light} showAdminEntry={showAdminEntry} />
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Snelmenu"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 px-1">
        {mobileLinks.map((link) => {
          const Icon = link.icon;
          const active = link.isActive(pathname);
          return (
            <li key={link.href} className="min-w-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold tracking-tight",
                  active
                    ? "text-[var(--brand-gold-ink)]"
                    : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-full transition-colors",
                    active
                      ? "bg-[var(--brand-gold-soft)]"
                      : "bg-transparent",
                  )}
                >
                  <Icon
                    className={cn("size-5", active && "stroke-[2.35]")}
                    aria-hidden
                  />
                </span>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
