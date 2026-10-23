# DateOfflineHub — Fase 2A kwaliteitsvalidatie (PR #44)

**Branch:** `cursor/autopilot-organizer-discovery-4b09`  
**Datum:** 2026-10-23 (Europe/Brussels)  
**Modus:** dry-run only · kill switch OFF · geen merge/deploy · geen productie-writes

## Verdict

### GO (voorwaardelijk) voor PR #44

De discovery-sweep vindt in een beperkte live dry-run relevante Belgische singles-organisatoren, filtert ticket/social/aggregator correct, herkent bekende bronnen (host-dedupe), blijft binnen Vercel 60s, en bereidt uitsluitend `promising` + `refresh_enabled=false` + `discovered_by=agent` voor.

**Voorwaarden vóór activatie (niet onderdeel van deze PR-merge):**
1. Kill switch `OFFLINERADAR_DISCOVERY_SWEEP` pas op `1` na menselijke enable-beslissing.
2. Eerste productie-run read-only/admin review van Autopilot-filter in Bronnen.
3. Neon-dedupe in productie nog eens spot-checken (deze validatie gebruikte pilot-host lookup omdat DB-URL hier niet beschikbaar was).

## Checklist

| # | Check | Resultaat |
| --- | --- | --- |
| 1 | Query-matrix varieert over dagen (regio/taal/format) | **OK** — 24 non-Wallonie queries; bij 6/dag volledige cycle in **4 dagen**; 90d coverage 100%. Talen NL/FR/EN allemaal aanwezig. Vroege dagen zwaarder op nationaal/travel (priority), daarna steden. |
| 2 | Beperkte live dry-run | **OK** — 4 queries, Anthropic web_search, ~30s, `wrote=false` |
| 3 | Gevonden organisatoren + relevantie | Zie tabel hieronder |
| 4 | Bestaande / dubbele URLs | **OK** na fix — origin-canonicalisatie + host-lookup; Will You Date Me / Sportieve Singles / singles.be als existing geskipt (`skippedExisting=3` in final run) |
| 5 | Ticket / social / aggregator niet als org | **OK** na fix — `allevents` typo hersteld; HopToDate/Speeddaten als ticket; rejects `ticket_not_primary_org` / `aggregator_low_priority` |
| 6 | Alleen `promising` + `refresh_enabled=false` | **OK** (prepare-invariant; geen writes uitgevoerd) |
| 7 | Metrics | searchHits≈9–10 · evaluated≈7 · accepted≈3 · filtered/false≈1+ · ~30s · Anthropic max_uses≤4 (lage Haiku-kost; geen exacte $-meter in sweep) |
| 8 | Vercel runtime | **OK** — observed ~30s vs `maxDuration=60` (~50% headroom bij 4 queries; cron default 6 queries blijft plausibel binnen budget) |
| 9 | Regressie + build | **OK** — `verify:discovery-sweep` 16/16 · `tsc --noEmit` · `npm run build` (cron route aanwezig) |

## Live dry-run — organisatoren (final)

Queries: `singles party Gent` · `singles dinner Brussels` · `singles diner Gent` · `singles wandeling België`

| Organizer | Officiële site | Relevantie | Actie in dry-run |
| --- | --- | --- | --- |
| singles.be | https://singles.be | Route A + `.be` singles hub | bestaande → skip |
| Will You Date Me | https://willyoudateme.be | Route A singles outdoor/diner BE | bestaande → skip |
| Active Cupids | https://www.activecupids.be | Route A “Singles in Gent” + `.be` | zou `promising` agent-bron worden |

Rejects o.a.: ticket×3, aggregator×2, existing user-supplied×1. Geen illegal accepts (social/aggregator/ticket als organizer).

Metrics final run: searchHits=10 · evaluated=5 · accepted=3 · skippedExisting=3 · insertsWouldBe=1 · **18.7s** · within 60s budget.

## 6 queries/dag voldoende?

**Ja voor matrix-coverage:** 24 queries ÷ 6 = **4 dagen** voor een volle non-Wallonie ronde; Wallonie blijft gegated.

**Nuance:** priority-sort maakt dag 1–2 vooral nationaal/travel. Dat is acceptabel voor Phase 2A; eventuele latere diversiteits-rotatie (round-robin per regio) is nice-to-have, geen blocker.

## Gerichte correcties tijdens validatie

1. **Organizer origin canonicalisatie** — deep links → site-origin; host-dedupe tegen bestaande `/kalender`-URLs.  
2. **Ticket niet als nieuwe org** — Phase 2A slaat alleen `organizer` op.  
3. **Aggregator typo** — `alleevents` → `allevents`; HopToDate/Speeddaten als ticket/discovery.  
4. **BE-geo verplicht** — geen `.nl`-only sites zonder BE-signaal (voorkomt NL false positives).

## NO-GO triggers (niet van toepassing)

- Auto-publish of kill switch aan → niet gebeurd  
- Runtime structureel >60s → niet gezien  
- Matrix dekt regio’s niet binnen ~1 week → niet het geval  

## Commando’s

```bash
npm run verify:discovery-sweep
npx tsx scripts/validate-discovery-phase2a.ts   # dry-run + rotation report
npm run build
```

Artifacts: `/opt/cursor/artifacts/phase2a-live-validation.json`, `phase2a-validation-final.log`, `phase2a-build.log`.
