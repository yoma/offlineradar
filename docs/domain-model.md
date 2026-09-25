# OfflineRadar domain model (MVP + future Business)

## Current MVP shape

1. Event has `listingPath`, `singlesFriendly`, `organizerId`, `venueId`, and optional `meetActivation`.
2. [`types/domain.ts`](../types/domain.ts) holds Meet / Organizer / Venue / Trust / Promotion stubs.
3. Ranking exposes `organicScore` and `promotionScore` (always `0` in MVP).
4. Catalog listing (intended): Route A singles-oriented organic **or** active Meet (Route B). MVP helper still uses socialSuitability|Meet until consumer alignment.
5. Consumer badges appear only when data exists (Singles only / Singles Friendly / OfflineRadar Meet).
6. One mock Meet demo event: `afterwork-dak-meet`.

## Product definition

OfflineRadar helps **singles** find offline activities and organised moments to
meet **other singles**. It is not a general event calendar, not a friendship or
“any social activity” directory, and not a swipe/chat dating app.

Content belongs on OfflineRadar only via:

- **Route A** — Source shows a concrete singles-oriented meeting activity
  (speeddate, singles dinner/party, singles walk, etc.).
- **Route B** — An ordinary place/activity has a real, confirmed singles meeting
  formula (typically a valid OfflineRadar Meet). Marketing badges and unconfirmed
  Meet claims do not count.

A generally social activity (open run club, cooking workshop, board-game night,
language exchange, ordinary party) is **not** enough on its own.
Singles-oriented ≠ `singlesOnly`: the whole venue need not be singles-only.

The screening pilot (`lib/screening/`, `docs/screening-pilot.md`) enforces Route
A/B for concept admission. Consumer mock listing still uses the MVP helper below
until a later consumer-alignment pass; do not treat old mock `social` events as
proof of the product rule.

## Domain concepts

| Concept | Meaning |
|---|---|
| **Organic (Route A)** | Singles-oriented activity from source (`listingPath: "organic"`). Not “any social format”. |
| **Singles only** | Source policy: event admits singles only (`singlesOnly: true`). Separate from Route A evidence. |
| **Singles Friendly** | Informative lighter welcome for solo/singles visitors. **Not** a listing bypass, eligibility, or ranking/promotion effect. |
| **OfflineRadar Meet (Route B)** | Concrete organizer commitment so singles who opt in can actually find each other. |
| **Promotion** | Paid placement. Separate from organic relevance. Never creates eligibility. |

## Hard rules

1. OfflineRadar is for singles meeting singles (Route A or B), **not** a general event calendar or directory of shops/cinemas/markets.
2. **PAYMENT DOES NOT CREATE ELIGIBILITY.**
3. `singlesOnly` ≠ `singlesFriendly` ≠ Meet activation.
4. Sending singles to the same room without a way to find each other is not enough for Meet.
5. Recognition is always **opt-in**; nobody is forced to be labelled as single.
6. Organic ranking and paid promotion stay separate (`organicScore` vs `promotionScore`).
7. Meet ranking bonus applies only when the user's search intent is social/meet-oriented (MVP heuristic).
8. “Singles friendly” without a concrete singles formula never creates admission.

## Listing gate

**Intended content rule:** listable when Route A (singles-oriented organic) **or** Route B (valid **active** Meet, `listingPath: "meet_activation"`).

**MVP consumer helper** (`lib/events.isEventListable`) still keys off
`socialSuitability` high/medium **or** active Meet so existing mock data keeps
working until the consumer catalog is realigned. Screening publication checks
already require Route A/B; payment and `singlesFriendly` never enter either gate.

Same content rule later if Meet becomes standalone: a supermarket is not on
OfflineRadar, but “Singles Shopping · Thursday 19–21” can be if Meet Standard is
fulfilled.

## EventMeetActivation today (MVP)

`Event.meetActivation` nests `EventMeetActivation` on Event. That is correct for the consumer MVP.

This does **not** mean Meet must forever be a child of Event only.

Most Meet fields are already generic (host, zone, moment, recognition, interaction, responsible person, commitment timestamp, terms version, verification). Little of the Meet shape is intrinsically Event-only; the coupling is mainly nesting + listing/ranking reading Meet via Event.

## Future hypothesis: standalone MeetActivation

Later, domain direction may evolve to a first-class `MeetActivation` that can optionally relate to:

- `eventId` (Meet on top of an existing event)
- `venueId` / location
- `organizerId` / partner
- concrete start/end time slot

Examples:

| Pattern | Example |
|---|---|
| Event + Meet layer | Party, comedy, afterwork with host + opt-in recognition |
| Venue time slot | Singles Shopping · Thursday 19:00–21:00 |
| Shared public context | Meet start + route during a jaarmarkt (market itself is not listed) |
| Activity lanes | Bowling Meet lanes with host and rotation |
| Pre/post activity | Cinema: welcome drink → film → afterdrink |

Some Meet activations sit **on top of** an existing event. Others **are** the social moment inside a place/context.

Migration path if needed: extract Meet rows, keep Event as a projected listing card for consumers, keep access behind [`lib/events.ts`](../lib/events.ts). No premature refactor in MVP.

## Meet Standard (also for location activations)

The same standard applies whether Meet sits on an event or a venue time slot:

- concrete organizer/partner
- responsible person
- host / contact point
- Meet moment / start point
- real interaction possibility
- optional opt-in recognition
- solo visitors welcome
- no dating guarantee
- no claim that everyone is single
- no guaranteed gender balance
- fulfilment later verifiable

For shared/public locations, **venue/organizer authorization** may later be required so a random person cannot claim “OfflineRadar Meet at municipality fair X” without the entitled organizer. Approval workflow is not built yet.

## Commitment auditability (later)

We need to reconstruct: “What did this organizer explicitly declare before this Meet moment?”

`commitmentAcceptedAt` / `termsVersion` / responsible person are a start. A future persistence layer may need an **immutable commitment record** or activation version/history.

Do **not** build event sourcing or an audit log in MVP. Do not forget the requirement.

## How business ownership can attach later

- `organizerId` / `venueId` already exist on Event.
- Future tables: `Organizer`, `Venue`, `BusinessAccount`, claim links.
- Organizer trust / sanctions attach to Organizer, affecting **future** Meet activations and promotions.

## Ranking notes

- `organicScore` = relevance (distance, time, preferences, eligibility soft signals, intent-gated Meet bonus).
- `promotionScore` = always `0` in MVP; never invents eligibility.
- Active Meet `+5` only when search intent is social/meet-oriented (categories dating/meet_new_people, singles filter, meet-gender preference, or preferred age). Temporary MVP heuristic until richer intent data exists.
- `singlesFriendly` does **not** affect ranking or listing.

## Consciously NOT built

- `/business` dashboard, claim flows, auth
- Stripe, subscriptions, invoices
- Boost checkout, pay-per-footfall
- Digital signature UX, post-event surveys, reputation engine
- Consumer “activate Meet” controls
- Standalone MeetActivation entity / location scheduler
- URL rename of search param `meet` → preferred meet gender (breaking; revisit later)

## Re-evaluate later

- Persist mock data in Postgres/Neon.
- Extract standalone `MeetActivation` when venue time-slot products need it.
- Rename URL `meet` to `meetGender` before a public API freeze.
- Split `socialSuitability` listing gate from quality score if product needs clearer semantics.
- Whether `PromotionPlacement` lives in its own table vs Edge Config / campaign service.
- Immutable Meet commitment records for dispute/trust flows.
