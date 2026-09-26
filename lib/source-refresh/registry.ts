/**
 * Pilot source registry for semi-automatic refresh V1.
 * Extensible map; only registered parsers are callable from admin.
 */
import type { RefreshParserKey } from "@/lib/source-refresh/types";

export const SOURCE_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
export const SOURCE_REFRESH_PARSER_VERSION = "1";

export type RefreshPilotConfig = {
  catalogSourceId: string;
  parserKey: RefreshParserKey;
  label: string;
  fetchUrl: string;
  organizerSlug: string;
  organizerName: string;
};

/** Live Neon catalog_sources IDs (little-haze-16039117). */
export const REFRESH_PILOTS: RefreshPilotConfig[] = [
  {
    catalogSourceId: "de8d83b1-217b-4004-9a83-9c6378b2f764",
    parserKey: "speeddaten",
    label: "SmartVibes / Speeddaten.be",
    fetchUrl: "https://www.speeddaten.be/nl/kalender-8.htm",
    organizerSlug: "smartvibes",
    organizerName: "SmartVibes",
  },
  {
    catalogSourceId: "c2b5a9b4-75c1-4fac-8cb7-f599669c133b",
    parserKey: "hoptodate",
    label: "HopToDate",
    fetchUrl: "https://hoptodate.com/fr-be/speed-dating/",
    organizerSlug: "hoptodate",
    organizerName: "HopToDate",
  },
  {
    catalogSourceId: "975fc9d7-2639-4e03-9139-a588af62b869",
    parserKey: "sportieve-singles",
    label: "Sportieve Singles",
    fetchUrl: "https://www.sportievesingles.be/kalender",
    organizerSlug: "sportieve-singles",
    organizerName: "Sportieve Singles",
  },
  {
    catalogSourceId: "18ac22ba-a921-4317-bbd0-06a6068bc372",
    parserKey: "tomeeto",
    label: "Tomeeto singles aanbod",
    fetchUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    organizerSlug: "tomeeto",
    organizerName: "Tomeeto",
  },
  {
    catalogSourceId: "b6af624e-337d-41e3-8f4f-524a152f9ae9",
    parserKey: "juntas",
    label: "Juntas exclusief singles",
    fetchUrl: "https://juntas.be/?reis_label=single-only",
    organizerSlug: "juntas",
    organizerName: "Juntas",
  },
];

const BY_SOURCE_ID = new Map(
  REFRESH_PILOTS.map((pilot) => [pilot.catalogSourceId, pilot]),
);

export function getRefreshPilot(
  catalogSourceId: string,
): RefreshPilotConfig | null {
  return BY_SOURCE_ID.get(catalogSourceId) ?? null;
}

export function isRefreshSupported(catalogSourceId: string): boolean {
  return BY_SOURCE_ID.has(catalogSourceId);
}
