"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/ontdek", label: "Ontdek", icon: Compass },
  { href: "/bewaard", label: "Bewaard", icon: Bookmark },
  { href: "/over", label: "Over", icon: Info },
];

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
        "sticky top-0 z-40 transition-colors duration-200",
        light
          ? "border-b border-border bg-white/95 text-foreground backdrop-blur"
          : "border-transparent bg-transparent text-white",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg text-sm font-bold",
              light ? "bg-[#e61e4d] text-white" : "bg-white text-[#e61e4d]",
            )}
            aria-hidden
          >
            OR
          </span>
          <span className="text-[17px] font-semibold tracking-tight">
            OfflineRadar
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
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
        </nav>
      </div>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
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
