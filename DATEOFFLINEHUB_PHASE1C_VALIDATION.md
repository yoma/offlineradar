# DateOfflineHub — Fase 1C validatie (laatste check vóór merge)

**Branch:** `cursor/extraction-quality-phase1-4bdb`  
**Datum:** 2026-10-20 (herhaald met Anthropic)  
**Modus:** geïsoleerd, read-only; geen productie-writes; geen merge; geen deployment.

---

## 1. Expliciet advies

### Fase 1C acceptatiecriteria: **GO (conditioneel)**

Live L1→L2→**L3 AI**→L4 op 5 echte pagina’s is uitgevoerd zonder DB-URL’s.

| Gate | Resultaat |
| --- | --- |
| Incorrect bevestigde velden | **0** |
| Noon-leaks (12:00 als bevestigd bij onbekend) | **0** |
| Inventie-risico’s | **2** (`SD-1.priceType`, `SD-2.priceType`) — harness-false-positives (zie §5) |
| Offline gates | OK |
| Regressies (corpus / deep-scan / admin-intake / structured / source-refresh) | allen **OK** |
| Isolatie (geen `DATABASE_URL` / `POSTGRES_URL`) | OK |

### Merge naar `main`: **GO**

Tegen de afgesproken 1C-exitcriteria (0 incorrect, 0 noon-leaks, acceptabele invent-risico’s, groene regressies) mag de featurebranch gemerged worden. **Deze agent merge/deployt niet.**

Resterende kwaliteitspunten (§8) zijn follow-ups, geen harde 1C-blokkers: publish-gates hielden onzekere HTD/SS-cases op `canPublish=false`, en onbekend bleef onbekend waar AI faalde.

---

## 2. Isolatiecontrole

| Check | Resultaat |
| --- | --- |
| `DATABASE_URL` / `POSTGRES_URL` | **unset** |
| Productieconfiguratie gewijzigd | Nee |
| Preview-deploy | Niet aangemaakt |
| Neon writes | Niet mogelijk (geen DB-URL; harness weigert bij set → exit 3) |

**Conclusie isolatie:** read-only HTTP+AI pad; geen testdatabase nodig.

---

## 3. Anthropic-credentials

| Item | Status |
| --- | --- |
| `ANTHROPIC_API_KEY` in process env | Aanwezig |
| Eerste run (raw env) | **Mislukt**: key bevatte een embedded newline + vreemde suffix (`https://supabase.com/: …`) → `Headers.append: … is an invalid header value` op alle 5 cases |
| Herhaal-run | Key tot **eerste regel** gesanitized (len 108, `sk-ant-…`); API smoke **HTTP 200** |
| Key gelogd/geprint | Nee (alleen len/prefix) |
| Model | `claude-haiku-4-5-20251001` |

**Ops-actie (buiten merge):** Cloud Agent secret `ANTHROPIC_API_KEY` opschonen tot één regel zonder extra payload. Production `.trim()` lost mid-string newlines niet op.

---

## 4. Live suite (gesanitizede key)

Artifacts: `/opt/cursor/artifacts/phase1c-live-validation.{json,md}`  
Run-log: `/opt/cursor/artifacts/phase1c-validate-run-sanitized.log`

| Metric | Waarde |
| --- | --- |
| Cases | 5 |
| HTTP fetches | 11 |
| Tokens in/out | 25033 / 8070 |
| Est. cost USD | ≈ $0.0654 |
| Incorrect | none |
| Noon leaks | none |
| Invent risk | SD-1.priceType, SD-2.priceType |

| ID | Org | JSON-LD | Date | Time | City | Price | Ticket | Tokens | Cost$ | Noon | canPublish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SD-1 | Speeddaten | false | n.i.v. | correct (19:30) | n.i.v. (URL-pad) | n.i.v. | unknown | 4172/1634 | 0.0123 | false | true |
| SD-2 | Speeddaten | false | n.i.v. | correct (19:30) | n.i.v. (URL-pad) | n.i.v. | unknown | 4090/1406 | 0.0111 | false | true |
| HTD-3 | HopToDate | false | n.i.v. (uncertain 2024-…) | unknown | n.i.v. | unknown | n.i.v. (oembed) | 4085/1649 | 0.0123 | false | false |
| HTD-4 | HopToDate | false | n.i.v. (uncertain 26-10) | unknown | n.i.v. | unknown | n.i.v. (oembed) | 4093/1600 | 0.0121 | false | false |
| SS-LISTING | Sportieve Singles | false | unknown | unknown | “correct” (hele paginatekst) | unknown | unknown | 8593/1781 | 0.0175 | false | false |

n.i.v. = not_independently_verifiable (harness: waarde niet verbatim in plain text/JSON-LD).

### Observaties per org

- **Speeddaten (geen JSON-LD):** AI vulde titel/tijd/leeftijd/prijs; `startTime` 19:30 bron-corroborated; geen noon-leak; soft gap ticket blijft unknown.
- **HopToDate:** geen starttijd → `startTimeUnknown` + cardWhen “startuur nog te bevestigen”; onzekere/incomplete datums → `canPublish=false` (veilig). Ticket-follow pakt foutieve oembed-URL (bekend soft issue).
- **Sportieve listing:** multi-event kalender, geen single-event extract; AI faalde netjes (`ongeldige sourceKindHint`); hard gaps → geen publish. L1 `city` = nagenoeg volledige paginatekst (L1-ruis).

---

## 5. Inventie-risico’s (acceptabel)

`priceType` wordt in de harness **afgeleid** van `priceNotes` (`qualified` bij `/vanaf|from|duo|pp/i`, anders `plain`), niet door het model als apart veld verzonden. Method erft van AI-`priceNotes`, waardoor de invent-filter ten onrechte triggert.

Dit is **geen** bewijs dat AI een ontbrekende prijs verzon. Prijs zelf bleef bron-gebonden of unknown; geen `incorrect`-verdict.

---

## 6. Regressies

| Check | Resultaat |
| --- | --- |
| `verify:extraction-corpus` | 23/23 OK |
| `verify:deep-scan` | OK (incl. price conflict → geen auto-publish) |
| `verify:admin-intake` | OK |
| `verify:intake-structured` | OK |
| `verify:source-refresh` | OK |
| Offline gates in `validate:extraction-phase1c` | OK |

Log: `/opt/cursor/artifacts/phase1c-regressions.log`

---

## 7. Acceptatiecriteria vs status

| Criterium | Status |
| --- | --- |
| Geen foutieve **bevestigde** datum/tijd/prijs in live AI-cases | **OK** (0 incorrect; HTD-datums uncertain + blocked) |
| Onbekend blijft onbekend | **OK** (SS AI-fail; HTD tijd; tickets waar afwezig) |
| Conflicten → review | OK (offline + unit) |
| AI verzint niets (kritieke velden) | **OK** (priceType-flags = harness FP) |
| Publicatiebeveiligingen intact | OK (regressies + live canPublish=false op zwakke cases) |
| Geen writes naar productie | OK |
| Geen automatische publicatie | OK |
| Geen prod-config wijzigingen | OK |

---

## 8. Resterende risico’s (follow-up, geen 1C-blokker)

1. **Secret hygiene:** Cloud Agent `ANTHROPIC_API_KEY` opschonen (newline + extra payload).
2. **L1 city uit URL-pad** (Speeddaten/HTD) en SS listing die hele body als city zet — pipeline-kwaliteit, niet 1C-exit.
3. **HTD detail:** jaar/partial dates soms wrong/uncertain; oembed als ticketUrl — publish blijft geblokkeerd.
4. **SD canPublish=true** met n.i.v. city/price: gate vertrouwt AI-filled hard gaps; admin field-evidence + menselijke review blijven nodig.
5. Admin UI field-evidence nog niet live in browser gespotcheckt (codepad aanwezig).
6. Tokenkosten ≈ Haiku list-price schatting.

---

## 9. Wat niet is gedaan (bewust)

- Geen merge naar `main`
- Geen Vercel deploy / promote
- Geen `DATABASE_URL` gezet, geen Neon writes
- Geen secret-waarden in logs/chat

---

## 10. Samenvatting voor ChatGPT

Fase 1C live AI-suite is **uitgevoerd** (na sanitize van corrupte multi-line Anthropic secret). Resultaat: **0 incorrect, 0 noon-leaks, ≈$0.07 tokens, regressies groen** → **GO voor merge** van `cursor/extraction-quality-phase1-4bdb`, met follow-ups in §8. Deze run heeft **niet** gemerged of gedeployed.
