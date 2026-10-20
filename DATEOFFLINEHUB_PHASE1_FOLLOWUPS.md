# DateOfflineHub — Fase 1 resterende follow-ups

**Branch:** `cursor/extraction-quality-phase1-4bdb`  
**Context:** Fase 1C conditioneel GO; deze items blokkeren de Fase 1-merge niet, maar moeten na merge worden opgepakt.  
**Geen merge/deploy door agent.**

---

## FU-1 — HopToDate oembed als ticket-URL

**Probleem:** L2 ticket-follow kan een WordPress oembed-endpoint pakken i.p.v. de echte ticketpagina, bv.  
`https://hoptodate.com/fr-be/wp-json/oembed/1.0/embed?url=…`

**Impact:** Verkeerde `ticketUrl` in intake; publish blijft vaak geblokkeerd door andere hard gaps, maar evidence/admin ziet ruis.

**Voorstel:** In `applyTicketFollowLayer` / link-harvest: blokkeer `/wp-json/`, `oembed`, en vergelijkbare API-endpoints; prefer paths onder `/tickets/` of expliciete ticket-hosts.

**Bron:** Fase 1C live cases HTD-3 / HTD-4.

---

## FU-2 — Stadsherkenning (URL-pad / listing-body)

**Probleem:**
1. L1 city-heuristiek kan URL-padsegmenten als city zetten (Speeddaten/HTD detail), bv. `/nl/21 10 antwerpen …`.
2. Sportieve Singles listing kan nagenoeg de volledige paginatekst in `city` zetten.

**Impact:** Slechte place-kwaliteit; discoverability-gate kan ofwel te streng (pad-ruis) of te slap (lange string die toevallig een stad bevat) zijn.

**Voorstel:** City alleen uit JSON-LD `location`, parser-kandidaten, of korte title/suffix-heuristieken; max lengte + denylist voor path-achtige waarden; listing-pages niet als single-event city behandelen.

**Bron:** Fase 1C live cases SD-1/2, HTD-3/4, SS-LISTING.

---

## FU-3 — Admin-UI live spotcheck (Extractiebewijs)

**Probleem:** Codepad voor inklapbaar **Extractiebewijs per veld** staat in `aanvoer-client.tsx`, maar er is geen live browser-check met echte proposal-data + admin-sessie in Fase 1C.

**Impact:** Risico op UX-regressie (lege sectie, formatting) die unit/static checks missen.

**Voorstel:** Handmatige of Playwright-spotcheck op `/interne-aanvoer` met één URL-intake (Speeddaten of fixture): sectie zichtbaar, method/confidence/bron-URL per veld, conflicts zichtbaar bij prijsconflict.

---

## FU-4 — Anthropic secret-configuratie (Cloud Agent)

**Probleem:** Cloud Agent `ANTHROPIC_API_KEY` bevatte een embedded newline + extra payload (`https://supabase.com/: …`). Raw env → `Headers.append: … is an invalid header value`; L3 faalde op alle cases. Sanitize tot eerste regel herstelde API (HTTP 200).

**Impact:** Live AI-validatie en productie-intake falen stil als de secret opnieuw vervuild raakt. `.trim()` lost mid-string newlines niet op.

**Voorstel:** Secret in Cursor Cloud Agent env herschrijven tot één schone `sk-ant-…` regel; optioneel runtime reject als key `\n` of niet-`sk-ant-` prefix bevat (zonder key te loggen).

---

## FU-5 — AI-only kritieke velden vs auto-publish

**Probleem:** `evaluateIntakeApproval` blokkeert price/date-conflicten, `aiFailed`, ontbrekende plaats/datum/URL, en non-Route A/B — maar **niet** expliciet “kritiek veld alleen via `method=ai` / confidence=low”. Fase 1C: SD-cases konden `canPublish=true` met AI-gevulde prijs/datum (n.i.v. verbatim).

**Impact:** Goed gevormde Route A-events met AI gap-fill kunnen nog auto-publiceren zonder menselijke klik. Field-evidence is zichtbaar, maar geen harde gate.

**Voorstel (Fase 1.1):** Als `startDate` / `priceNotes` / `city` alleen `method=ai` (of confidence=low) hebben en geen L1/L2 corroboration → forceer `reviewReasons` (“AI-extractie: handmatig bevestigen”) zodat `canPublish=false` tot admin bevestigt.

**Niet gedaan in Fase 1:** bewust geen gedragswijziging van bestaande auto-publish-pad buiten conflict/noon/evidence; dit is de concrete rest-gap t.o.v. “onvoldoende onafhankelijk geverifieerde AI-data niet zonder menselijke controle”.

---

## Prioriteit (voor ChatGPT / product)

| ID | Prioriteit | Blokkeert Fase 1-merge? |
| --- | --- | --- |
| FU-4 | P0 ops (secret hygiene) | Nee (runtime env) |
| FU-5 | P1 productveiligheid | Nee (gedocumenteerde rest-gap; bestaande conflict-gates OK) |
| FU-2 | P1 data quality | Nee |
| FU-1 | P2 ticket quality | Nee |
| FU-3 | P2 verificatie | Nee |
