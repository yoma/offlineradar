/**
 * Intake robustness: JSON-LD facts, city inference, Brussels time display.
 */
import assert from "node:assert/strict";
import { extractJsonLdEventFacts } from "../lib/aanvoer/json-ld-event";
import { enrichProposalFromPage } from "../lib/aanvoer/structured-enrich";
import {
  addCalendarDays,
  buildIntakeStartsAt,
  normalizeIntakeDateToYmd,
  UNKNOWN_START_TIME_NOTE,
} from "../lib/aanvoer/dates";
import { pickEnrichableEditionMatch } from "../lib/aanvoer/enrich-edition";
import { blankProposal, proposalToDraft } from "../lib/aanvoer/types";
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
assert.ok(safeFetchSrc.includes("Mozilla/5.0"));
assert.ok(safeFetchSrc.includes("looksLikeBotBlockPage"));

assert.equal(normalizeIntakeDateToYmd("31 Oktober 2026"), "2026-10-31");
assert.equal(normalizeIntakeDateToYmd("2026-10-31"), "2026-10-31");
assert.equal(addCalendarDays("2026-10-31", 1), "2026-11-01");

const noon = buildIntakeStartsAt({ startDate: "2026-10-31", startTime: "" });
assert.ok(noon?.timeUnknown);
assert.match(noon!.startsAt, /T12:00:00/);
assert.ok(UNKNOWN_START_TIME_NOTE.includes("startuur"));
const timed = buildIntakeStartsAt({
  startDate: "2026-10-31",
  startTime: "19:30",
});
assert.equal(timed?.timeUnknown, false);

// AI free-text date must lose to JSON-LD ISO.
let dutchAi = blankProposal({
  startDate: {
    value: "31 Oktober 2026",
    status: "found",
    evidence: "AI",
  },
});
dutchAi = enrichProposalFromPage({ proposal: dutchAi, html });
assert.equal(dutchAi.startDate.value, "2026-10-31");
assert.equal(proposalToDraft(dutchAi).startDate, "2026-10-31");

const saveSrc = readFileSync(
  path.join(process.cwd(), "lib/aanvoer/save.ts"),
  "utf8",
);
assert.ok(saveSrc.includes("buildIntakeStartsAt"));
assert.ok(saveSrc.includes("buildIntakeEndsAt"));

const enrichSrc = readFileSync(
  path.join(process.cwd(), "lib/aanvoer/enrich-edition.ts"),
  "utf8",
);
assert.ok(enrichSrc.includes("enrichEditionFromIntakeDraft"));
assert.ok(enrichSrc.includes("pickEnrichableEditionMatch"));
assert.ok(enrichSrc.includes("filledFields"));

const toolsSrc = readFileSync(
  path.join(process.cwd(), "lib/admin-chat/tools.ts"),
  "utf8",
);
assert.ok(toolsSrc.includes("enrichEditionFromIntakeDraft"));
assert.ok(toolsSrc.includes("pickEnrichableEditionMatch"));

assert.equal(
  pickEnrichableEditionMatch([
    {
      kind: "event_edition",
      id: "a",
      label: "x",
      detail: "",
      matchReason: "Vergelijkbare titel (mogelijk zelfde event)",
    },
    {
      kind: "event_edition",
      id: "b",
      label: "y",
      detail: "",
      matchReason: "Zelfde eventbron-URL",
    },
  ])?.id,
  "b",
);

console.log("OK: intake structured enrich verify passed.");
