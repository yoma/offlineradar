# DateOfflineHub — Autopilot Phase 2B report

**Branch:** `cursor/autopilot-event-ingest-2b-4b09`  
**Base:** `main` (`38a295b` — Phase 2A merged)  
**Scope:** automatische event-ingest (draft/review only) + één-klik / bulk publicatie-UX  
**Merge/deploy:** niet uitgevoerd (wacht op expliciete vraag)

## Verdict

**GO voor review en merge naar `main`.**

Phase 2B levert: (1) hergebruik van Source Refresh + L1–L4 extractie naar draft/review bij `refresh_enabled` bronnen, achter een aparte kill switch die default OFF is; (2) één server-side gepubliceerde gate voor één-klik en bulk; (3) vereenvoudigde admin-UX (Klaar / Nakijken / Gepubliceerd) met inline correctie + hervalidatie. Geen automatische publicatie. Geen productiedatabase-writes tijdens tests. Kill switches blijven uit.

**Niet** productie-activeren tot `OFFLINERADAR_REFRESH_AUTO_DRAFT=1` (én bestaande `OFFLINERADAR_SCHEDULED_REFRESH`) bewust gezet worden na review.

## Wat gebouwd is

| Onderdeel | Pad / gedrag |
| --- | --- |
| Gated one-click publish | `lib/aanvoer/publish-edition.ts` → `publishEditionIfAllowed` |
| Gated bulk publish | zelfde module → `bulkPublishEditionsIfAllowed` (per-edition server re-check) |
| NL readiness copy | `lib/aanvoer/readiness-copy.ts` → Klaar / ontbrekende velden in gewoon Nederlands |
| Auto-draft kill switch | `lib/source-refresh/auto-draft-config.ts` → `OFFLINERADAR_REFRESH_AUTO_DRAFT` default OFF |
| Scheduler thorough-when-ON | `lib/source-refresh/scheduler.ts` → thorough → drafts, nooit publish |
| Inline field patch + re-gate | `lib/events/neon-store.ts` → `patchEditionAdminFields` (+ `manual_edit` stamp) |
| Cockpit buckets | `lib/aanvoer/cockpit-data.ts` → klaar / controle / published + readinessSummary |
| Aanvoer actions | `app/interne-aanvoer/actions.ts` → publish / bulk / patch |
| Events actions | `app/interne-events/actions.ts` → zelfde publish-helper |
| Admin UX | `components/admin/aanvoer-cockpit.tsx` — Publiceren, bulk, inline edit, thorough scan |
| Goedkeuren inbox | `components/admin/goedkeuren-inbox.tsx` — gated publish pad |
| Offline verify | `scripts/verify-phase2b-publish.ts` (12 checks) |
| Live dry-run (read-only) | `scripts/dry-run-phase2b-ingest.ts` |

## Hergebruikte modules (geen dubbele stack)

- Source Refresh-engine + dedicated parsers (Speeddaten, HopToDate, Sportieve Singles, …)
- Fase 1 extractiepipeline L1 → L2 → L3 → L4 + field evidence
- `evaluateEventForPublication` / `classifyAdminStatus` / Route A/B / `manual_suppressed`
- Bestaande cron `/api/cron/source-refresh` + Neon `catalog_sources` / editions
- Bestaande schermen `/interne-aanvoer`, `/interne-events`, `/interne-goedkeuren`

Geen nieuw platform, geen extra DB, geen externe automation-dienst.

## Invarianten (afgedwongen)

1. **Geen auto-publish** in 2B — publicatie blijft expliciete adminactie.
2. Kill switch `OFFLINERADAR_REFRESH_AUTO_DRAFT` default OFF; zonder `=1` blijft scheduled refresh niet-thorough (geen auto-drafts).
3. Scheduled work blijft ook afhankelijk van bestaande `OFFLINERADAR_SCHEDULED_REFRESH`.
4. Publicatie loopt altijd via `publishEditionIfAllowed` (FU-5 / Phase 1 gates behouden).
5. Ontbrekende optionele prijs → “Prijs niet bekend” / soft note; nooit €0 of “gratis”.
6. Onbekende begintijd → niet als bevestigde 12:00 in readiness-copy.
7. AI/OCR-only kritieke velden, conflicten, missing place → Nakijken.
8. `manual_suppressed` / rejected / cancelled / expired → geen herpublicatie.
9. Handmatige correcties blijven herkenbaar (`manual_edit` in bronbewijs) en triggeren hervalidatie zonder volle rescan.
10. Dry-run schrijft niet (`wrote: false`).

## Admin UX (KISS)

Drie categorieën in het bestaande aanvoer-overzicht:

- **Klaar voor publicatie** — verplichte checks OK → knop **Publiceren** (één klik)
- **Nakijken** — ontbrekende/conflicterende velden; inline correctie mogelijk
- **Gepubliceerd** — online

Bulk: meerdere klaar-items samen publiceren met één bevestiging; server weigert niet-klare items met duidelijke reden.

## Tests uitgevoerd

| Test | Resultaat |
| --- | --- |
| `npx tsc --noEmit` | OK |
| `npm run verify:phase2b-publish` | 12/12 OK |
| `npm run verify:admin-intake` | OK (gates, AI-only, suppress, OCR) |
| `npm run dry-run:phase2b-ingest` | OK, `wrote: false`, ~4.3s |
| `npm run build` | OK (Next.js 16.3.6) |

### Live dry-run (read-only HTTP + parsers, geen DB-writes)

Kill switches waargenomen: `scheduledRefresh=false`, `autoDraft=false`.

| Pilot | Ontdekt | Met datum | Met prijs | Ontbrekende prijs | Ontbrekende tijd |
| --- | --- | --- | --- | --- | --- |
| SmartVibes / Speeddaten.be | 224 | 224 | 224 | 0 | 0 |
| HopToDate | 81 | 81 | 81 | 0 | 0 |
| Sportieve Singles | 16 | 16 | 0 | 16 | 1 |
| **Totaal** | **321** | **321** | **305** | **16** | **1** |

Sportieve Singles toont correct optionele prijs als ontbrekend (niet als gratis) — past bij “Nakijken” soft-notes wanneer verder klaar.

## Wat nog niet live geverifieerd is

- End-to-end cron met `OFFLINERADAR_REFRESH_AUTO_DRAFT=1` op productie (bewust niet geactiveerd).
- Echte draft-inserts / dedupe tegen productiedatabase (geen prod writes in deze fase).
- UI-klikpad in browser op staging/prod (build + static verify wel groen; handmatige browser-sessie niet gedraaid in deze run).
- Latere fase: automatische publicatie van voldoende geverifieerde events (architectuur voorbereid via gedeelde gate; feature blijft uit).

## Resterende risico’s

1. **Thorough auto-draft volume** — bij enable kunnen pilots honderden kandidaten opleveren; caps (`REFRESH_AUTO_DRAFT_MAX_PER_SOURCE`) + bestaande refresh-batchgrenzen beperken, maar admin moet eerste enable monitoren.
2. **Prijsloze parsers** (bv. Sportieve Singles) — veel “klaar met soft note” of nakijken afhankelijk van of prijs verplicht blijft in gate; huidige gate behandelt prijs als optioneel soft.
3. **Dedupe tegen bestaande editions** — dry-run telt parser-hits, niet “nieuw vs bekend in Neon”; dat pad bestaat in refresh/import maar is niet tegen prod gemeten.
4. **Dubbele admin-entrypoints** (`/interne-aanvoer` vs `/interne-goedkeuren`) — beide gebruiken nu dezelfde publish-helper; verdere consolidatie kan later zonder functionaliteitsverlies.

## GO / NO-GO

| Vraag | Antwoord |
| --- | --- |
| Merge naar `main`? | **GO** (na review) |
| Deploy? | Alleen via normale pipeline na merge; geen speciale enable nodig voor code |
| Kill switch aanzetten? | **NO-GO** tot expliciete activatiebeslissing |
| Auto-publish? | **NO-GO** (buiten scope 2B) |

## Activatie (later, handmatig)

```bash
# Pas na review + monitoring plan:
# 1) OFFLINERADAR_SCHEDULED_REFRESH=1 (bestaand)
# 2) OFFLINERADAR_REFRESH_AUTO_DRAFT=1  → thorough → drafts only
# Publicatie blijft admin één-klik / bulk.
```

## Gewijzigde / nieuwe bestanden

**Nieuw**

- `lib/aanvoer/publish-edition.ts`
- `lib/aanvoer/readiness-copy.ts`
- `lib/source-refresh/auto-draft-config.ts`
- `scripts/verify-phase2b-publish.ts`
- `scripts/dry-run-phase2b-ingest.ts`
- `DATEOFFLINEHUB_AUTOPILOT_PHASE2B_REPORT.md`

**Gewijzigd**

- `app/interne-aanvoer/actions.ts`
- `app/interne-events/actions.ts`
- `components/admin/aanvoer-cockpit.tsx`
- `components/admin/goedkeuren-inbox.tsx`
- `lib/aanvoer/cockpit-data.ts`
- `lib/events/neon-store.ts`
- `lib/source-refresh/scheduler.ts`
- `package.json`
