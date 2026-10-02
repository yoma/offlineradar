"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Info } from "lucide-react";
import { useEffect, useState, type SVGProps } from "react";
import { AccountNavLink } from "@/components/auth/account-nav-link";
import { cn } from "@/lib/utils";

const INSTAGRAM_URL = "https://www.instagram.com/dateofflinehub/";

const links = [
  { href: "/ontdek", label: "Ontdek", icon: Compass },
  { href: "/bewaard", label: "Bewaard", icon: Bookmark },
  { href: "/over", label: "Over", icon: Info },
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

function InstagramNavLink({ light }: { light: boolean }) {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="DateOfflineHub op Instagram"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full transition",
        light
          ? "text-[var(--brand-gold-deep)] hover:bg-[var(--brand-gold-soft)] hover:text-[var(--brand-gold-ink)]"
          : "text-white/85 hover:bg-white/15 hover:text-white",
      )}
    >
      <InstagramIcon className="size-[1.15rem]" />
    </a>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

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
        <nav className="hidden items-center gap-5 text-sm font-medium md:flex lg:gap-7">
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
          <AccountNavLink light={light} />
          <InstagramNavLink light={light} />
          <Link
            href="/#tip-een-activiteit"
            aria-label="Ken je een singlesevent? Geef het aan ons door."
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold transition",
              light
                ? "bg-primary text-primary-foreground hover:bg-[var(--brand-gold-ink)]"
                : "bg-white text-primary hover:bg-white/90",
            )}
            onClick={() => {
              // Same-page hash nav does not remount TipSection; open the form
              // immediately so users do not need a second click.
              if (typeof window === "undefined") return;
              window.setTimeout(() => {
                window.dispatchEvent(new Event("offlineradar:open-tip"));
              }, 0);
            }}
          >
            Singlesevent doorgeven
          </Link>
        </nav>
        <div className="flex items-center gap-1.5 md:hidden">
          <InstagramNavLink light={light} />
          <AccountNavLink light={light} />
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <li key={link.href} className="min-w-0">
              <Link
                href={link.href}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.25]")} />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
