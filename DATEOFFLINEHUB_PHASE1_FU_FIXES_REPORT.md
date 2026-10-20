# DateOfflineHub — Fase 1 follow-up correcties (vóór merge)

**Branch:** `cursor/extraction-quality-phase1-4bdb`  
**Datum:** 2026-10-20  
**Modus:** alleen featurebranch; **geen merge, geen deploy, geen auto-publish activeren**.

---

## Expliciet advies: **GO voor merge**

Alle prioriteiten 1–4 zijn doorgevoerd of gecontroleerd. Regressies, `tsc` en production build zijn groen. Geen productiegegevens gewijzigd.

---

## Gewijzigde bestanden

| Bestand | Wijziging |
| --- | --- |
| `lib/aanvoer/approval.ts` | FU-5: AI/OCR-only kritieke velden → `reviewReasons`; admin-edit / onafhankelijke methodes / deepScan-corroboration laten publish toe |
| `lib/aanvoer/field-evidence.ts` | singlesOnly / singlesOriented in evidence-collectie |
| `lib/aanvoer/extraction-pipeline.ts` | FU-1: `isTechnicalEndpointUrl`, oembed/wp-json filter, ticket-URL prioriteit |
| `lib/aanvoer/structured-enrich.ts` | FU-2: ongeldige city-kandidaten droppen/herstellen; oembed ticket uit JSON-LD geweerd |
| `lib/geo-cities.ts` | `inferKnownCityLabel` geeft nooit raw path/page-dump terug; `isPlausibleCityCandidate` |
| `app/interne-aanvoer/aanvoer-client.tsx` | FU-3: Extractiebewijs met Waarde/Bron/Methode/Betrouwbaarheid + Conflicten; fieldEvidence mee naar gate/approve |
| `app/interne-aanvoer/actions.ts` | fieldEvidence / startTimeUnknown / deepScan in `approveIntakeAction` |
| `scripts/verify-admin-intake.ts` | Tests 4c/4d + UI-label asserts |
| `scripts/verify-extraction-corpus.ts` | FU1-OEMBED + FU2-CITY regressies |
| `scripts/validate-extraction-phase1c.ts` | Offline gate checkt UI-labels |
| `DATEOFFLINEHUB_PHASE1_FOLLOWUPS.md` | Status bijgewerkt |
| `DATEOFFLINEHUB_PHASE1_FU_FIXES_REPORT.md` | Dit verslag |

---

## Prioriteit 1 — FU-5 Publicatieveiligheid

- `evaluateIntakeApproval` blokkeert auto-publish wanneer **datum**, **bevestigde begintijd**, **plaats**, **concrete prijs** of **singlesgeschiktheid** alleen via `method=ai|ocr` in field-evidence staan.
- Onbekende optionele velden blijven unknown (geen inventie).
- Admin die de draft-waarde wijzigt t.o.v. evidence, of onafhankelijke methodes (`json_ld` / `html` / `parser` / `ticket_page` / `corroboration` / `user`), of deepScan `fieldsConfirmed`, kan wél `canPublish=true` krijgen.
- Opslaan als draft bij reviewReasons blijft mogelijk (“Bewaar — jouw aandacht nodig”); latere handmatige publicatie via bestaande admin-paden blijft intact.
- Route A/B en `manual_suppressed` ongewijzigd gerespecteerd (bestaande tests groen).

---

## Prioriteit 2 — FU-1 / FU-2 Datakwaliteit

- Technische endpoints (`/wp-json/`, `oembed`, graphql, feeds, …) worden niet als ticket-URL gevolgd of opgeslagen; `/tickets/` krijgt prioriteit.
- City-inferentie retourneert alleen canonieke labels; URL-paden en paginateksten worden niet als stad bewaard.

---

## Prioriteit 3 — FU-3 Admin UI

Extractiebewijs toont per veld: **Waarde**, **Status**, **Methode**, **Betrouwbaarheid**, **Bron**, plus een **Conflicten**-blok wanneer aanwezig. Statisch gecontroleerd in offline gates + `verify:admin-intake`.

---

## Prioriteit 4 — FU-4 Anthropic-configuratie

Presence/shape-check (geen secret gelogd, **geen rotatie**):

```
ANTHROPIC_PRESENT=yes
ANTHROPIC_SINGLE_LINE=yes
ANTHROPIC_EXTRA_PAYLOAD=no
ANTHROPIC_SHAPE_OK=yes
ACTION=ok_no_rotate
```

Huidige process-env is geldig. Geen key geroteerd of vervangen. Als een nieuwe Cloud Agent-sessie opnieuw multi-line pollution toont, alleen de secret-definitie opschonen tot één `sk-ant-…`-regel (zelfde key, geen rotatie).

---

## Eindcontrole — testresultaten

| Check | Resultaat |
| --- | --- |
| `verify:extraction-corpus` | 25/25 OK (incl. FU1-OEMBED, FU2-CITY) |
| `verify:admin-intake` | OK (incl. 4c AI-only block, 4d human/independent publish) |
| `verify:deep-scan` | OK |
| `verify:intake-structured` | OK |
| `verify:source-refresh` | OK |
| `validate:extraction-phase1c --offline-gates` | OK |
| `tsc --noEmit` | OK |
| `npm run build` | OK |
| Productiegegevens / Neon writes | Geen (DB-URL unset tijdens checks) |

---

## Bevestigingen

| Eis | Status |
| --- | --- |
| Bestaande functionaliteit behouden | OK |
| Route A/B + manual_suppressed | OK |
| AI-only kritieke gegevens niet zelfstandig gepubliceerd | OK (FU-5) |
| Geen regressies in suite | OK |
| Geen productiegegevens gewijzigd | OK |
| Geen merge / deploy / nieuwe auto-publish | OK |

---

## Resterend (niet-blokkerend)

- Live browser-spotcheck van Extractiebewijs met echte admin-sessie (FU-3 codepad + static asserts zijn gedaan; optionele handmatige click-through blijft nuttig).
- Cloud Agent secret-store dubbelchecken bij cold start als L3 opnieuw header-errors toont.
