import { PILOT_CANDIDATES } from "@/data/pilot/candidates";
import { GOLDEN_LABELS } from "@/data/pilot/golden";
import { runPipeline } from "@/lib/screening/pipeline";
import { DEFAULT_PILOT_WINDOW, screenCandidate } from "@/lib/screening/screen";
import type { CandidateSignals, NormalizedCandidate } from "@/types/screening";

/**
 * Regression / divergence check against the PROVISIONAL golden labels.
 *
 * The golden labels are AI-authored fixtures (not independent). We therefore do
 * NOT fail the build on label divergence; instead we report divergences so a
 * human can relabel. The build only fails on a real invariant violation: the
 * listing-gate cross-check (lib/events) must always agree with publish/reject.
 */
const PILOT_NOW = new Date("2026-09-25T08:00:00+02:00");

const NO_SIGNALS: CandidateSignals = {
  explicitSinglesOrDating: null,
  explicitMeetNewPeople: null,
  individualParticipationNormal: null,
  openToNewcomers: null,
  interactionOpportunity: null,
  guidedOrGroupFormat: null,
  passivePublicActivity: null,
  membersOrPrivateOnly: null,
  confirmedMeetActivation: null,
  recurring: null,
};

function mkCandidate(
  id: string,
  signals: Partial<CandidateSignals>,
  overrides: Partial<NormalizedCandidate> = {},
): NormalizedCandidate {
  return {
    id,
    provenance: { sourceName: "test", sourceUrl: "https://example.com", checkedAtIso: "2026-09-25" },
    title: id,
    startDate: "2026-10-05",
    startTime: "19:00",
    endTime: null,
    city: "Antwerpen",
    region: "in_scope",
    venue: "Testlocatie",
    organizer: "Test",
    ageMin: null,
    ageMax: null,
    ageRule: "unknown",
    price: 0,
    priceKnown: true,
    signals: { ...NO_SIGNALS, ...signals },
    occurrenceStatus: "announced_edition",
    restrictedAudience: null,
    uncertainties: [],
    ...overrides,
  };
}

/**
 * Calibration invariants (locks the Fase 1.7 product decisions):
 * - not too lenient: a mere group/recurring/reservation is not auto-suitable;
 * - not too strict: no literal "meet new people" phrase is required;
 * - organic social (no explicit intent) is ACCEPT-eligible but only "medium".
 */
function calibrationChecks(): number {
  let failures = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? "ok  " : "FAIL"} calibratie: ${name}`);
    if (!ok) failures += 1;
  };

  // A. Open social group, no explicit intent -> ACCEPT with medium (not high).
  const a = screenCandidate(
    mkCandidate("cal-open-social", {
      individualParticipationNormal: true,
      openToNewcomers: true,
      interactionOpportunity: true,
      guidedOrGroupFormat: true,
      passivePublicActivity: false,
      membersOrPrivateOnly: false,
    }),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check(
    "open sociale groep zonder expliciete intentie -> ACCEPT + medium",
    a.decision === "ACCEPT" && a.socialSuitability === "medium",
  );

  // B. Only solo attendance, no proof of openness/interaction -> not ACCEPT.
  const b = screenCandidate(
    mkCandidate("cal-solo-only", {
      individualParticipationNormal: true,
      passivePublicActivity: false,
      membersOrPrivateOnly: false,
    }),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check("enkel solo deelnemen (geen open/interactie) -> geen ACCEPT", b.decision !== "ACCEPT");

  // C. Suitable concept but no confirmed occurrence -> REVIEW, not ACCEPT.
  const c = screenCandidate(
    mkCandidate(
      "cal-no-occurrence",
      {
        explicitMeetNewPeople: true,
        individualParticipationNormal: true,
        openToNewcomers: true,
        interactionOpportunity: true,
        passivePublicActivity: false,
        membersOrPrivateOnly: false,
        recurring: true,
      },
      { startDate: null, occurrenceStatus: "community_no_next" },
    ),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check(
    "geschikt concept zonder bevestigd moment -> REVIEW (insufficiently_confirmed)",
    c.decision === "REVIEW" && c.statusReason === "insufficiently_confirmed",
  );

  return failures;
}

function main() {
  const rows = runPipeline(PILOT_CANDIDATES, DEFAULT_PILOT_WINDOW, PILOT_NOW);
  const byId = new Map(rows.map((r) => [r.result.candidateId, r]));

  let divergences = 0;
  let gateDisagreements = 0;
  const needsHumanReview: string[] = [];

  console.log("Vergelijking screener vs voorlopige golden labels:\n");
  for (const label of GOLDEN_LABELS) {
    if (label.needsHumanReview) needsHumanReview.push(label.candidateId);
    const row = byId.get(label.candidateId);
    if (!row) {
      console.log(`MISSING  ${label.candidateId}`);
      divergences += 1;
      continue;
    }
    const { result } = row;
    if (result.decision !== label.expectedDecision) {
      divergences += 1;
      console.log(
        `DIVERGE  ${label.candidateId}: voorlopig ${label.expectedDecision} -> nu ${result.decision} (${result.statusReason})`,
      );
    } else {
      console.log(`ok       ${label.candidateId} (${result.decision})`);
    }
  }

  for (const { result } of rows) {
    if (!result.listingGateAgrees) {
      gateDisagreements += 1;
      console.log(
        `GATE     ${result.candidateId}: listing-gate cross-check niet consistent (${result.decision}/${result.socialSuitability})`,
      );
    }
  }

  console.log(
    `\nGolden: ${GOLDEN_LABELS.length} voorlopige labels, ${divergences} divergentie(s) t.o.v. de nieuwe screening.`,
  );
  console.log(
    `Onafhankelijke menselijke review vereist: ${needsHumanReview.length}/${GOLDEN_LABELS.length} (alle labels zijn AI-opgesteld).`,
  );
  console.log(`Listing-gate afwijkingen: ${gateDisagreements}.`);

  console.log("\nKalibratie-invarianten:");
  const calibrationFailures = calibrationChecks();

  if (gateDisagreements > 0 || calibrationFailures > 0) {
    console.log("\nFAIL: invariant geschonden (listing-gate en/of kalibratie).");
    process.exit(1);
  }
  console.log(
    "\nOK: geen invariant-schendingen. Divergenties t.o.v. voorlopige labels zijn verwacht (geen onafhankelijke meting).",
  );
}

main();
