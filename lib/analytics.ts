export type AnalyticsEventName =
  | "search_performed"
  | "filter_changed"
  | "event_opened"
  | "organizer_clicked"
  | "ticket_clicked"
  | "favorite_added"
  | "zero_results";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null
>;

export type AnalyticsPayload = {
  name: AnalyticsEventName;
  properties: AnalyticsProperties;
  timestamp: string;
};

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
}
