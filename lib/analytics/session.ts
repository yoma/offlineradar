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
