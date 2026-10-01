"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";

/**
 * Emits anonymous page_view on route changes (cookieless session id).
 */
export function AnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/interne-")) return;
    if (pathname.startsWith("/api/")) return;
    track("page_view", { path: pathname });
  }, [pathname]);

  return null;
}
