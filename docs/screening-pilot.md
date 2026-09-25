# Real Data Screening Pilot

Small, isolated pilot to test the core OfflineRadar hypothesis: can we find,
normalize and screen real activities so only genuine chances to meet new people
or singles would appear? This pilot proves selection quality; it does not build
import infrastructure, a database, or a publication pipeline.

## What this pilot is (and is not)

- It is a local developer tool: a candidate dataset + a deterministic screener +
  two `tsx` scripts.
- It is fully isolated: it does not import into `app/`, does not change
  `data/events.ts`, the consumer flow, ranking, eligibility, or the Meet demo.
- It does not publish anything to the consumer feed. No route, no DB, no auth.
- There is no AI in this pilot (no key available). The screener is a deterministic
  rule engine plus a mandatory human review step (the golden labels).

## Pipeline

```
RawCandidate  ->  NormalizedCandidate  ->  Screening  ->  Decision
```

- `types/screening.ts` - all pilot types. Source facts (`RawCandidate`) are kept
  separate from interpretation (`ScreeningResult`).
- `lib/screening/normalize.ts` - raw source facts to a structured candidate.
  Never invents facts: unknown age/region/end time stay unknown; an unknown age
  limit is not turned into "all ages".
- `lib/screening/dedupe.ts` - simple duplicate detection (title + date + venue).
- `lib/screening/screen.ts` - hard screening, then the three separated
  assessments (A/B/C), then a headline decision. Cross-checks published
  candidates against the production listing gate (`lib/events.isEventListable`).
- `lib/screening/pipeline.ts` - ties the steps together.

## Three separated assessments (A / B / C)

- **A. Concept suitability** - does this kind of activity fit OfflineRadar?
  A speeddate is conceptually suitable even if its next edition is weeks away.
- **B. Concrete occurrence** - is there a confirmed, dated future moment?
  Tracked via `occurrenceStatus`:
  - `announced_edition` - source explicitly announces a dated next edition.
  - `derived_from_schedule` - date derived from a current, confirmed fixed
    schedule (flagged `dateDerived`; never presented as an announced edition).
  - `historical_only` - only a past instance; not confirmed.
  - `community_no_next` - general community/group page, no announced next event.
  - `unverifiable` - source could not be verified.
  A recurring concept is NOT proof of a confirmed next occurrence.
- **C. Personal eligibility** - constraints (age, restricted audience) evaluated
  per user later, not here. No test user is invented. An age-restricted event is
  still valid; the existing eligibility logic decides who may see it.

## Pilot window

The pilot selects activities within 7-14 days from 2026-09-25
(`DEFAULT_PILOT_WINDOW`, configurable). Being outside the window is reported as
`outside_window` (REVIEW), NOT as unsuitable/REJECT. The window is a test
selection criterion, not a permanent platform limit.

## Decisions and status reasons

Headline `decision` is `ACCEPT` / `REVIEW` / `REJECT`, but the precise
`statusReason` keeps different problems distinct (never merged into one status):
`publication_ready`, `concept_unsuitable`, `insufficiently_confirmed`,
`outside_window`, `restricted_audience`, `expired`, `out_of_region`,
`duplicate`, `needs_review`.

`publicationReady` (ACCEPT) requires ALL of: concept suitable, a confirmed
future occurrence within the window, reliable/current source, needed event data
known, evidence new participants can join, and any Meet activation meeting the
product rules. Publication readiness is a pre-check only; it is NOT permission
to publish.

Product rules enforced (see `docs/domain-model.md`):

- OfflineRadar is not a general event calendar.
- PAYMENT DOES NOT CREATE ELIGIBILITY.
- Solo attendance is not the same as actually being able to meet new people.
- A passive public activity (concert, film, market, generic party) is not
  automatically suitable.
- An unconfirmed Meet setup is never treated as a real Meet activation.
- Unknown facts stay unknown; no favourable defaults.

## Data sources

Candidates in `data/pilot/candidates.ts` are real, publicly listed Antwerp-area
activities collected via web search on 2026-09-25. Only factual fields, a source
URL, and our own factual summary are stored. No creative descriptions or images
are copied. `signals` are read literally from each source; `null` means the
source does not say (never guessed).

The set intentionally mixes clear singles/dating events, genuine open social
activities, borderline cases, and ordinary public activities that should be
rejected, including out-of-region items and profession/members-only traps.

## Social-suitability calibration

The concept check must be neither too lenient nor too strict:

- Not too lenient: a mere reservation option, group format, or recurring
  schedule does NOT make an activity socially suitable on its own.
- Not too strict: an activity does NOT need to literally advertise "meeting new
  people" to qualify.

The deciding test is whether an individual newcomer can actually join AND the
activity enables natural interaction with other participants. Organic social
activities without explicit meet/dating intent are accepted at most at `medium`
social suitability (never `high`, and without claiming that meeting strangers is
guaranteed). Explicit singles/dating or explicit meet-new-people activities can
reach `high`. These invariants are locked by `calibrationChecks()` in
`scripts/verify-screening.ts`.

## Golden set (provisional)

`data/pilot/golden.ts` holds PROVISIONAL expected outcomes. They were authored
by the same AI as the screener, so they are test fixtures, NOT an independent
accuracy measurement. Every label is marked `provisional` and `needsHumanReview`.
`scripts/verify-screening.ts` reports divergences between the screener and these
provisional labels (it does not force a perfect score); it only fails the build
on a listing-gate invariant violation. Independent human relabelling is still
required before any accuracy claim.

## Run it

```bash
npm run screen:pilot       # inspectable table + summary
npm run verify:screening   # regression vs human golden labels
```

## AI content layer (Claude) — isolated dev pilot

An optional Claude layer judges ONE dimension only: how suitable the activity
FORMAT is for an individual newcomer to naturally meet new people. It never
decides publication readiness and never overrides the deterministic hard controls
(date, region, source, occurrence, eligibility, Meet, listing gate).

- `lib/screening/ai/anthropic-screener.ts` - `buildNeutralInput` (source-derived
  facts only; never `signals`, `factualSummary`, the rule decision/score/category,
  or golden labels), a provider-agnostic `ContentScreener` interface, the
  Anthropic adapter (structured tool output + validation + typed error handling),
  and `validateVerdict`.
- `scripts/ai-screen-compare.ts` (`npm run ai:screen:compare`) - compares the
  rule-based CONCEPT assessment vs Claude's CONCEPT assessment on the SAME
  dimension for three selected candidates only. It never compares the publication
  decision against Claude, and never runs all 25.

Model: `ANTHROPIC_MODEL` (default `claude-3-5-haiku-latest`). Key: read only from
the local env var `ANTHROPIC_API_KEY` (never hardcoded, logged, or committed;
`.env*` is gitignored; never a `NEXT_PUBLIC_` var). Without a key the compare
script runs a dry run (builds neutral input, self-tests the validator) and stops
before any real API call. Invalid/missing/unvalidatable output is never treated
as ACCEPT.

Set the key locally (do not paste it into chat):

```bash
# .env.local (gitignored) OR shell export, local dev only
export ANTHROPIC_API_KEY=...      # your key
export ANTHROPIC_MODEL=claude-3-5-haiku-latest   # optional override
```

## Providing more real candidates

Add entries to `data/pilot/candidates.ts` using the `RawCandidate` shape: a
`provenance` (source name + URL + checked date), the stated facts, a factual
summary, and literal `signals` (use `null` when the source is silent). Do not
invent activities or facts. Then add a human expected label in
`data/pilot/golden.ts`.

## Deliberately not built

Large scraper/crawler, permanent import or publication pipeline, database,
business/auth/payments, public pilot route, admin dashboard, automatic coupling
to the consumer feed, fake AI, or a new paid AI provider.
