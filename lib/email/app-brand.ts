/**
 * Lightweight product identity for transactional email.
 * Prefer env so display name can change without code churn.
 * Env var names may still say OFFLINERADAR_* (stable technical identifiers).
 */
export function appDisplayName(): string {
  return (
    process.env.OFFLINERADAR_APP_NAME?.trim() ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "DateOfflineHub"
  );
}

export function appPublicBaseUrl(fallbackOrigin?: string | null): string {
  const fromEnv =
    process.env.OFFLINERADAR_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("http")
      ? fromEnv.replace(/\/$/, "")
      : `https://${fromEnv.replace(/\/$/, "")}`;
  }
  if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    const normalized = vercelProd.startsWith("http")
      ? vercelProd.replace(/\/$/, "")
      : `https://${vercelProd.replace(/\/$/, "")}`;
    // Primary brand URL is dateofflinehub; ignore legacy offlineradar alias.
    if (!/offlineradar\.vercel\.app$/i.test(normalized)) {
      return normalized;
    }
  }
  return "https://dateofflinehub.vercel.app";
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
