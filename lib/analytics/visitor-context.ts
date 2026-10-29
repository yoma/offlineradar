/**
 * Server-side visitor context for analytics: where a visit came from, which
 * device, and roughly where (Vercel geo headers). No IP address is stored.
 */

export type VisitSource =
  | "instagram"
  | "facebook"
  | "google"
  | "bing"
  | "tiktok"
  | "linkedin"
  | "whatsapp"
  | "duckduckgo"
  | "direct"
  | string;

export const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  bing: "Bing",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  duckduckgo: "DuckDuckGo",
  direct: "Rechtstreeks (of onbekend)",
};

/**
 * Order matters: an explicit utm_source wins, then the in-app browser (the
 * Instagram/Facebook apps hide the referrer), then the referrer host.
 */
export function classifySource(input: {
  userAgent?: string | null;
  referrerHost?: string | null;
  utmSource?: string | null;
}): VisitSource {
  const utm = (input.utmSource ?? "").trim().toLowerCase();
  if (utm) {
    if (/^(ig|insta|instagram)/.test(utm)) return "instagram";
    if (/^(fb|facebook|meta)/.test(utm)) return "facebook";
    if (/whatsapp|^wa$/.test(utm)) return "whatsapp";
    if (/tiktok/.test(utm)) return "tiktok";
    return utm.slice(0, 40);
  }
  const ua = input.userAgent ?? "";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|\[FB/i.test(ua)) return "facebook";
  if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return "tiktok";
  if (/LinkedInApp/i.test(ua)) return "linkedin";

  const host = (input.referrerHost ?? "").trim().toLowerCase();
  if (!host || host === "direct") return "direct";
  if (host.includes("instagram.")) return "instagram";
  if (host.includes("facebook.") || host === "fb.me" || host.startsWith("fb.")) return "facebook";
  if (/(^|\.)google\./.test(host)) return "google";
  if (host.includes("bing.")) return "bing";
  if (host.includes("tiktok.")) return "tiktok";
  if (host.includes("linkedin.") || host === "lnkd.in") return "linkedin";
  if (host.includes("whatsapp.")) return "whatsapp";
  if (host.includes("duckduckgo.")) return "duckduckgo";
  return host.slice(0, 80);
}

export function sourceLabel(source: string | null | undefined): string {
  const s = (source ?? "direct").trim().toLowerCase() || "direct";
  return SOURCE_LABELS[s] ?? s;
}

export type DeviceInfo = {
  device: "gsm" | "tablet" | "computer";
  os: string;
  browser: string;
};

export function parseDevice(userAgent: string | null | undefined): DeviceInfo {
  const ua = userAgent ?? "";
  const tablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua);
  const mobile = !tablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/i.test(ua)
        ? "macOS"
        : /Windows/i.test(ua)
          ? "Windows"
          : /CrOS/i.test(ua)
            ? "ChromeOS"
            : /Linux/i.test(ua)
              ? "Linux"
              : "Onbekend";
  const browser = /Instagram/i.test(ua)
    ? "Instagram-app"
    : /FBAN|FBAV|FB_IAB/i.test(ua)
      ? "Facebook-app"
      : /Edg\//i.test(ua)
        ? "Edge"
        : /SamsungBrowser/i.test(ua)
          ? "Samsung Internet"
          : /Firefox|FxiOS/i.test(ua)
            ? "Firefox"
            : /OPR\/|Opera/i.test(ua)
              ? "Opera"
              : /Chrome|CriOS/i.test(ua)
                ? "Chrome"
                : /Safari/i.test(ua)
                  ? "Safari"
                  : "Onbekend";
  return { device: tablet ? "tablet" : mobile ? "gsm" : "computer", os, browser };
}

/** Country code + city from Vercel's geo headers (no IP kept). */
export function geoFromHeaders(headers: Headers): {
  country: string | null;
  city: string | null;
} {
  const country = headers.get("x-vercel-ip-country")?.trim().toUpperCase() || null;
  let city = headers.get("x-vercel-ip-city")?.trim() || null;
  if (city) {
    try {
      city = decodeURIComponent(city);
    } catch {
      // keep raw
    }
    city = city.slice(0, 80);
  }
  return { country: country && /^[A-Z]{2}$/.test(country) ? country : null, city };
}

const COUNTRY_NAMES: Record<string, string> = {
  BE: "België",
  NL: "Nederland",
  FR: "Frankrijk",
  DE: "Duitsland",
  LU: "Luxemburg",
  GB: "Verenigd Koninkrijk",
  US: "Verenigde Staten",
  ES: "Spanje",
  IT: "Italië",
};

export function countryLabel(code: string | null | undefined): string {
  if (!code) return "Onbekend";
  return COUNTRY_NAMES[code] ?? code;
}
