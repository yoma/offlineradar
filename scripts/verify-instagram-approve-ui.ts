/**
 * Focused checks: approval UI hydrates stored content_fingerprint and
 * surfaces approve errors. Isolated in-memory store — no Neon / Meta writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { approveInstagramConceptErrorMessage } from "@/lib/instagram/approve-messages";
import {
  packApprovalSlides,
  unpackApprovalSlides,
} from "@/lib/instagram/approvals";
import {
  buildInstagramConceptKey,
  buildInstagramContentFingerprint,
  type InstagramSlideApproval,
} from "@/lib/instagram/concept-key";
import type { InstagramEventSnapshot } from "@/lib/instagram/event-snapshot";
import {
  metaPublishModeLabel,
  readInstagramMetaConfig,
} from "@/lib/instagram/meta-config";

function ok(label: string) {
  console.log(`OK  ${label}`);
}

/** In-memory stand-in for instagram_concept_approvals (no prod/Neon writes). */
type StoredApproval = {
  conceptKey: string;
  contentFingerprint: string;
  caption: string;
  slides: unknown;
};

function createIsolatedApprovalStore() {
  const rows = new Map<string, StoredApproval>();

  function record(input: {
    format: "binnenkort" | "deze_week" | "nieuw";
    eventIds: string[];
    caption: string;
    slides: InstagramSlideApproval[];
    eventSnapshots: InstagramEventSnapshot[];
  }) {
    const conceptKey = buildInstagramConceptKey(input.format, input.eventIds);
    const packed = packApprovalSlides(input.slides, input.eventSnapshots);
    const contentFingerprint = buildInstagramContentFingerprint({
      format: input.format,
      eventIds: input.eventIds,
      caption: input.caption,
      slides: input.slides,
      eventSnapshots: input.eventSnapshots,
    });
    rows.set(conceptKey, {
      conceptKey,
      contentFingerprint,
      caption: input.caption.trim(),
      slides: packed,
    });
    return { ok: true as const, conceptKey, contentFingerprint };
  }

  /** Mirrors page hydrate: assertConceptContentApproved → approvedByFormat. */
  function hydrateApproved(input: {
    format: "binnenkort" | "deze_week" | "nieuw";
    eventIds: string[];
    caption: string;
    slides: InstagramSlideApproval[];
  }): boolean {
    const conceptKey = buildInstagramConceptKey(input.format, input.eventIds);
    const row = rows.get(conceptKey);
    if (!row?.contentFingerprint) return false;
    const packed = unpackApprovalSlides(row.slides);
    if (!packed) return false;
    const fp = buildInstagramContentFingerprint({
      format: input.format,
      eventIds: input.eventIds,
      caption: input.caption,
      slides: input.slides,
      eventSnapshots: packed.eventSnapshots,
    });
    return row.contentFingerprint === fp;
  }

  return { record, hydrateApproved, rows };
}

function sampleSnapshot(id: string, title: string): InstagramEventSnapshot {
  return {
    id,
    title,
    startDate: "2026-11-01",
    startTime: "20:00",
    city: "Brussel",
    region: "Brussel",
    venue: "Café",
    organizerName: "Org",
    organizerId: "org-1",
    organizerSlug: "org-1",
    imageUrl: "https://example.invalid/a.jpg",
    imageIsAtmosphere: false,
    shortDescription: "Korte omschrijving",
    description: null,
    category: "dating",
    subCategory: "speeddate",
    eligibilityAgeMin: 28,
    eligibilityAgeMax: 40,
    eligibilityAgeRule: "guideline",
    activities: ["speeddate"],
    tags: ["singles"],
  };
}

const root = process.cwd();
const page = readFileSync(
  path.join(root, "app/interne-instagram/page.tsx"),
  "utf8",
);
const client = readFileSync(
  path.join(root, "components/admin/instagram-preview-client.tsx"),
  "utf8",
);
const actions = readFileSync(
  path.join(root, "app/interne-instagram/actions.ts"),
  "utf8",
);

assert.ok(
  page.includes("assertConceptContentApproved"),
  "page must hydrate approvals via content fingerprint check",
);
assert.ok(
  page.includes("approvedByFormat"),
  "page must pass approvedByFormat to the client",
);
ok("1. server hydrates approval status per draft");

assert.ok(client.includes("initialApproved"));
assert.ok(
  client.includes('"Goedgekeurd"'),
  "approved state must show lasting Goedgekeurd label",
);
assert.ok(client.includes("approveError"));
assert.ok(client.includes("setApproveError"));
assert.ok(client.includes("res.message"));
assert.ok(
  !client.includes('setPublishError("Goedkeuren mislukt'),
  "approve failures must not be dumped into publishError silently",
);
assert.ok(
  client.includes("Instagram-publicatie staat apart uitgeschakeld"),
  "approved + publish-disabled must be explicit",
);
ok("2. client shows persistent Goedgekeurd + separate approve errors");

assert.ok(actions.includes("approveInstagramConceptErrorMessage"));
assert.ok(actions.includes("message: approveInstagramConceptErrorMessage"));
assert.ok(actions.includes("Concept goedgekeurd en opgeslagen."));
assert.ok(
  !actions.includes("export function approveInstagramConceptErrorMessage"),
  "sync helper must not live in use-server actions file (breaks build)",
);
ok("3. approve action returns Dutch message; helper outside use-server");

assert.equal(
  approveInstagramConceptErrorMessage("unauthorized"),
  "Je bent niet ingelogd als beheerder.",
);
assert.equal(
  approveInstagramConceptErrorMessage("invalid_concept"),
  "Concept is onvolledig (events, caption of slides ontbreken).",
);
assert.equal(
  approveInstagramConceptErrorMessage("catalog_unavailable"),
  "Catalogus kon niet worden geladen. Probeer opnieuw.",
);
assert.match(
  approveInstagramConceptErrorMessage("events_missing", "evt-1"),
  /evt-1/,
);
assert.match(
  approveInstagramConceptErrorMessage(
    "approval_store_failed",
    "neon_unavailable",
  ),
  /neon_unavailable/,
);
assert.equal(
  approveInstagramConceptErrorMessage("mystery"),
  "Goedkeuren mislukt — probeer opnieuw.",
);
ok("4. approve error message helper covers known codes");

// --- Isolated store: reload / drift / failure surface ---
const store = createIsolatedApprovalStore();
const eventIds = ["e-iso-1", "e-iso-2"];
const slides: InstagramSlideApproval[] = [
  {
    kind: "binnenkort_cover",
    label: "Cover",
    query: { ids: eventIds.join(","), period: "1–7 nov" },
  },
  {
    kind: "event",
    label: "Event 1",
    query: { id: "e-iso-1", index: "1", total: "2", format: "binnenkort" },
  },
];
const snapshots = [
  sampleSnapshot("e-iso-1", "Speeddate Brussel"),
  sampleSnapshot("e-iso-2", "Walk Antwerpen"),
];
const caption = "Binnenkort te beleven — test caption";

const saved = store.record({
  format: "binnenkort",
  eventIds,
  caption,
  slides,
  eventSnapshots: snapshots,
});
assert.ok(saved.contentFingerprint.length === 64);

const afterReload = store.hydrateApproved({
  format: "binnenkort",
  eventIds,
  caption,
  slides,
});
assert.equal(
  afterReload,
  true,
  "exact same content after reload must stay approved",
);
ok("5. isolated store: approval survives reload (exact content)");

const drifted = store.hydrateApproved({
  format: "binnenkort",
  eventIds,
  caption: `${caption} — gewijzigd`,
  slides,
});
assert.equal(
  drifted,
  false,
  "caption drift must not appear approved",
);

const titleDriftSnapshots = [
  sampleSnapshot("e-iso-1", "ANDERE TITEL"),
  sampleSnapshot("e-iso-2", "Walk Antwerpen"),
];
const titleDriftFp = buildInstagramContentFingerprint({
  format: "binnenkort",
  eventIds,
  caption,
  slides,
  eventSnapshots: titleDriftSnapshots,
});
assert.notEqual(titleDriftFp, saved.contentFingerprint);

// Page hydrate uses stored snapshots from approval row, then fingerprints
// submitted draft caption/slides against those frozen snapshots. Caption
// drift is enough for UI; also ensure fingerprint identity changes on title.
ok("6. isolated store: changed content is not approved");

// Failed approval → visible Dutch message (what UI binds to approveError)
const failMessage = approveInstagramConceptErrorMessage(
  "approval_store_failed",
  "neon_unavailable",
);
assert.match(failMessage, /niet worden opgeslagen/);
assert.ok(
  client.includes("setApproveError"),
  "UI must call setApproveError on failure",
);
assert.ok(
  client.includes("ig-approve-error-"),
  "UI must render approve error with test id",
);
ok("7. failed approval surfaces a visible Dutch error");

// Instagram publish stays off (default flags)
const prevPublish = process.env.INSTAGRAM_META_PUBLISH_ENABLED;
const prevDry = process.env.INSTAGRAM_META_DRY_RUN;
delete process.env.INSTAGRAM_META_PUBLISH_ENABLED;
delete process.env.INSTAGRAM_META_DRY_RUN;
const meta = readInstagramMetaConfig();
assert.equal(meta.mode, "disabled");
assert.equal(
  metaPublishModeLabel(meta.mode),
  "uit (INSTAGRAM_META_PUBLISH_ENABLED / INSTAGRAM_META_DRY_RUN)",
);
assert.ok(client.includes('publishMode === "disabled"'));
assert.ok(client.includes("publishDisabled"));
if (prevPublish !== undefined) {
  process.env.INSTAGRAM_META_PUBLISH_ENABLED = prevPublish;
}
if (prevDry !== undefined) {
  process.env.INSTAGRAM_META_DRY_RUN = prevDry;
}
ok("8. Instagram publish remains disabled by default");

console.log("\nOK: Instagram approve UI verify.");
