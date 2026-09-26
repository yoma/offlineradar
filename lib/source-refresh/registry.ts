/**
 * Pilot source registry for semi-automatic refresh V1.
 * Extensible map; only these three parsers are implemented.
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
