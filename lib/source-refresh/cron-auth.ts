/**
 * Cron request auth. Requires CRON_SECRET; never log the secret.
 */
export function isCronRequestAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  // Constant-time-ish compare for equal-length strings.
  let mismatch = 0;
  for (let i = 0; i < header.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
