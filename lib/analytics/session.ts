const STORAGE_KEY = "doh_anon_sid";

/** Privacy-safe random session id (localStorage, not a cookie). */
export function getAnonymousSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8 && existing.length <= 80) {
      return existing;
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `ephemeral_${Date.now().toString(36)}`;
  }
}

const INTERNAL_KEY = "doh_internal";

/** True on devices of the admin: nothing is tracked there. */
export function isInternalDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Mark (or unmark) this device as the admin's. Also tells the server, so the
 * device's earlier visits drop out of the numbers.
 */
export function setInternalDevice(internal: boolean, reason: "admin" | "self" = "self"): void {
  if (typeof window === "undefined") return;
  try {
    if (internal) window.localStorage.setItem(INTERNAL_KEY, "1");
    else window.localStorage.removeItem(INTERNAL_KEY);
  } catch {
    // Storage blocked: the server-side exclusion below still applies.
  }
  try {
    void fetch("/api/analytics/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymousSessionId: getAnonymousSessionId(),
        mode: internal ? "exclude" : "include",
        reason,
      }),
      keepalive: true,
    });
  } catch {
    // never break the page
  }
}
