/**
 * Lightweight provenance for Source Map notes.
 * Convention: tag `discovered_by=user` so admin can filter "Door Youri aangebracht".
 * No schema migration required.
 */

export const USER_SUPPLIED_TAG = "discovered_by=user";

export function isUserSuppliedNotes(notes: string | null | undefined): boolean {
  if (!notes) return false;
  return (
    notes.includes(USER_SUPPLIED_TAG) ||
    notes.includes("source_origin=user_supplied") ||
    /door youri aangebracht/i.test(notes)
  );
}

/** Ensure notes carry user-supplied provenance without duplicating the tag. */
export function withUserSuppliedProvenance(
  notes: string | null | undefined,
  extra?: string,
): string {
  const parts: string[] = [];
  const base = (notes ?? "").trim();
  if (base && !isUserSuppliedNotes(base)) {
    parts.push(base);
  } else if (base) {
    parts.push(base);
  }
  if (!isUserSuppliedNotes(base)) {
    parts.push(
      `${USER_SUPPLIED_TAG} | Door Youri aangebracht (handmatige productvondst).`,
    );
  }
  if (extra?.trim()) parts.push(extra.trim());
  return parts.filter(Boolean).join(" ");
}
