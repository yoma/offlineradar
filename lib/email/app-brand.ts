/**
 * Lightweight product identity for transactional email.
 * Prefer env so display name can change without code churn.
 */
export function appDisplayName(): string {
  return (
    process.env.OFFLINERADAR_APP_NAME?.trim() ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "OfflineRadar"
  );
}

export function appPublicBaseUrl(fallbackOrigin?: string | null): string {
  const fromEnv =
    process.env.OFFLINERADAR_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("http") ? fromEnv.replace(/\/$/, "") : `https://${fromEnv.replace(/\/$/, "")}`;
  }
  if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, "");
  return "https://offlineradar.vercel.app";
}

export function transactionalFromAddress(): string | null {
  const from = process.env.OFFLINERADAR_EMAIL_FROM?.trim();
  return from || null;
}

export function isResendConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && transactionalFromAddress(),
  );
}
