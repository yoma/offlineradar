/**
 * Regression: FormData captions use CRLF while server drafts use LF.
 * Approve must still hydrate as Goedgekeurd for unchanged content.
 *
 * Uses real draft construction (buildPhase3aPreviewDrafts), the same
 * fingerprint / pack / match helpers as record+assert approval, and a
 * simulated reload — no Neon writes, no Meta publish.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  matchStoredApprovalContent,
  packApprovalSlides,
} from "@/lib/instagram/approvals";
import {
  buildInstagramContentFingerprint,
  canonicalizeSlidesForApproval,
  normalizeInstagramApprovalCaption,
} from "@/lib/instagram/concept-key";
import { buildPhase3aPreviewDrafts } from "@/lib/instagram/drafts";
import {
  canonicalizeEventSnapshots,
  snapshotFromEvent,
} from "@/lib/instagram/event-snapshot";
import type { Event } from "@/types/event";

/** Pre-fix fingerprint (caption.trim only — no newline normalize). */
function legacyUnnormalizedFingerprint(input: {
  format: "binnenkort" | "deze_week" | "nieuw";
  eventIds: string[];
  caption: string;
  slides: Parameters<typeof canonicalizeSlidesForApproval>[0];
  eventSnapshots: Parameters<typeof canonicalizeEventSnapshots>[0];
}): string {
  const payload = {
    format: input.format,
    eventIds: input.eventIds.map((id) => id.trim()).filter(Boolean),
    caption: input.caption.trim(),
    slides: canonicalizeSlidesForApproval(input.slides),
    eventSnapshots: canonicalizeEventSnapshots(input.eventSnapshots),
  };
  // Intentionally uses the pre-v4 prefix to simulate a stale opaque column.
  return createHash("sha256")
    .update(`ig3b-content:v3:${JSON.stringify(payload)}`)
    .digest("hex")
    .slice(0, 64);
}

function ok(label: string) {
  console.log(`OK  ${label}`);
}

function sampleEvent(
  partial: Partial<Event> & Pick<Event, "id" | "title" | "startDate" | "city">,
): Event {
  return {
    slug: partial.id,
    shortDescription: "Korte omschrijving voor Instagram-test.",
    description: null,
    category: "dating",
    subCategory: "speeddate",
    organizerName: partial.organizerName ?? "Org",
    organizerId: null,
    region: partial.region ?? "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.2,
    longitude: 4.4,
    distanceKm: 10,
    endDate: null,
    startTime: partial.startTime ?? "19:00",
    endTime: null,
    price: 25,
    currency: "EUR",
    eligibility: { default: null, byGender: null, allowedGenders: null },
    eligibilityAgeMin: 30,
    eligibilityAgeMax: 40,
    eligibilityAgeRule: "guideline",
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    knownAudienceGenders: null,
    singlesOnly: true,
    singlesOriented: true,
    singlesFriendly: false,
    listingPath: "organic",
    meetActivation: null,
    genderAvailability: null,
    capacityStatus: "unknown",
    spotsRemaining: null,
    registrationDeadline: null,
    socialSuitability: "high",
    sourceType: "official_website",
    sourceName: "test",
    officialUrl: "https://example.com",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: null,
    addedAt: "2026-10-01T00:00:00.000Z",
    imageUrl: null,
    tags: [],
    activities: partial.activities ?? ["speeddate"],
    practicalInfo: [],
    ...partial,
  };
}

const NOW = new Date("2026-10-23T12:00:00+02:00");
/** Same shape as phase3a fixture — enough variety for Format A carousel. */
const catalog: Event[] = [
  sampleEvent({
    id: "nl-e1",
    title: "Singles Bowling Antwerpen",
    startDate: "2026-10-24",
    city: "Antwerpen",
    activities: ["sport"],
    organizerName: "Will You Date Me",
  }),
  sampleEvent({
    id: "nl-e2",
    title: "Speeddate Gent",
    startDate: "2026-10-26",
    city: "Gent",
    region: "Oost-Vlaanderen",
    organizerName: "SmartVibes",
  }),
  sampleEvent({
    id: "nl-e3",
    title: "Wandeling Leuven",
    startDate: "2026-10-27",
    city: "Leuven",
    region: "Vlaams-Brabant",
    activities: ["wandelen"],
    organizerName: "Sportieve Singles",
  }),
  sampleEvent({
    id: "nl-e4",
    title: "Halloween Mechelen",
    startDate: "2026-10-28",
    city: "Mechelen",
    activities: ["party"],
    organizerName: "Single Events",
  }),
  sampleEvent({
    id: "nl-e5",
    title: "Padeldate",
    startDate: "2026-10-30",
    city: "Antwerpen",
    activities: ["padel"],
    organizerName: "The Sircle",
  }),
  sampleEvent({
    id: "nl-e6",
    title: "Borrel Brugge",
    startDate: "2026-10-25",
    city: "Brugge",
    activities: ["drinken"],
    organizerName: "Cafe Singles",
  }),
];

assert.equal(
  normalizeInstagramApprovalCaption("a\r\nb\rc\n"),
  "a\nb\nc",
);
ok("1. caption newline normalization");

const loadA = buildPhase3aPreviewDrafts(catalog, NOW);
const loadB = buildPhase3aPreviewDrafts(catalog, NOW);
const draftA = loadA.drafts.find((d) => d.format === "binnenkort");
const draftB = loadB.drafts.find((d) => d.format === "binnenkort");
assert.ok(draftA, "expected binnenkort draft");
assert.ok(draftB, "expected binnenkort draft on second load");
assert.ok(draftA.caption.includes("\n"), "server draft uses LF");
assert.ok(!draftA.caption.includes("\r"), "server draft has no CR");

const snapsA = draftA.events.map(snapshotFromEvent);
const snapsB = draftB.events.map(snapshotFromEvent);
const fpLoadA = buildInstagramContentFingerprint({
  format: draftA.format,
  eventIds: draftA.eventIds,
  caption: draftA.caption,
  slides: draftA.slides,
  eventSnapshots: snapsA,
});
const fpLoadB = buildInstagramContentFingerprint({
  format: draftB.format,
  eventIds: draftB.eventIds,
  caption: draftB.caption,
  slides: draftB.slides,
  eventSnapshots: snapsB,
});
assert.equal(fpLoadA, fpLoadB, "two loads without edits must share fingerprint");
ok("2. consecutive loads produce identical fingerprint");

// Simulate browser FormData / HTML form posting CRLF newlines.
const formCaption = draftA.caption.replace(/\n/g, "\r\n");
assert.notEqual(formCaption, draftA.caption);
assert.ok(formCaption.includes("\r\n"));

// Approve path (same helpers as recordConceptApproval).
const approveSnaps = draftA.events.map(snapshotFromEvent);
const packed = packApprovalSlides(draftA.slides, approveSnaps);
const storedFingerprint = buildInstagramContentFingerprint({
  format: draftA.format,
  eventIds: draftA.eventIds,
  caption: formCaption,
  slides: draftA.slides,
  eventSnapshots: approveSnaps,
});
assert.equal(
  storedFingerprint,
  fpLoadA,
  "FormData CRLF caption must fingerprint equal to server LF draft",
);
ok("3. approve(FormData CRLF) fingerprint == hydrate(server LF)");

// After approve, the opaque column stores the current (normalized) fingerprint.
const hydrate = matchStoredApprovalContent({
  format: draftA.format,
  eventIds: draftA.eventIds,
  caption: draftA.caption, // server reload LF
  slides: draftA.slides,
  storedCaption: formCaption, // what FormData wrote
  storedSlides: packed.slides,
  storedEventSnapshots: packed.eventSnapshots,
  storedContentFingerprint: storedFingerprint,
});
assert.equal(hydrate.ok, true, "reload must recognize FormData-approved content");
if (!hydrate.ok) throw new Error("hydrate failed");
assert.equal(hydrate.contentFingerprint, fpLoadA);
ok("4. matchStoredApprovalContent: CRLF-stored + LF-reload = approved");

// Pre-normalization opaque hashes must not keep an approval valid.
const legacyRawFingerprint = legacyUnnormalizedFingerprint({
  format: draftA.format,
  eventIds: draftA.eventIds,
  caption: formCaption,
  slides: draftA.slides,
  eventSnapshots: approveSnaps,
});
assert.notEqual(legacyRawFingerprint, fpLoadA);
const staleOpaque = matchStoredApprovalContent({
  format: draftA.format,
  eventIds: draftA.eventIds,
  caption: draftA.caption,
  slides: draftA.slides,
  storedCaption: formCaption,
  storedSlides: packed.slides,
  storedEventSnapshots: packed.eventSnapshots,
  storedContentFingerprint: legacyRawFingerprint,
});
assert.equal(
  staleOpaque.ok,
  false,
  "stale opaque fingerprint must force re-approve",
);
ok("5. stale opaque fingerprint invalidates approval");

const drifted = matchStoredApprovalContent({
  format: draftA.format,
  eventIds: draftA.eventIds,
  caption: `${draftA.caption}\nExtra zin.`,
  slides: draftA.slides,
  storedCaption: formCaption,
  storedSlides: packed.slides,
  storedEventSnapshots: packed.eventSnapshots,
  storedContentFingerprint: storedFingerprint,
});
assert.equal(drifted.ok, false, "real caption edit must still require re-approval");
ok("6. real caption change still content_mismatch");

const titleDriftSnaps = approveSnaps.map((s, i) =>
  i === 0 ? { ...s, title: "ANDERE TITEL" } : s,
);
const titleDriftFp = buildInstagramContentFingerprint({
  format: draftA.format,
  eventIds: draftA.eventIds,
  caption: draftA.caption,
  slides: draftA.slides,
  eventSnapshots: titleDriftSnaps,
});
assert.notEqual(titleDriftFp, fpLoadA);
ok("7. event field drift still changes fingerprint");

console.log("\nOK: Instagram approve newline / FormData parity verify.");
