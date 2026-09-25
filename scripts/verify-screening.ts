import { PILOT_CANDIDATES } from "@/data/pilot/candidates";
import { GOLDEN_LABELS } from "@/data/pilot/golden";
import { runPipeline } from "@/lib/screening/pipeline";
import { DEFAULT_PILOT_WINDOW, screenCandidate } from "@/lib/screening/screen";
import type { CandidateSignals, NormalizedCandidate } from "@/types/screening";

/**
 * Regression / divergence check against provisional golden labels + Route A/B
 * calibration invariants.
 *
 * Outdated golden labels (broad social era) are reported, not treated as the
 * target. The build fails only on listing-gate or calibration invariant failure.
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

const SOCIAL_OPEN: Partial<CandidateSignals> = {
  individualParticipationNormal: true,
  openToNewcomers: true,
  interactionOpportunity: true,
  guidedOrGroupFormat: true,
  passivePublicActivity: false,
  membersOrPrivateOnly: false,
  explicitSinglesOrDating: false,
  explicitMeetNewPeople: false,
  confirmedMeetActivation: false,
};

function mkCandidate(
  id: string,
  signals: Partial<CandidateSignals>,
  overrides: Partial<NormalizedCandidate> = {},
): NormalizedCandidate {
  return {
    id,
    provenance: {
      sourceName: "test",
      sourceUrl: "https://example.com",
      checkedAtIso: "2026-09-25",
    },
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
 * Calibration invariants for the restored singles Route A/B definition.
 */
function calibrationChecks(): number {
  let failures = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? "ok  " : "FAIL"} calibratie: ${name}`);
    if (!ok) failures += 1;
  };

  const ordinaryCases: Array<[string, Partial<CandidateSignals>]> = [
    ["cal-kookworkshop", { ...SOCIAL_OPEN, guidedOrGroupFormat: true }],
    ["cal-loopclub", { ...SOCIAL_OPEN, explicitMeetNewPeople: true }],
    ["cal-bordspel", { ...SOCIAL_OPEN, explicitMeetNewPeople: true }],
    ["cal-taalavond", { ...SOCIAL_OPEN, explicitMeetNewPeople: true }],
    [
      "cal-fuif",
      {
        ...SOCIAL_OPEN,
        guidedOrGroupFormat: false,
        passivePublicActivity: true,
      },
    ],
  ];

  for (const [id, signals] of ordinaryCases) {
    const r = screenCandidate(mkCandidate(id, signals), null, DEFAULT_PILOT_WINDOW, PILOT_NOW);
    check(
      `${id}: gewone sociale/passieve activiteit zonder singlesformule -> concept ongeschikt`,
      r.conceptSuitable === false && r.decision === "REJECT",
    );
  }

  const routeA = screenCandidate(
    mkCandidate("cal-singles-speeddate", {
      explicitSinglesOrDating: true,
      explicitMeetNewPeople: true,
      individualParticipationNormal: true,
      openToNewcomers: true,
      interactionOpportunity: true,
      passivePublicActivity: false,
      membersOrPrivateOnly: false,
      confirmedMeetActivation: false,
    }),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check(
    "Route A singles-speeddate -> concept geschikt (dating) + publicatieklaar mogelijk",
    routeA.conceptSuitable === true &&
      routeA.category === "dating" &&
      routeA.decision === "ACCEPT",
  );

  const routeB = screenCandidate(
    mkCandidate("cal-meet-route-b", {
      ...SOCIAL_OPEN,
      confirmedMeetActivation: true,
      explicitSinglesOrDating: false,
    }),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check(
    "Route B bevestigde singles-Meet op gewone activiteit -> concept geschikt",
    routeB.conceptSuitable === true &&
      routeB.category === "meet_new_people" &&
      routeB.decision === "ACCEPT",
  );

  const friendlyOnly = screenCandidate(
    mkCandidate("cal-singles-friendly-claim", {
      ...SOCIAL_OPEN,
      explicitSinglesOrDating: false,
      confirmedMeetActivation: false,
    }),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check(
    "vrijblijvende sociale/open activiteit (geen singlesformule) -> geen toelating",
    friendlyOnly.conceptSuitable === false,
  );

  const unconfirmedMeet = screenCandidate(
    mkCandidate("cal-unconfirmed-meet", {
      ...SOCIAL_OPEN,
      confirmedMeetActivation: false,
      explicitSinglesOrDating: false,
    }),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check(
    "onbevestigde Meet (false) -> geen Route B-toelating",
    unconfirmedMeet.conceptSuitable === false,
  );

  // Payment is never a CandidateSignals field; paid ordinary social still rejects.
  const paidOrdinary = screenCandidate(
    mkCandidate(
      "cal-paid-ordinary",
      { ...SOCIAL_OPEN },
      { price: 45, priceKnown: true },
    ),
    null,
    DEFAULT_PILOT_WINDOW,
    PILOT_NOW,
  );
  check(
    "betaling op gewone sociale activiteit creëert geen toelating",
    paidOrdinary.conceptSuitable === false && paidOrdinary.decision === "REJECT",
  );

  const noOccurrence = screenCandidate(
    mkCandidate(
      "cal-singles-no-occurrence",
      {
        explicitSinglesOrDating: true,
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
    "geschikt singlesconcept zonder bevestigd moment -> REVIEW (insufficiently_confirmed)",
    noOccurrence.conceptSuitable === true &&
      noOccurrence.decision === "REVIEW" &&
      noOccurrence.statusReason === "insufficiently_confirmed" &&
      noOccurrence.publicationReady === false,
  );

  return failures;
}

function main() {
  const rows = runPipeline(PILOT_CANDIDATES, DEFAULT_PILOT_WINDOW, PILOT_NOW);
  const byId = new Map(rows.map((r) => [r.result.candidateId, r]));

  let divergences = 0;
  let outdatedCount = 0;
  let gateDisagreements = 0;
  const needsHumanReview: string[] = [];

  console.log("Vergelijking screener vs voorlopige golden labels:\n");
  for (const label of GOLDEN_LABELS) {
    if (label.needsHumanReview) needsHumanReview.push(label.candidateId);
    if (label.outdated) outdatedCount += 1;
    const row = byId.get(label.candidateId);
    if (!row) {
      console.log(`MISSING  ${label.candidateId}`);
      divergences += 1;
      continue;
    }
    const { result } = row;
    const tag = label.outdated ? "OUTDATED" : "fixture ";
    if (result.decision !== label.expectedDecision) {
      divergences += 1;
      console.log(
        `DIVERGE  [${tag}] ${label.candidateId}: voorlopig ${label.expectedDecision} -> nu ${result.decision} (${result.statusReason})` +
          (label.outdatedReason ? ` — ${label.outdatedReason}` : ""),
      );
    } else {
      console.log(`ok       [${tag}] ${label.candidateId} (${result.decision})`);
    }
    if (label.humanConceptDecision) {
      console.log(
        `HUMAN    ${label.candidateId}: concept=${label.humanConceptDecision} (onafhankelijke producteigenaar)`,
      );
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
    `\nGolden: ${GOLDEN_LABELS.length} labels (${outdatedCount} achterhaald), ${divergences} divergentie(s) t.o.v. historische fixtures.`,
  );
  console.log(
    `Onafhankelijke menselijke review nog open: ${needsHumanReview.length}/${GOLDEN_LABELS.length}.`,
  );
  console.log(`Listing-gate afwijkingen: ${gateDisagreements}.`);

  console.log("\nKalibratie-invarianten (Route A/B):");
  const calibrationFailures = calibrationChecks();

  if (gateDisagreements > 0 || calibrationFailures > 0) {
    console.log("\nFAIL: invariant geschonden (listing-gate en/of kalibratie).");
    process.exit(1);
  }
  console.log(
    "\nOK: geen invariant-schendingen. Divergenties t.o.v. achterhaalde fixtures zijn verwacht.",
  );
}

main();
