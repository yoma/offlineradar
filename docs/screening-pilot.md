# Real Data Screening Pilot

Small, isolated pilot to test whether we can find, normalize and screen real
activities so **only singles-oriented offline meeting opportunities** would
appear on OfflineRadar. This pilot proves selection quality; it does not build
import infrastructure, a database, or a publication pipeline.

## Product definition (restored)

OfflineRadar helps **singles** discover offline activities and organised moments
to meet **other singles**. It is not a general event calendar, not a friendship
directory, and not a swipe/chat dating app.

Concept admission requires **Route A** or **Route B**:

- **Route A** — Source shows a concrete activity specifically for singles meeting
  singles (speeddate, singles dinner/party, singles walk/run, singles workshop).
- **Route B** — An ordinary place/activity has a real, confirmed, organised
  singles meeting formula (e.g. a valid OfflineRadar Meet). A badge, “singles
  friendly” claim, or unconfirmed Meet is never enough.

A generally social activity (cooking together, run club, board games, language
exchange, party) is **not** enough on its own, even if newcomers can join and
talk. Singles-oriented ≠ singles-only: the whole venue need not be singles-only.

**PAYMENT DOES NOT CREATE ELIGIBILITY.**

## What this pilot is (and is not)

- It is a local developer tool: a candidate dataset + a deterministic screener +
  `tsx` scripts.
- It is fully isolated: it does not import into `app/`, does not change
  `data/events.ts`, the consumer flow, ranking, eligibility, or the Meet demo.
- It does not publish anything to the consumer feed. No route, no DB, no auth.
- Historical Claude captures in `data/pilot/claude-results.ts` are frozen test
  material; do not rewrite them or re-run paid calls to “fix” history.

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

- **A. Concept suitability** - Route A or Route B demonstrated?
  Category `social` may describe a generally social format but does **not** make
  the concept eligible without Route A/B.
- **B. Concrete occurrence** - is there a confirmed, dated future moment?
  Tracked via `occurrenceStatus`:
  - `announced_edition` - source explicitly announces a dated next edition.
  - `derived_from_schedule` - date derived from a current, confirmed fixed
    schedule (flagged `dateDerived`; never presented as an announced edition).
  - `historical_only` - only a past instance; not confirmed.
  - `community_no_next` - general community/group page, no announced next event.
  - `unverifiable` - source could not be verified.
  A recurring concept is NOT proof of a confirmed next occurrence.
  Being outside the temporary pilot window is `outside_window` (REVIEW), not
  concept unsuitable.
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

`publicationReady` (ACCEPT) requires ALL of: concept suitable (Route A/B), a
confirmed future occurrence within the window, reliable/current source, needed
event data known, evidence new participants can join, and any Meet activation
meeting the product rules. Publication readiness is a pre-check only; it is NOT
permission to publish.

Product rules enforced (see `docs/domain-model.md`):

- OfflineRadar is for singles meeting singles (Route A or B), not a general
  social calendar.
- PAYMENT DOES NOT CREATE ELIGIBILITY.
- Solo attendance / open group / chatting is not the same as a singles formula.
- A passive public activity (concert, film, market, generic party) is not
  suitable without a singles Route A/B formula.
- An unconfirmed Meet setup is never treated as a real Meet activation.
- Unknown facts stay unknown; no favourable defaults.

## Data sources

Candidates in `data/pilot/candidates.ts` are real, publicly listed Antwerp-area
activities collected via web search on 2026-09-25. Only factual fields, a source
URL, and our own factual summary are stored. No creative descriptions or images
are copied. `signals` are read literally from each source; `null` means the
source does not say (never guessed).

The set mixes clear singles/dating events, ordinary social activities that must
not pass on social signals alone, borderline cases, and public activities that
should be rejected, including out-of-region items and profession/members-only
traps.

## Concept calibration (Route A / B)

Locked by `calibrationChecks()` in `scripts/verify-screening.ts`:

- Ordinary cooking / run club / board game / language / party formats without
  singles Route A/B → concept **not** suitable.
- Explicit singles-/dating-oriented activity (Route A) → concept suitable.
- Confirmed singles Meet (Route B) → concept suitable.
- “Singles friendly” marketing alone, unconfirmed Meet, or payment → never
  creates concept admission (payment is never a screening signal).
- Suitable singles concept without a confirmed next occurrence → REVIEW
  (`insufficiently_confirmed`), not publication-ready.

## Golden set (provisional / partly outdated)

`data/pilot/golden.ts` holds provisional expected outcomes. Many early labels
assumed a **too-broad** “organic social” definition and are marked `outdated`.
They remain fixtures for divergence reporting, not independent accuracy claims.
Independent human relabelling is still required. Do not rewrite historical
Claude captures to match new rules.

## Run it

```bash
npm run screen:pilot       # inspectable table + summary
npm run verify:screening   # regression + Route A/B calibration
npm run review:build       # refresh review overview (no API calls)
```

## AI content layer (Claude) — isolated dev pilot

An optional Claude layer judges ONE dimension only: concept fit for OfflineRadar
(Route A/B singles focus). It never decides publication readiness and never
overrides the deterministic hard controls (date, region, source, occurrence,
eligibility, Meet, listing gate).

- `lib/screening/ai/anthropic-screener.ts` - `buildNeutralInput`, Anthropic
  adapter, `validateVerdict`. Prompt requires explicit singles Route A/B.
- `scripts/ai-screen-compare.ts` (`npm run ai:screen:compare`) - compares rule
  vs Claude concept on selected candidates. Never runs all 25 by default.
- `data/pilot/claude-results.ts` - frozen historical captures; do not rewrite.

Model: `ANTHROPIC_MODEL` (default `claude-3-5-haiku-latest`). Key: local
`ANTHROPIC_API_KEY` only (never hardcoded, logged, or committed).

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
