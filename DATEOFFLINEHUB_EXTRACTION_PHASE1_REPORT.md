# DateOfflineHub — Fase 1 extractiekwaliteit: technisch verslag

**Branch:** `cursor/extraction-quality-phase1-4bdb`  
**Doel:** P0-bugs herstellen, gelaagde extractiepipeline, field evidence in admin, regressiecorpus.  
**Niet gedaan:** productie-deploy, auto-publish activeren, database-migraties, live externe scrapes.

---

## 1. Samenvatting

Fase 1 herstelt aantoonbare false negatives (HopToDate-prijs, Sportieve city-leak) en structureert de intake-pipeline als **L1 structured → L2 ticket-follow → L3 AI gaps → L4 evidence/verify**. Onbekende begintijden blijven expliciet `timeUnknown` / `startTimeUnknown`; de DB-noon-sentinel blijft bestaan zonder als bevestigd uur te worden getoond. Soft gaps (`price`, `startTime`, `ticket`) activeren gerichte follow-up zonder publicatiegates te verzwakken.

---

## 2. Stap 1 — Herstelde bugs

| Bug | Fix | Bewijs |
| --- | --- | --- |
| HopToDate `price: null` ondanks zichtbare € | `parsePrimaryPrice()` (komma/punt, h3 + tekst) | Fixture: 29.99 / 26.99 |
| Sportieve Kortrijk → La Roche | Title-first city; body stopt bij volgende titel/datum; city uit raw title vóór `/ City`-strip | Kortrijk + Gent correct |
| JSON-LD ná AI | `applyStructuredLayer` vóór AI in intake + rescan | Synthetic JSON-LD corpus |
| Prijs/tijd/ticket geen gap | `SOFT_GAPS` in `detectEssentialGaps` | `GAP-PRICE-ONLY` triggert deep |
| Stille 12:00 | `timeUnknown` + `UNKNOWN_START_TIME_NOTE` + `startTimeDisplayNote` / tag `time_unknown` | `DEFAULT-NOON` + save.ts |

---

## 3. Stap 2 — Pipeline

Nieuwe module: `lib/aanvoer/extraction-pipeline.ts`

1. **L1** `applyStructuredLayer` — JSON-LD + city heuristics (`enrichProposalFromPage`).
2. **L2** `applyTicketFollowLayer` — max 3 ticket/detail fetches via bestaande `safeFetchTipSource` (SSRF behouden); opnieuw L1 per pagina.
3. **L3** AI alleen op gaps; structured dump in de prompt; `mergeAiGapFill` overschrijft geen L1/L2 `found`.
4. **L4** `finalizeExtractionEvidence` — soft/hard gaps, conflicten, `startTimeUnknown`.

Deep verify: JSON-LD opnieuw op elke gefetchte HTML; soft-only scans prioriteren ticket-URLs.

---

## 4. Stap 3 — Zichtbare fouten / evidence

- `lib/aanvoer/field-evidence.ts`: per veld `value`, `sourceUrl`, `method`, `confidence`, `status`.
- Proposal: `fieldEvidence[]`, `startTimeUnknown`, `ticketUrl`.
- Admin (`aanvoer-client.tsx`): startuur-copy + inklapbaar **Extractiebewijs per veld**.

Geen nieuwe Neon-tabel (bewust; geen schemawijziging zonder motivatie). Evidence zit in het intake-proposal object voor diagnose.

---

## 5. Stap 4 — Regressietests

| Script | Resultaat |
| --- | --- |
| `npm run verify:extraction-corpus` | 23/23 OK (22 auditcases + wiring) |
| `npm run verify:source-refresh` | OK (incl. HTD-prijzen, Kortrijk/Gent) |
| `npm run verify:deep-scan` | OK (soft-gap prijs triggert) |
| `npm run verify:intake-structured` | OK (`timeUnknown`) |
| `npm run verify:phase19-sportieve` | OK |
| `npx tsc --noEmit` | OK |

`verify:admin-intake` faalt op bestaande nav-assert (`Aanvoer` vs Bronnen); niet door deze Fase 1.

---

## 6. Gewijzigde bestanden (kern)

**Nieuw**

- `lib/aanvoer/field-evidence.ts`
- `lib/aanvoer/extraction-pipeline.ts`
- `scripts/verify-extraction-corpus.ts`
- `DATEOFFLINEHUB_EXTRACTION_PHASE1_REPORT.md`

**Gewijzigd**

- `lib/source-refresh/parsers/hoptodate.ts`
- `lib/source-refresh/parsers/sportieve-singles.ts`
- `lib/aanvoer/json-ld-event.ts` (ticketUrl uit Offer)
- `lib/aanvoer/structured-enrich.ts`
- `lib/aanvoer/dates.ts`, `types.ts`, `deep-verify.ts`, `save.ts`
- `app/interne-aanvoer/actions.ts`, `aanvoer-client.tsx`
- `scripts/verify-source-refresh.ts`, `verify-deep-scan.ts`, `verify-intake-structured.ts`
- `package.json` (scripts)

---

## 7. Beveiliging & publicatie

- Publication gates / Route A/B / `manual_suppressed`: ongewijzigd in intent.
- Geen auto-publish-activatie; intake blijft draft tenzij bestaande gate + admin-flow.
- Geen DB-migratie.
- Extra fetches begrensd (`EXTRACTION_MAX_FOLLOW_FETCHES = 3`, deep max 8).
- SSRF via bestaande URL-validatie + `safeFetchTipSource`.

---

## 8. Niet live geverifieerd

- Live HopToDate / Sportieve / ticketplatform HTTP (bewust offline fixtures).
- Live Anthropic gap-fill op echte pagina’s.
- Productie Neon-intakes / cron kill-switch / Vercel logs (rechten).
- Browser-render / PDF / microdata (buiten Fase 1 scope).
- Persistente evidence-tabel in Neon (bewust uitgesteld).

---

## 9. Resterende risico’s voor ChatGPT-review

1. Soft gaps verhogen deep-scan frequentie → meer fetches/tokens; cap blijft, maar monitor kosten.
2. Ticket-follow host-filters: cross-host ticketlinks worden geprobeerd via SSRF-gate; mislukte follows blijven soft gap.
3. `startTimeUnknown` in UI hangt van proposal af; handmatige draft-edit van alleen `startTime` synchroniseert evidence niet opnieuw (admin kan tijd typen).
4. Conflictprijs → `uncertain` blokkeert niet hard publicatie; gates ongewijzigd.
5. Fixtures zijn snapshots; live HTML-wijzigingen bij organizers kunnen parsers opnieuw breken → corpus uitbreiden bij regressies.

---

## 10. Aanbevolen volgende stap (niet in deze PR)

Concrete restitems na Fase 1C GO: zie **`DATEOFFLINEHUB_PHASE1_FOLLOWUPS.md`** (FU-1 HopToDate oembed, FU-2 stadsherkenning, FU-3 admin-UI spotcheck, FU-4 Anthropic secret, FU-5 AI-only vs auto-publish).

Overig:
- Optionele live allowlist-suite achter env-flag.
- Microdata/OpenGraph als L1-uitbreiding.
- Evidence optioneel loggen in admin notes of aparte tabel na akkoord schema.
