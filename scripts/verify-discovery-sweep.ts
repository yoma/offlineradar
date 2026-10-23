/**
 * Offline checks for Autopilot Phase 2A discovery-sweep.
 * Usage: npm run verify:discovery-sweep
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISCOVERY_BLIND_RECALL_FORBIDDEN_BRANDS,
  DISCOVERY_QUERY_MATRIX,
  selectDiscoveryQueries,
} from "../data/discovery/query-matrix";
import {
  AGENT_DISCOVERED_TAG,
  isAgentDiscoveredNotes,
  withAgentDiscoveredProvenance,
} from "../lib/discovery/agent-provenance";
import {
  USER_SUPPLIED_TAG,
  isUserSuppliedNotes,
  withUserSuppliedProvenance,
} from "../lib/discovery/user-supplied";
import {
  catalogUrlForDiscoveryChannel,
  discoveryDedupeKey,
} from "../lib/discovery/canonical-url";
import {
  classifyDiscoveryChannel,
  isSignalOnlyChannel,
} from "../lib/discovery/channel";
import { evaluateDiscoveryHeuristics } from "../lib/discovery/heuristics";
import {
  DISCOVERY_SWEEP_MAX_CANDIDATES,
  DISCOVERY_SWEEP_MAX_INSERTS,
  DISCOVERY_SWEEP_MAX_QUERIES,
  isDiscoverySweepGloballyEnabled,
  isDiscoveryWallonieEnabled,
} from "../lib/discovery/sweep-config";
import { runDiscoverySweep } from "../lib/discovery/sweep";
import { isCronRequestAuthorized } from "../lib/source-refresh/cron-auth";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function fakeRequest(auth: string | null): Request {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("https://example.test/api/cron/discovery-sweep", {
    headers,
  });
}

async function main() {
  assert.ok(DISCOVERY_QUERY_MATRIX.length >= 20);
  ok("1. query matrix has volume");

  for (const q of DISCOVERY_QUERY_MATRIX) {
    const hay = q.query.toLowerCase();
    for (const brand of DISCOVERY_BLIND_RECALL_FORBIDDEN_BRANDS) {
      assert.equal(
        hay.includes(brand),
        false,
        `query "${q.id}" must not contain brand "${brand}"`,
      );
    }
  }
  ok("2. blind-recall: no brand names in queries");

  const noWallonie = selectDiscoveryQueries({
    includeWallonie: false,
    maxQueries: 40,
  });
  assert.ok(noWallonie.every((q) => !q.wallonie));
  const withWallonie = selectDiscoveryQueries({
    includeWallonie: true,
    maxQueries: 40,
  });
  assert.ok(withWallonie.some((q) => q.wallonie));
  ok("3. Wallonie gated by flag");

  const batch = selectDiscoveryQueries({ maxQueries: 6, rotateOffset: 3 });
  assert.equal(batch.length, 6);
  ok("4. bounded query select");

  assert.ok(DISCOVERY_SWEEP_MAX_QUERIES <= 8);
  assert.ok(DISCOVERY_SWEEP_MAX_CANDIDATES <= 20);
  assert.ok(DISCOVERY_SWEEP_MAX_INSERTS <= 8);
  ok("5. sweep caps conservative");

  const prev = process.env.OFFLINERADAR_DISCOVERY_SWEEP;
  delete process.env.OFFLINERADAR_DISCOVERY_SWEEP;
  assert.equal(isDiscoverySweepGloballyEnabled(), false);
  process.env.OFFLINERADAR_DISCOVERY_SWEEP = "1";
  assert.equal(isDiscoverySweepGloballyEnabled(), true);
  if (prev === undefined) delete process.env.OFFLINERADAR_DISCOVERY_SWEEP;
  else process.env.OFFLINERADAR_DISCOVERY_SWEEP = prev;
  ok("6. kill switch default OFF");

  delete process.env.OFFLINERADAR_DISCOVERY_WALLONIE;
  assert.equal(isDiscoveryWallonieEnabled(), false);
  ok("7. Wallonie env default OFF");

  assert.equal(classifyDiscoveryChannel("https://singlesclub.be/agenda"), "organizer");
  assert.equal(
    classifyDiscoveryChannel("https://www.eventbrite.be/e/singles-x"),
    "ticket_platform",
  );
  assert.equal(
    classifyDiscoveryChannel("https://allevents.in/ghent/speed-dating"),
    "aggregator",
  );
  assert.equal(
    classifyDiscoveryChannel("https://hoptodate.com/single-cafe"),
    "ticket_platform",
  );
  assert.equal(
    classifyDiscoveryChannel("https://www.instagram.com/someorg/"),
    "social_signal",
  );
  assert.ok(isSignalOnlyChannel("social_signal"));
  assert.equal(
    catalogUrlForDiscoveryChannel(
      "https://fullcircle.eu/event-6289772",
      "organizer",
    ),
    "https://fullcircle.eu",
  );
  assert.equal(
    discoveryDedupeKey("https://www.sportievesingles.be/kalender", "organizer"),
    discoveryDedupeKey("https://sportievesingles.be/", "organizer"),
  );
  ok("8. channel ranking + organizer origin canonicalization");

  const accept = evaluateDiscoveryHeuristics({
    title: "Singles diner Gent",
    text: "Welkom op ons singles diner in Gent. Agenda met edities voor alleenstaanden.",
    url: "https://example-singles.be/",
  });
  assert.equal(accept.accept, true);
  assert.equal(accept.route, "A");

  const rejectSocial = evaluateDiscoveryHeuristics({
    title: "Expat Meetup Brussels",
    text: "Friendship only networking for expats. Meet new people.",
    url: "https://meetup.com/expat",
  });
  assert.equal(rejectSocial.accept, false);
  ok("9. Route A heuristics accept/reject");

  const agentNotes = withAgentDiscoveredProvenance(null, "test");
  assert.ok(agentNotes && isAgentDiscoveredNotes(agentNotes));
  assert.ok(agentNotes.includes(AGENT_DISCOVERED_TAG));
  assert.ok(!isUserSuppliedNotes(agentNotes));

  const userNotes = withUserSuppliedProvenance("handmatig");
  assert.ok(isUserSuppliedNotes(userNotes));
  const refused = withAgentDiscoveredProvenance(userNotes, "should not attach");
  assert.ok(refused && isUserSuppliedNotes(refused));
  assert.equal(isAgentDiscoveredNotes(refused), false);
  assert.ok(userNotes.includes(USER_SUPPLIED_TAG));
  ok("10. agent provenance; user tag never overwritten");

  const prevCron = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret-discovery";
  assert.equal(isCronRequestAuthorized(fakeRequest(null)), false);
  assert.equal(
    isCronRequestAuthorized(fakeRequest("Bearer test-secret-discovery")),
    true,
  );
  assert.equal(
    isCronRequestAuthorized(fakeRequest("Bearer wrong")),
    false,
  );
  if (prevCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevCron;
  ok("11. cron auth same Bearer pattern");

  // Injected search/fetch: no network; dry-run accept path.
  const summary = await runDiscoverySweep({
    dryRun: true,
    useAnthropic: false,
    maxQueries: 2,
    maxCandidates: 3,
    maxInserts: 2,
    rotateOffset: 0,
    search: async () => ({
      hits: [
        {
          url: "https://www.instagram.com/fake/",
          query: "singles party Gent",
          provider: "bing",
        },
        {
          url: "https://singles-demo-org.example/agenda",
          query: "singles party Gent",
          provider: "bing",
        },
        {
          url: "https://meetup.com/generic-social",
          query: "singles party Gent",
          provider: "bing",
        },
        {
          url: "https://www.eventbrite.be/e/singles-tickets-1",
          query: "singles party Gent",
          provider: "bing",
        },
        {
          url: "https://known-org.be/event-999",
          query: "singles party Gent",
          provider: "bing",
        },
      ],
      providersUsed: ["bing"],
      searchResultCount: 5,
    }),
    fetchHtml: async (url) => {
      if (url.includes("singles-demo-org") || url.includes("known-org.be")) {
        return {
          ok: true,
          finalUrl: url,
          html: `<html><title>Demo Singles Club</title><body>
            Singles party in Gent. Kalender voor alleenstaanden in België.
          </body></html>`,
        };
      }
      return { ok: true, finalUrl: url, html: "<html><title>Other</title><body>hello</body></html>" };
    },
    lookupExisting: async (catalogUrl) => {
      if (catalogUrl.includes("known-org.be")) {
        return {
          id: "existing-1",
          notes: "seeded organizer",
          status: "active",
        };
      }
      return null;
    },
  });

  assert.equal(summary.dryRun, true);
  assert.equal(summary.wrote, false);
  assert.ok(
    summary.accepted.some((a) => a.url === "https://singles-demo-org.example"),
  );
  assert.ok(summary.rejected.some((r) => r.reason === "social_signal_only"));
  assert.ok(summary.rejected.some((r) => r.reason === "aggregator_low_priority"));
  assert.ok(summary.rejected.some((r) => r.reason === "ticket_not_primary_org"));
  assert.ok(summary.skippedExisting >= 1);
  assert.ok(
    summary.accepted.some(
      (a) => a.url === "https://known-org.be" && a.created === false,
    ),
  );
  ok("12. sweep dry-run: organizer origin, reject social/agg/ticket, skip existing");

  const killSummary = await runDiscoverySweep({
    dryRun: false,
    requireGlobalEnable: true,
    search: async () => ({ hits: [], providersUsed: [], searchResultCount: 0 }),
  });
  assert.equal(killSummary.wrote, false);
  assert.ok(killSummary.rejected.some((r) => r.reason === "kill_switch_off"));
  ok("13. write path blocked when kill switch OFF");

  const playbook = readFileSync(
    join(process.cwd(), "docs/discovery-playbook.md"),
    "utf8",
  );
  assert.ok(playbook.includes("discovered_by=agent"));
  assert.ok(/geen[^\n]*auto-publish/i.test(playbook));
  ok("14. playbook documents agent provenance + no auto-publish");

  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  assert.ok(vercel.includes("/api/cron/discovery-sweep"));
  ok("15. vercel.json registers discovery-sweep cron");

  const cronRoute = readFileSync(
    join(process.cwd(), "app/api/cron/discovery-sweep/route.ts"),
    "utf8",
  );
  assert.ok(cronRoute.includes("OFFLINERADAR_DISCOVERY_SWEEP"));
  assert.ok(cronRoute.includes("isCronRequestAuthorized"));
  assert.ok(!/publication_status\s*=\s*['\"]published['\"]/.test(cronRoute));
  ok("16. cron route gated; no publish path");

  console.log("\nOK: discovery-sweep Phase 2A verify.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
