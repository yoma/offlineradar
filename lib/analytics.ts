import {
  type AnalyticsEventName,
  type AnalyticsPayload,
  type AnalyticsProperties,
} from "@/lib/analytics/types";
import { getAnonymousSessionId } from "@/lib/analytics/session";

export type {
  AnalyticsEventName,
  AnalyticsPayload,
  AnalyticsProperties,
} from "@/lib/analytics/types";
export { ANALYTICS_DATA_SINCE, canonicalizeEventName } from "@/lib/analytics/types";

function shouldPersistClientSide(): boolean {
  if (typeof window === "undefined") return false;
  // Skip localhost / preview hosts so production aggregates stay clean.
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.endsWith(".vercel.app") && !host.startsWith("dateofflinehub")) {
    // Allow offlineradar + dateofflinehub production aliases only.
    if (!host.startsWith("offlineradar")) return false;
  }
  return true;
}

function postAnalytics(payload: AnalyticsPayload): void {
  if (!shouldPersistClientSide()) return;
  try {
    const body = JSON.stringify({
      name: payload.name,
      properties: payload.properties,
      timestamp: payload.timestamp,
      anonymousSessionId: getAnonymousSessionId(),
      path: window.location.pathname,
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics", blob);
      return;
    }
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Analytics must never break UX.
  }
}

/**
 * Fire product analytics. Always emits a CustomEvent for local listeners;
 * persists anonymously to Neon in production-like hosts.
 */
export function track(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): void {
  if (typeof window === "undefined") return;
  const detail: AnalyticsPayload = {
    name,
    properties,
    timestamp: new Date().toISOString(),
  };
  window.dispatchEvent(
    new CustomEvent("offlineradar:analytics", { detail }),
  );
  postAnalytics(detail);
}
