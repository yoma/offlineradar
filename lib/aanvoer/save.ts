import { randomUUID } from "node:crypto";
import {
  upsertCatalogSourceByUrl,
  type CatalogSourceType,
} from "@/lib/events/catalog-sources";
import {
  attachSource,
  createEdition,
  upsertOrganizerBySlug,
} from "@/lib/events/neon-store";
import { withUserSuppliedProvenance } from "@/lib/discovery/user-supplied";
import { USER_SUPPLIED_MANDATORY_FUTURE_SCAN } from "@/lib/aanvoer/future-discovery";
import { normalizeRefreshUrl, slugify } from "@/lib/source-refresh/normalize";
import type {
  IntakeEditableDraft,
  IntakeSourceKindHint,
} from "@/lib/aanvoer/types";

function mapSourceType(hint: IntakeSourceKindHint): CatalogSourceType {
  switch (hint) {
    case "website_first":
      return "organizer";
    case "social_first":
      return "community";
    case "ticket_platform_first":
      return "ticket_platform";
    default:
      return "other";
  }
}

function sourceKindNote(hint: IntakeSourceKindHint): string {
  return `intake_source_type=${hint}`;
}

function boolish(value: "true" | "false" | "unknown"): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function buildStartsAt(draft: IntakeEditableDraft): {
  startsAt: string;
  dateUnknown: boolean;
} {
  const date = draft.startDate.trim();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const time =
      draft.startTime && /^\d{2}:\d{2}/.test(draft.startTime)
        ? draft.startTime.slice(0, 5)
        : "12:00";
    return {
      startsAt: `${date}T${time}:00+02:00`,
      dateUnknown: false,
    };
  }
  return {
    startsAt: "2099-12-31T12:00:00+01:00",
    dateUnknown: true,
  };
}

function buildEndsAt(draft: IntakeEditableDraft): string | null {
  const date = draft.startDate.trim();
  const end = draft.endTime.trim();
  if (!date || !end || !/^\d{2}:\d{2}/.test(end)) return null;
  return `${date}T${end.slice(0, 5)}:00+02:00`;
}

function routeFromDraft(
  draft: IntakeEditableDraft,
): "route_a" | "route_b" | "unknown" {
  if (draft.routeAdvice === "route_a") return "route_a";
  if (draft.routeAdvice === "route_b") return "route_b";
  return "unknown";
}

export async function saveIntakeAsSource(input: {
  draft: IntakeEditableDraft;
  assetId?: string | null;
  force?: boolean;
}): Promise<
  | { ok: true; sourceId: string; created: boolean; message: string }
  | { ok: false; error: string }
> {
  const draft = input.draft;
  const url = (draft.sourceUrl || draft.organizerUrl).trim();
  if (!url) {
    return {
      ok: false,
      error:
        "Geen URL om als bron te bewaren. Voeg een officiële of social URL toe (Bronverificatie nodig).",
    };
  }

  const name =
    draft.organizer.trim() ||
    draft.title.trim() ||
    (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "User-supplied bron";
      }
    })();

  const verificationNote = !draft.sourceUrl.trim()
    ? "status=Bronverificatie nodig (geen officiële URL bevestigd)."
    : draft.sourceUrl.trim().includes("instagram") ||
        draft.sourceUrl.trim().includes("facebook")
      ? "status=Bronverificatie nodig (social-first; officiële site later)."
      : null;

  const notes = withUserSuppliedProvenance(
    [
      sourceKindNote(draft.sourceKindHint),
      USER_SUPPLIED_MANDATORY_FUTURE_SCAN,
      verificationNote,
      draft.notes.trim() || null,
      input.assetId ? `intake_asset=${input.assetId}` : null,
      "Intake via /interne-aanvoer. Screenshot nooit als public image.",
    ]
      .filter(Boolean)
      .join(" | "),
  );

  const result = await upsertCatalogSourceByUrl({
    name,
    officialUrl: url,
    sourceKind: "organizer_source",
    sourceType: mapSourceType(draft.sourceKindHint),
    status: "promising",
    // Never set lastCheckedAt from intake/screenshot timestamp.
    lastCheckedAt: null,
    notes,
  });

  if (!result) {
    return { ok: false, error: "Kon bron niet opslaan." };
  }

  return {
    ok: true,
    sourceId: result.record.id,
    created: result.created,
    message: result.created
      ? "Bron bewaard in Source Map (discovered_by=user)."
      : "Bestaande bron bijgewerkt (discovered_by=user behouden/toegevoegd).",
  };
}

export async function saveIntakeAsEventCandidate(input: {
  draft: IntakeEditableDraft;
  assetId?: string | null;
}): Promise<
  | { ok: true; editionId: string; slug: string; message: string }
  | { ok: false; error: string }
> {
  const draft = input.draft;
  const title = draft.title.trim();
  if (!title) {
    return { ok: false, error: "Titel is verplicht voor een event-kandidaat." };
  }

  const organizerName =
    draft.organizer.trim() ||
    (draft.sourceUrl
      ? `Organisator (${(() => {
          try {
            return new URL(draft.sourceUrl).hostname.replace(/^www\./, "");
          } catch {
            return "intake";
          }
        })()})`
      : "Organisator (intake)");

  const organizerSlug =
    slugify(organizerName) || `org-${randomUUID().slice(0, 8)}`;
  const website = draft.organizerUrl.trim() || draft.sourceUrl.trim() || null;
  const organizer = await upsertOrganizerBySlug({
    slug: organizerSlug,
    name: organizerName,
    websiteUrl: website,
  });
  if (!organizer) {
    return { ok: false, error: "Kon organisator niet opslaan." };
  }

  const { startsAt, dateUnknown } = buildStartsAt(draft);
  const endsAt = buildEndsAt(draft);
  const city = draft.city.trim() || "Onbekend";
  const singlesOnly = boolish(draft.singlesOnly);
  const singlesOriented = boolish(draft.singlesOriented);
  const eligibilityRoute = routeFromDraft(draft);
  const sourceUrl = draft.sourceUrl.trim() || null;

  const needsVerification =
    !sourceUrl ||
    /instagram|facebook|fb\.me/i.test(sourceUrl) ||
    Boolean(input.assetId && !sourceUrl);

  const internalNotes = [
    withUserSuppliedProvenance("Admin Quick Intake kandidaat."),
    sourceKindNote(draft.sourceKindHint),
    `routeAdvice=${draft.routeAdvice}`,
    draft.routeReason,
    needsVerification ? "status=Bronverificatie nodig" : null,
    dateUnknown ? "Startdatum onbekend; placeholder 2099-12-31." : null,
    input.assetId
      ? `intake_asset=${input.assetId} (review evidence, nooit public image)`
      : null,
    draft.ageNotes.trim() ? `age: ${draft.ageNotes.trim()}` : null,
    draft.notes.trim() || null,
    // Never set sourceCheckedAt from intake.
    "source_checked_at niet gezet (geen officiële broncheck).",
  ]
    .filter(Boolean)
    .join("\n");

  const baseSlug = slugify(`${title}-${draft.startDate || "tbd"}`);
  const slug = `aanvoer-${baseSlug || "draft"}-${randomUUID().slice(0, 8)}`;

  const edition = await createEdition({
    slug,
    organizerId: organizer.record.id,
    title,
    startsAt,
    endsAt,
    timezone: "Europe/Brussels",
    venueName: draft.venue.trim() || null,
    address: draft.location.trim() || null,
    city,
    country: "BE",
    eligibilityRoute,
    singlesOriented,
    singlesOnly,
    singlesOnlyEvidence:
      singlesOnly === true
        ? draft.notes.trim() || "Admin intake: singles-only met bewijs."
        : null,
    ageRule: "unknown",
    category:
      draft.category.trim() === "meet_new_people"
        ? "meet_new_people"
        : draft.category.trim() === "social"
          ? "social"
          : "dating",
    subCategory: draft.category.trim() || null,
    tags: ["admin-intake", "draft", "discovered_by=user"],
    priceNote: draft.priceNotes.trim() || null,
    priceCurrency: draft.currency.trim() || "EUR",
    availabilityNote: draft.availability.trim() || null,
    shortDescription: null,
    internalNotes,
    publicationStatus: "draft",
    // Explicitly omit sourceCheckedAt / lastCheckedAt — screenshot ≠ freshness.
  });

  if (!edition) {
    return { ok: false, error: "Kon event-kandidaat niet opslaan." };
  }

  if (sourceUrl) {
    await attachSource({
      eventEditionId: edition.id,
      sourceType: "other",
      url: sourceUrl,
      normalizedUrl: normalizeRefreshUrl(sourceUrl),
      isPrimary: true,
      evidenceNote: "Admin Quick Intake",
    });
  }

  return {
    ok: true,
    editionId: edition.id,
    slug: edition.slug,
    message: needsVerification
      ? "Event-kandidaat (draft) bewaard. Bronverificatie nodig. Niet gepubliceerd."
      : "Event-kandidaat (draft) bewaard. Niet gepubliceerd.",
  };
}
