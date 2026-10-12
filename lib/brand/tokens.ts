/**
 * DateOfflineHub brand tokens: shared source for web CSS and future
 * Instagram templates (1080x1350 feed, 1080x1920 stories, carousels).
 *
 * Visual system only. Do not couple business logic to these values.
 * CSS mirrors live in `app/globals.css` `:root`.
 */

export const brandColors = {
  cream: "#F9F2EA",
  bordeaux: "#67283A",
  rose: "#C98188",
  /** Logo mid-gold: keep over muted #C29A58 for brand recognition. */
  gold: "#D4AF37",
  goldDeep: "#9C7C25",
  goldLight: "#F5E49F",
  goldSoft: "#FBF6E8",
  goldInk: "#7A5C1E",
  anthracite: "#2F3035",
  white: "#FFFFFF",
} as const;

export const brandTypography = {
  heading: "DM Serif Display",
  body: "DM Sans",
} as const;

export const brandRadius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const brandSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  section: 56,
} as const;

/** Future Instagram canvas sizes (do not build exporters here yet). */
export const instagramFormats = {
  feedPortrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

export type BrandColorKey = keyof typeof brandColors;
