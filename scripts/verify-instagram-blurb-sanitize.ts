/**
 * Regression: scraped multiline shortDescription must not reach EventSlide blurb
 * (Satori stacks newlines → overlapping text). Render-effective blurb is also
 * bound into content fingerprints so older dump-based approvals become invalid.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { matchStoredApprovalContent, packApprovalSlides } from "@/lib/instagram/approvals";
import {
  effectiveInstagramBlurb,
  sanitizeInstagramBlurb,
} from "@/lib/instagram/blurb";
import {
  buildInstagramContentFingerprint,
  canonicalizeSlidesForApproval,
} from "@/lib/instagram/concept-key";
import {
  canonicalizeEventSnapshots,
  type InstagramEventSnapshot,
} from "@/lib/instagram/event-snapshot";

function ok(label: string) {
  console.log(`OK  ${label}`);
}

assert.equal(sanitizeInstagramBlurb(""), null);
assert.equal(sanitizeInstagramBlurb("   "), null);
assert.equal(
  sanitizeInstagramBlurb("Gezellige avond voor singles in Antwerpen."),
  "Gezellige avond voor singles in Antwerpen.",
);
ok("1. clean one-line blurb kept");

assert.equal(
  sanitizeInstagramBlurb("Line one\nLine two\nLine three"),
  "Line one Line two Line three",
);
ok("2. few newlines collapse to spaces");

const scraped = `11 \r\n November \r\n 2026 \n \n \n \n \n \n \n \n \n \n \n \n \r\n \n \n \n \n \n \n 11/11 Antwerpen Hogeropgeleiden, 30-40j \n \n Adres\n \n Fidèle\nWapenstraat 18\n2000 Antwerpen \n \n \n \n Datum & tijd\n \n woen`;
assert.equal(
  sanitizeInstagramBlurb(scraped),
  null,
  "scraped Adres/Datum dump must be rejected",
);
ok("3. scraped multiline dump rejected (slide-4 overlap root cause)");

assert.equal(sanitizeInstagramBlurb("Kort\r\nmaar ok"), "Kort maar ok");
ok("4. CRLF pair collapses without rejecting");

assert.equal(
  sanitizeInstagramBlurb(
    "Malta | 2027-11-18 | 8d | available | https://juntas.be/example",
  ),
  null,
);
ok("5. catalog metadata+URL lines rejected");

assert.equal(
  effectiveInstagramBlurb({
    shortDescription: scraped,
    city: "Antwerpen",
    activities: ["speeddate"],
  }),
  "Ontmoet andere singles tijdens deze speeddate in Antwerpen.",
);
ok("6. dump falls back to generated blurb (relevant copy kept)");

assert.equal(
  effectiveInstagramBlurb({
    shortDescription: "Gezellige avond voor singles in Antwerpen.",
    city: "Antwerpen",
    activities: ["speeddate"],
  }),
  "Gezellige avond voor singles in Antwerpen.",
);
ok("7. relevant one-line description preserved");

const snapsDump: InstagramEventSnapshot[] = [
  {
    id: "e1",
    title: "11/11 Antwerpen Hogeropgeleiden, 30-40j",
    startDate: "2026-11-11",
    startTime: "18:30",
    city: "Antwerpen",
    region: "Antwerpen",
    venue: null,
    organizerName: "Org",
    organizerId: null,
    organizerSlug: null,
    imageUrl: null,
    imageIsAtmosphere: true,
    shortDescription: scraped,
    description: null,
    category: "dating",
    subCategory: "speeddate",
    eligibilityAgeMin: 30,
    eligibilityAgeMax: 40,
    eligibilityAgeRule: "guideline",
    activities: ["speeddate"],
    tags: [],
  },
];

const slides = [
  {
    kind: "event" as const,
    label: "Event",
    query: { id: "e1", index: "1", total: "1", format: "nieuw" },
  },
];
const format = "nieuw" as const;
const eventIds = ["e1"];
const caption = "Nieuw op DateOfflineHub";

// Legacy opaque fingerprint: v3 + raw dump shortDescription (pre-blurb contract).
const legacyOpaque = createHash("sha256")
  .update(
    `ig3b-content:v3:${JSON.stringify({
      format,
      eventIds,
      caption: caption.trim(),
      slides: canonicalizeSlidesForApproval(slides),
      eventSnapshots: snapsDump.map((s) => ({
        ...s,
        shortDescription: scraped.trim().slice(0, 500),
      })),
    })}`,
  )
  .digest("hex")
  .slice(0, 64);

const currentFp = buildInstagramContentFingerprint({
  format,
  eventIds,
  caption,
  slides,
  eventSnapshots: snapsDump,
});
assert.notEqual(
  currentFp,
  legacyOpaque,
  "current fingerprint must differ from pre-blurb dump hash",
);

const packed = packApprovalSlides(slides, snapsDump);
const hydrated = matchStoredApprovalContent({
  format,
  eventIds,
  caption,
  slides,
  storedCaption: caption,
  storedSlides: packed.slides,
  storedEventSnapshots: packed.eventSnapshots,
  storedContentFingerprint: legacyOpaque,
});
assert.equal(
  hydrated.ok,
  false,
  "old dump-based approval must be invalid under current render contract",
);
ok("8. changed render blurb invalidates old approval (opaque fingerprint)");

const freshFp = buildInstagramContentFingerprint({
  format,
  eventIds,
  caption,
  slides,
  eventSnapshots: snapsDump,
});
const freshPacked = packApprovalSlides(slides, snapsDump);
const freshMatch = matchStoredApprovalContent({
  format,
  eventIds,
  caption,
  slides,
  storedCaption: caption,
  storedSlides: freshPacked.slides,
  storedEventSnapshots: freshPacked.eventSnapshots,
  storedContentFingerprint: freshFp,
});
assert.equal(freshMatch.ok, true);
ok("9. fresh approval under current contract still matches");

const canon = canonicalizeEventSnapshots(snapsDump)[0]!;
assert.equal(
  canon.shortDescription,
  "Ontmoet andere singles tijdens deze speeddate in Antwerpen.",
);
ok("10. canonical snapshots store render-effective blurb");

console.log("\nOK: Instagram blurb sanitize + approval invalidation verify.");
