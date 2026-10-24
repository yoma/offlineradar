/**
 * Regression: scraped multiline shortDescription must not reach EventSlide blurb
 * (Satori stacks newlines → overlapping text on Instagram slides).
 */
import assert from "node:assert/strict";
import { sanitizeInstagramBlurb } from "@/lib/instagram/templates/slides";

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

assert.equal(
  sanitizeInstagramBlurb("Kort\r\nmaar ok"),
  "Kort maar ok",
);
ok("4. CRLF pair collapses without rejecting");

assert.equal(
  sanitizeInstagramBlurb(
    "Malta | 2027-11-18 | 8d | available | https://juntas.be/example",
  ),
  null,
);
ok("5. catalog metadata+URL lines rejected");

console.log("\nOK: Instagram blurb sanitize verify.");
