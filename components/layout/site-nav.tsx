"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/ontdek", label: "Ontdek", icon: Compass },
  { href: "/bewaard", label: "Bewaard", icon: Bookmark },
  { href: "/over", label: "Over", icon: Info },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="relative flex size-8 items-center justify-center" aria-hidden>
            <span className="absolute size-7 rounded-full border border-primary/40" />
            <span className="absolute size-4 rounded-full border border-primary/70" />
            <span className="size-1.5 rounded-full bg-primary" />
          </span>
          <span className="font-heading text-lg">OfflineRadar</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-muted-foreground",
                pathname.startsWith(link.href) && "font-medium text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <ul className="grid grid-cols-3">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground",
                  active && "text-foreground",
                )}
              >
                <Icon className="size-5" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
