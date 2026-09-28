/** Client-safe feedback labels + shared record type (no DB imports). */

export const FEEDBACK_CATEGORIES = [
  "bug",
  "unclear",
  "idea",
  "missing_event",
  "other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ["new", "reviewing", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Bug / werkt niet",
  unclear: "Onduidelijk",
  idea: "Idee",
  missing_event: "Event of aanbod ontbreekt",
  other: "Anders",
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Nieuw",
  reviewing: "Bekeken",
  done: "Afgehandeld",
};

export type BetaFeedbackRecord = {
  id: string;
  category: FeedbackCategory;
  message: string;
  contactEmail: string | null;
  appUserId: string | null;
  pathname: string | null;
  queryString: string | null;
  status: FeedbackStatus;
  adminNote: string | null;
  userAgent: string | null;
  whatWentWell: string | null;
  whatUnclear: string | null;
  whatMissing: string | null;
  createdAt: string;
  updatedAt: string;
};
