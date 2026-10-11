/**
 * Intake robustness: JSON-LD facts, city inference, Brussels time display.
 */
import assert from "node:assert/strict";
import { extractJsonLdEventFacts } from "../lib/aanvoer/json-ld-event";
import { enrichProposalFromPage } from "../lib/aanvoer/structured-enrich";
import { blankProposal } from "../lib/aanvoer/types";
import { detectEssentialGaps } from "../lib/aanvoer/deep-verify";
import { inferKnownCityLabel } from "../lib/geo-cities";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Halloween Kroegtocht - Fear or Flirt?",
  "startDate": "2026-10-31T19:30:00+02:00",
  "location": {
    "@type": "Place",
    "name": "Van der Valk Hotel",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Antwerpen",
      "streetAddress": "Somewhere 1"
    }
  },
  "offers": {
    "@type": "Offer",
    "price": "25",
    "priceCurrency": "EUR"
  },
  "organizer": { "@type": "Organization", "name": "Single Events" }
}
</script>
</head><body>Halloween kroegtocht Antwerpen</body></html>
`;

const facts = extractJsonLdEventFacts(html);
assert.ok(facts);
assert.equal(facts!.title, "Halloween Kroegtocht - Fear or Flirt?");
assert.equal(facts!.startDate, "2026-10-31");
assert.equal(facts!.startTime, "19:30");
assert.equal(facts!.city, "Antwerpen");
assert.equal(facts!.venue, "Van der Valk Hotel");
assert.ok(facts!.priceNotes?.includes("25"));
assert.equal(facts!.organizer, "Single Events");

assert.equal(inferKnownCityLabel("Ghent"), "Gent");
assert.equal(inferKnownCityLabel("Van der Valk Hotel Antwerpen"), "Antwerpen");

let proposal = blankProposal();
proposal = enrichProposalFromPage({
  proposal,
  html,
  pageText: "Halloween kroegtocht",
  pageUrl: "https://allevents.in/antwerp/halloween",
});
assert.equal(proposal.city.value, "Antwerpen");
assert.equal(proposal.startTime.value, "19:30");
assert.ok(!detectEssentialGaps(proposal).includes("location"));

// Venue-only without mappable city must still gap location.
let weak = blankProposal({
  venue: { value: "Zaal X", status: "found", evidence: "x" },
  city: { value: null, status: "unknown", evidence: null },
});
assert.ok(detectEssentialGaps(weak).includes("location"));

// safe-fetch returns html field
const safeFetchPath = path.join(process.cwd(), "lib/tips/safe-fetch.ts");
assert.ok(existsSync(safeFetchPath));
const safeFetchSrc = readFileSync(safeFetchPath, "utf8");
assert.ok(safeFetchSrc.includes("html:"));
assert.ok(safeFetchSrc.includes("looksHtml"));

console.log("OK: intake structured enrich verify passed.");
