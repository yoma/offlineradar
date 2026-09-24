# OfflineRadar domain model (MVP + future Business)

## What changed in this pass

1. Event gained `listingPath`, `singlesFriendly`, `organizerId`, `venueId`, and optional `meetActivation`.
2. New [`types/domain.ts`](../types/domain.ts) holds Meet / Organizer / Venue / Trust / Promotion stubs.
3. Ranking exposes `organicScore` and `promotionScore` (always `0` in MVP).
4. Catalog listing allows organic social suitability **or** an active Meet activation.
5. Consumer badges appear only when data exists (Singles only / Singles Friendly / OfflineRadar Meet).
6. One mock Meet demo event: `afterwork-dak-meet`.

## Why

So OfflineRadar can later grow **OfflineRadar for Business**, claimed organizers/venues, Meet commitments, trust and paid boosts **without rebuilding** the Event core or mixing payment into eligibility.

## Domain concepts

| Concept | Meaning |
|---|---|
| **Organic social event** | Inherently suitable to meet people (`listingPath: "organic"` + medium/high `socialSuitability`). |
| **Singles only** | Source policy: event is explicitly for singles (`singlesOnly: true`). |
| **Singles Friendly** | Lighter welcome for solo/singles visitors. **Not** a listing bypass. |
| **OfflineRadar Meet** | Concrete organizer commitment (`EventMeetActivation`) so people who opt in can actually find each other. |
| **Promotion** | Paid placement. Separate from organic relevance. Never creates eligibility. |

## Hard rules

1. OfflineRadar is **not** a general event calendar.
2. **PAYMENT DOES NOT CREATE ELIGIBILITY.**
3. `singlesOnly` ≠ `singlesFriendly` ≠ Meet activation.
4. Sending singles to the same room without a way to find each other is not enough for Meet.
5. Recognition is always **opt-in**; nobody is forced to be labelled as single.
6. Organic ranking and paid promotion stay separate (`organicScore` vs `promotionScore`).

## How business ownership can attach later

- `organizerId` / `venueId` already exist on Event.
- Future tables: `Organizer`, `Venue`, `BusinessAccount`, claim links.
- Meet commitments stay on `EventMeetActivation` (child of Event), not as ad-hoc Event booleans.
- Organizer trust / sanctions attach to Organizer, affecting **future** Meet activations and promotions.

## How Meet Commitment attaches later

`EventMeetActivation` already models host, zone, moment, solo welcome, recognition, interaction, responsible person, `commitmentAcceptedAt`, `termsVersion`, and `verificationStatus`.

Later flows (not built):

- Organizer fills Meet elements + signs commitment for that event.
- Optional review → `status: active`.
- Post-event fulfilment checks update `verificationStatus`.
- Repeated failures → organizer trust status (warning / suspended).

## Consciously NOT built

- `/business` dashboard, claim flows, auth
- Stripe, subscriptions, invoices
- Boost checkout, pay-per-footfall
- Digital signature UX, post-event surveys, reputation engine
- Consumer “activate Meet” controls
- URL rename of search param `meet` → preferred meet gender (breaking; revisit later)

## Re-evaluate later

- Persist mock data in Postgres/Neon.
- Rename URL `meet` to `meetGender` before a public API freeze.
- Split `socialSuitability` listing gate from quality score if product needs clearer semantics.
- Whether `PromotionPlacement` lives in its own table vs Edge Config / campaign service.
