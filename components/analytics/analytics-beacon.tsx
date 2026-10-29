"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track, type AnalyticsProperties } from "@/lib/analytics";
import { isInternalDevice, setInternalDevice } from "@/lib/analytics/session";

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

  // ?utm_source=instagram on the bio link: the Instagram app hides the referrer.
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source")?.trim().slice(0, 60);
    const utmMedium = params.get("utm_medium")?.trim().slice(0, 60);
    if (utmSource) props.utm_source = utmSource;
    if (utmMedium) props.utm_medium = utmMedium;
  } catch {
    // ignore
  }

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
 * Devices of the admin (any /interne- page, or ?niet-meetellen) are skipped.
 */
export function AnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Opening an admin page marks this device as the admin's for good.
    if (pathname.startsWith("/interne-")) {
      if (!isInternalDevice()) setInternalDevice(true, "admin");
      return;
    }
    // dateofflinehub.be/?niet-meetellen on a device where you never log in.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("niet-meetellen")) setInternalDevice(true, "self");
      else if (params.has("wel-meetellen")) setInternalDevice(false);
    } catch {
      // ignore
    }
    if (pathname.startsWith("/api/")) return;
    track("page_view", { path: pathname, ...trafficHints() });
  }, [pathname]);

  return null;
}
