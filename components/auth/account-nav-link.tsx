"use client";

import Link from "next/link";
import { LogIn, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useRef, type MouseEventHandler } from "react";
import { mergeLocalSavedAction } from "@/app/account/actions";
import { readFavorites, writeFavorites } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Subtle header account entry + one-time local→server saved merge on login.
 */
export function AccountNavLink({
  light,
  className,
  onNavigate,
  menuRow = false,
}: {
  light: boolean;
  className?: string;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  /** Full-width mobile menu row with icon (larger tap target). */
  menuRow?: boolean;
}) {
  const { data: session, status } = useSession();
  const mergedFor = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || mergedFor.current === userId) return;
    mergedFor.current = userId;
    const local = readFavorites();
    void mergeLocalSavedAction(local).then((result) => {
      if (result.ok) writeFavorites(result.ids);
    });
  }, [session?.user?.id]);

  if (status === "loading") {
    return (
      <span
        className={cn(
          "text-sm font-medium",
          light ? "text-muted-foreground" : "text-white/60",
          menuRow && "block px-3 py-3",
          className,
        )}
        aria-hidden
      >
        …
      </span>
    );
  }

  const loggedIn = Boolean(session?.user?.id);
  const href = loggedIn ? "/account" : "/inloggen";
  const label = loggedIn ? "Mijn account" : "Inloggen";
  const Icon = loggedIn ? UserRound : LogIn;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        menuRow
          ? "flex w-full min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold text-foreground transition hover:bg-muted/70"
          : cn(
              "text-sm font-medium",
              light
                ? "text-muted-foreground hover:text-foreground"
                : "text-white/75 hover:text-white",
            ),
        className,
      )}
    >
      {menuRow ? <Icon className="size-5 shrink-0" aria-hidden /> : null}
      {label}
    </Link>
  );
}
