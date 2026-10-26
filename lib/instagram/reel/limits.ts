/**
 * Vercel functions take at most 4.5 MB per request/response body, and the
 * MP4 is both uploaded and served through one. Reels are 1 to 3 MB, the
 * renderer re-encodes smaller when a file would pass this limit.
 */
export const REEL_MAX_UPLOAD_BYTES = 4_200_000;
