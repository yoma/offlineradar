/** Canonical product analytics event names (FASE 26.18). */
export type AnalyticsEventName =
  | "page_view"
  | "discovery_search"
  | "filter_change"
  | "more_filters_opened"
  | "event_card_click"
  | "event_view"
  | "event_saved"
  | "event_unsaved"
  | "external_source_click"
  | "organizer_follow"
  | "organizer_unfollow"
  | "zero_results"
  | "beta_welcome_shown"
  | "beta_welcome_login_click"
  | "beta_welcome_skip"
  /** Legacy aliases still accepted from older callers. */
  | "search_performed"
  | "filter_changed"
  | "event_opened"
  | "organizer_clicked"
  | "ticket_clicked"
  | "favorite_added";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null
>;

export type AnalyticsPayload = {
  name: AnalyticsEventName;
  properties: AnalyticsProperties;
  timestamp: string;
};

export const ANALYTICS_DATA_SINCE = "2026-10-01";

/** Map legacy client names to canonical storage names. */
export function canonicalizeEventName(name: string): string {
  switch (name) {
    case "search_performed":
      return "discovery_search";
    case "filter_changed":
      return "filter_change";
    case "event_opened":
      return "event_view";
    case "organizer_clicked":
    case "ticket_clicked":
      return "external_source_click";
    case "favorite_added":
      return "event_saved";
    default:
      return name;
  }
}

export const ALLOWED_ANALYTICS_NAMES = new Set([
  "page_view",
  "discovery_search",
  "filter_change",
  "more_filters_opened",
  "event_card_click",
  "event_view",
  "event_saved",
  "event_unsaved",
  "external_source_click",
  "organizer_follow",
  "organizer_unfollow",
  "zero_results",
  "beta_welcome_shown",
  "beta_welcome_login_click",
  "beta_welcome_skip",
]);
