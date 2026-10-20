# DateOfflineHub — Fase 1B validatie vóór productie

**Branch:** `cursor/extraction-quality-phase1-4bdb`  
**Datum:** 2026-10-20  
**Modus:** geïsoleerde read-only validatie; geen productie-writes; geen deployment.

---

## 1. Advies

**Voorwaardelijk klaar voor merge naar main, nog niet voor Autopilot-productie zonder follow-up.**

Merge van Fase 1 + 1B-correcties is **aanbevolen** (P0-bugs opgelost, gates versterkt, regressies groen, live parsers bewezen op actuele listings).

**Niet** meteen Autopilot auto-publish opschalen tot:

1. Live intake L1/L2+AI op detailpagina’s zonder JSON-LD is geverifieerd met Anthropic-key in een preview-omgeving.
2. Soft-gap ticket-follow + deep-scan kosten zijn gemeten met echte tokens.
3. Beheerders de nieuwe conflict-/noon-gedragingen kort hebben gespot-checkt in admin UI.

---

## 2. Code review — regressie / security / neveneffecten

| Bevinding | Ernst | Actie in 1B |
| --- | --- | --- |
| Prijsconflicten blokkeerden `canPublish` niet | Hoog | `evaluateIntakeApproval` + deep `mergeField` prijs/tijd → reviewReasons |
| Rescan/paste schreef `starts_at` met stille `12:00` zonder display-note | Hoog | `buildIntakeStartsAt` + `start_time_display_note` / `time_unknown` |
| Consumer mapte noon-sentinel als `startTime` ondanks display-note | Mid | `mapEditionToConsumerEvent` zet `startTime=null` bij note |
| Tip-fetch stripte trailing `/` → HopToDate redirect-loop | Hoog (live) | Slash-preserving hop-validatie; redirects 8; max body 1.5MB |
| Soft gaps verhogen deep-scan frequentie | Mid | Bestaande caps behouden; monitoren |
| Ontbrekende prijs blokkeert publicatie nog steeds niet | Laag (bewust soft) | Ongewijzigd; alleen **conflicten** hard review |
| SSRF | — | Intact via `validateAndNormalizeTipUrl` per hop |
| `manual_suppressed` / draft save / Route A/B gates | — | Intact (asserts + codepad) |

---

## 3. Live extractie (15–20 actuele events)

**Methode:** respectvolle GETs via `safeFetchTipSource` (≥1.2s pauze), geen DB-writes.  
**AI:** uit (geen `ANTHROPIC_API_KEY` in deze VM) → intake L3 niet live gemeten.

**Resultaat:** 20 cases, **0 incorrecte** parser-velden t.o.v. zichtbare HTML-gold, **0 noon-leaks**.

### 3.1 Parser-listings (16 events)

| Org | n | Datum | Tijd | Stad | Prijs | Ticket | Opmerking |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Speeddaten | 4 | correct | correct 19:30 | correct | correct €25–30 | correct | Live kalender |
| HopToDate | 3 | correct | correct 19:30 | correct | correct €29.99 / €26 | correct | Na redirect-fix |
| Sportieve Singles | 3 | correct | correct | correct* | unknown (geen € op listing) | shared calendar | *Berchem→Antwerpen district OK voor map |
| Tomeeto | 3 | correct | NIV (conventie) | correct | unknown (listing) | product URL | Verwacht |
| Juntas | 3 | correct | NIV (conventie) | deels NIV | correct vanaf-€ | correct | Verwacht |

\*NIV = not independently verifiable (conventioneel uur / prijssoort niet expliciet geclassificeerd).

### 3.2 Intake L1/L2 op Speeddaten-detail (4 URLs)

Detailpagina’s **zonder JSON-LD**. Zonder AI blijven title/date/price **unknown** na L1/L2 — verwacht. Soft gaps zouden in productie deep-scan + AI triggeren (niet live hier). **Geen** 12:00-lek in cardWhen.

### 3.3 Metrics

| Metric | Waarde |
| --- | --- |
| Cases | 20 |
| Extra HTTP fetches | 20 (1 per listing/detail in deze run; follow-laag niet nodig op listings) |
| Wall time | ~22s (+ delays) |
| Anthropic tokens in/out | **n.v.t.** (geen API-key in omgeving) |
| Noon als bevestigd uur | **0** |

Artifacts: `/opt/cursor/artifacts/phase1b-live-validation.md` + `.json`.

---

## 4. Publicatie / 12:00 / conflicten

| Check | Resultaat |
| --- | --- |
| Onbekende tijd → `formatCardWhen` | `startuur nog te bevestigen` (geen 12:00) |
| Consumer mapping met display-note | `startTime=null` |
| Prijsconflict in notes/deepScan | `canPublish=false` (nieuwe test #12) |
| Datumconflict | bleef blokkeren |
| Save intake | blijft `publicationStatus: "draft"` tot gate |
| Auto-publish path | conflict → reviewReasons → geen auto approve |

---

## 5. Regressies / build

| Check | Resultaat |
| --- | --- |
| `verify:extraction-corpus` | 23/23 |
| `verify:source-refresh` | OK |
| `verify:deep-scan` | OK (+ conflict gate) |
| `verify:intake-structured` | OK |
| `verify:admin-intake` | OK (verouderde UI-asserts bijgewerkt) |
| `tsc --noEmit` | OK |
| `npm run build` | OK |

---

## 6. Gerichte correcties in 1B (op featurebranch)

1. Approval: prijs-/extractieconflicten → geen auto-publish.  
2. Deep merge: prijs- en starttijdconflicten → `uncertain` + conflicts[].  
3. Rescan/paste UPDATE: `timeUnknown` + `start_time_display_note`.  
4. Consumer: geen noon-klok bij display-note.  
5. Tip-fetch: trailing-slash behouden, 8 redirects, 1.5MB.  
6. `verify:admin-intake`: Bronnen/Toevoegen; verwijderd “Nu controleren” / oude bron-zoekcopy.

---

## 7. Wat niet live geverifieerd kon worden

- Anthropic tokenverbruik en L3 gap-fill op echte detailpagina’s.  
- Admin UI handmatige klikpath (auth niet in deze VM).  
- Productie Neon-data / cron kill-switch / Vercel runtime logs.  
- Ticket-follow op bot-geblokkeerde ticketplatforms.  
- Volledige website E2E buiten extractie/build (public feed ongewijzigd in intent).

---

## 8. Resterende risico’s

1. Intake op plain HTML zonder JSON-LD blijft AI-afhankelijk voor complete kaarten.  
2. Ontbrekende prijs kan nog auto-publishen als overige gates groen zijn (soft by design).  
3. Grotere tip-fetches (1.5MB) verhogen geheugen/CPU op Vercel functions licht.  
4. Sportieve city-heuristiek: districtnamen (Berchem) mappen naar gemeente (Antwerpen) — acceptabel voor geo, niet letterlijk.

---

## 9. Aanbevolen volgende stap

1. Merge draft PR na menselijke review van dit rapport.  
2. Preview-deploy met Anthropic-key: herhaal intake op 5 Speeddaten/HopToDate detail-URLs; noteer tokens + follow-fetches.  
3. Pas daarna eventueel Autopilot drempels op field confidence.
