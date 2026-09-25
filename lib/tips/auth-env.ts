/**
 * Shared Auth.js / Google env detection (no secrets).
 * Kept separate to avoid circular imports between auth.ts and admin-auth.ts.
 */

export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET?.trim() &&
      process.env.AUTH_GOOGLE_ID?.trim() &&
      process.env.AUTH_GOOGLE_SECRET?.trim(),
  );
}
