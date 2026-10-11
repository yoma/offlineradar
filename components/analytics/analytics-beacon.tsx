"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track, type AnalyticsProperties } from "@/lib/analytics";

const LANDING_KEY = "doh_landed";
let landedThisPageLoad = false;

function trafficHints(): AnalyticsProperties {
  let isLanding = false;
  try {
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(LANDING_KEY)) {
      sessionStorage.setItem(LANDING_KEY, "1");
      isLanding = true;
    }
  } catch {
    // Private mode / blocked storage: only the first beacon in this page load.
    if (!landedThisPageLoad) {
      landedThisPageLoad = true;
      isLanding = true;
    }
  }

  const props: AnalyticsProperties = { is_landing: isLanding };
  if (!isLanding || typeof document === "undefined") return props;

  const raw = document.referrer?.trim();
  if (!raw) {
    props.referrer_host = "direct";
    return props;
  }
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").slice(0, 120);
    if (!host || host === window.location.hostname.replace(/^www\./, "")) {
      props.referrer_host = "direct";
    } else {
      props.referrer_host = host;
    }
  } catch {
    props.referrer_host = "direct";
  }
  return props;
}

/**
 * Emits anonymous page_view on route changes (cookieless session id).
 */
export function AnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/interne-")) return;
    if (pathname.startsWith("/api/")) return;
    track("page_view", { path: pathname, ...trafficHints() });
  }, [pathname]);

  return null;
}
