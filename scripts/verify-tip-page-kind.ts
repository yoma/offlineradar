/**
 * Tip agenda/list page-kind helpers.
 */
import assert from "node:assert/strict";
import {
  isAgendaLikePageKind,
  resolveTipPageKind,
} from "../lib/tips/page-kind";
import { emptyAiPrepPlaceholder } from "../lib/tips/ai-prep";
import type { TipSubmission } from "../types/tips";

const tipBase: TipSubmission = {
  id: "t1",
  originalUrl: "https://www.speeddaten.be/nl/antwerpen-8217.htm",
  normalizedUrl: "https://www.speeddaten.be/nl/antwerpen-8217.htm",
  note: null,
  receivedAt: new Date().toISOString(),
  notifyRequested: false,
  email: null,
  status: "needs_info",
  duplicateOfTipId: null,
  linkedEventId: null,
  linkedSourceId: null,
  duplicateNotes: [],
  submitterMeta: { userAgent: null },
};

{
  const kind = resolveTipPageKind(tipBase.originalUrl, null);
  assert.equal(kind, "agenda_list");
  assert.equal(isAgendaLikePageKind(kind), true);
}

{
  const prep = emptyAiPrepPlaceholder(tipBase);
  prep.routeReason =
    "Speeddaten.be toont een volledige agenda met meerdere events.";
  assert.equal(
    resolveTipPageKind("https://example.com/foo", prep),
    "agenda_list",
  );
}

{
  const prep = emptyAiPrepPlaceholder(tipBase);
  prep.pageKind = "single_event";
  assert.equal(
    resolveTipPageKind("https://www.speeddaten.be/nl/kalender-8.htm", prep),
    "single_event",
  );
}

console.log("OK: tip page-kind verify passed.");
