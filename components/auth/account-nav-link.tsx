"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { mergeLocalSavedAction } from "@/app/account/actions";
import { readFavorites, writeFavorites } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Subtle header account entry + one-time local→server saved merge on login.
 */
export function AccountNavLink({ light }: { light: boolean }) {
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
        )}
        aria-hidden
      >
        …
      </span>
    );
  }

  if (session?.user?.id) {
    return (
      <Link
        href="/account"
        className={cn(
          "text-sm font-medium",
          light
            ? "text-muted-foreground hover:text-foreground"
            : "text-white/75 hover:text-white",
        )}
      >
        Mijn account
      </Link>
    );
  }

  return (
    <Link
      href="/inloggen"
      className={cn(
        "text-sm font-medium",
        light
          ? "text-muted-foreground hover:text-foreground"
          : "text-white/75 hover:text-white",
      )}
    >
      Inloggen
    </Link>
  );
}
