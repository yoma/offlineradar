export type Place = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  postcodes: string[];
};

export const USER_PLACES: Place[] = [
  {
    id: "antwerpen",
    label: "Antwerpen",
    lat: 51.2194,
    lng: 4.4025,
    postcodes: ["2000", "2018", "2020", "2060", "2100", "2140", "2600"],
  },
  {
    id: "edegem",
    label: "Edegem",
    lat: 51.1548,
    lng: 4.4453,
    postcodes: ["2650"],
  },
  {
    id: "mechelen",
    label: "Mechelen",
    lat: 51.0257,
    lng: 4.4776,
    postcodes: ["2800"],
  },
  {
    id: "brussel",
    label: "Brussel",
    lat: 50.8503,
    lng: 4.3517,
    postcodes: ["1000", "1050", "1060"],
  },
  {
    id: "gent",
    label: "Gent",
    lat: 51.0543,
    lng: 3.7174,
    postcodes: ["9000"],
  },
  {
    id: "leuven",
    label: "Leuven",
    lat: 50.8798,
    lng: 4.7005,
    postcodes: ["3000"],
  },
  {
    id: "turnhout",
    label: "Turnhout",
    lat: 51.3227,
    lng: 4.9446,
    postcodes: ["2300"],
  },
];

export const GEO = {
  antwerpen: { lat: 51.2194, lng: 4.4025 },
  edegem: { lat: 51.1548, lng: 4.4453 },
  mechelen: { lat: 51.0257, lng: 4.4776 },
  brussel: { lat: 50.8503, lng: 4.3517 },
  gent: { lat: 51.0543, lng: 3.7174 },
  leuven: { lat: 50.8798, lng: 4.7005 },
  turnhout: { lat: 51.3227, lng: 4.9446 },
  brugge: { lat: 51.2093, lng: 3.2247 },
  durbuy: { lat: 50.3524, lng: 5.4564 },
  knokke: { lat: 51.346, lng: 3.284 },
} as const;

export function findPlace(id: string): Place {
  return USER_PLACES.find((place) => place.id === id) ?? USER_PLACES[0];
}

export function placeFromPostcode(postcode: string): Place | null {
  const normalized = postcode.trim();
  if (!normalized) return null;
  return (
    USER_PLACES.find((place) => place.postcodes.includes(normalized)) ?? null
  );
}
