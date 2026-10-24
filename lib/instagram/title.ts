/**
 * Smart title shortening for Instagram slides.
 * Prefer meaning-preserving cuts at word boundaries — never mid-word.
 */

/**
 * Shorten a title to at most `maxChars`, breaking on spaces/dashes when possible.
 * Full title stays in captions / detail text.
 */
export function shortenTitle(title: string, maxChars: number): string {
  const raw = title.trim().replace(/\s+/g, " ");
  if (raw.length <= maxChars) return raw;

  const limit = Math.max(8, maxChars);
  const slice = raw.slice(0, limit + 1);

  const separators = [" — ", " – ", " - ", ": ", ", ", " "];
  let best = -1;
  for (const sep of separators) {
    const idx = slice.lastIndexOf(sep);
    if (idx > limit * 0.45 && idx > best) best = idx;
  }

  if (best > 0) {
    return `${slice.slice(0, best).trimEnd()}…`;
  }

  // Fall back: cut before the incomplete trailing word
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > limit * 0.4) {
    return `${slice.slice(0, lastSpace).trimEnd()}…`;
  }

  return `${raw.slice(0, limit).trimEnd()}…`;
}

/**
 * Two-line budget for list rows (~22–24px Bricolage on 1080 canvas).
 * Compact rows get a slightly tighter budget.
 */
export function titleForEventRow(title: string, compact?: boolean): string {
  return shortenTitle(title, compact ? 52 : 58);
}

/** Two-line budget for the individual event slide headline. */
export function titleForEventSlide(title: string): string {
  return shortenTitle(title, 72);
}
