/**
 * Short, meaning-preserving display title for queue cards and public listings.
 * Never invents facts: only shortens the stored title. Original title stays in DB.
 */

const MAX_DISPLAY_TITLE_LEN = 72;

/** Strip leading decorative emoji / symbols; keep letters and digits. */
function stripLeadingDecor(value: string): string {
  return value.replace(/^[\p{Extended_Pictographic}\p{Symbol}\s]+/u, "").trim();
}

/**
 * Prefer the first sentence / clause when the stored title is a full description.
 * Keeps short titles unchanged.
 */
export function displayEventTitle(
  title: string | null | undefined,
  options: { maxLen?: number } = {},
): string {
  const maxLen = options.maxLen ?? MAX_DISPLAY_TITLE_LEN;
  const raw = (title ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  let working = stripLeadingDecor(raw);
  if (!working) working = raw;

  // Already short enough and not a multi-sentence dump.
  if (working.length <= maxLen && !/[.!?].+\S/.test(working)) {
    return working;
  }

  // First sentence ending, if it yields a useful short title.
  const sentence = working.match(/^(.+?[.!?])(?:\s|$)/u);
  if (sentence?.[1]) {
    const cut = sentence[1].replace(/[.!?]+$/u, "").trim();
    if (cut.length >= 12 && cut.length <= maxLen) return cut;
    if (cut.length > maxLen) working = cut;
  }

  // Soft break on " – " / " - " / ". " before hard truncate.
  for (const sep of [" – ", " — ", " - ", ". ", "! ", "? "]) {
    const idx = working.indexOf(sep);
    if (idx >= 12 && idx <= maxLen) {
      return working.slice(0, idx).trim();
    }
  }

  if (working.length <= maxLen) return working;

  const slice = working.slice(0, maxLen - 1);
  const boundary = Math.max(
    slice.lastIndexOf(" "),
    slice.lastIndexOf("-"),
    slice.lastIndexOf("–"),
  );
  const trimmed =
    boundary >= Math.floor(maxLen * 0.45)
      ? slice.slice(0, boundary)
      : slice;
  return `${trimmed.trimEnd()}…`;
}
