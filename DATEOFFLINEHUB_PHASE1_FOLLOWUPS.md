# DateOfflineHub — Fase 1 resterende follow-ups

**Branch:** `cursor/extraction-quality-phase1-4bdb`  
**Update:** 2026-10-20 — FU-1 t/m FU-5 aangepakt in code (zie `DATEOFFLINEHUB_PHASE1_FU_FIXES_REPORT.md`).

---

## FU-1 — HopToDate oembed als ticket-URL — **DONE**

`isTechnicalEndpointUrl` filtert `/wp-json/`, `oembed`, feeds, graphql; ticket-follow prioriteert `/tickets/`. Regressie: `FU1-OEMBED` in corpus.

---

## FU-2 — Stadsherkenning — **DONE**

`inferKnownCityLabel` retourneert alleen canonieke labels; `isPlausibleCityCandidate` weert paths/page-dumps; structured-enrich herstelt/cleart slechte cities. Regressie: `FU2-CITY`.

---

## FU-3 — Admin-UI Extractiebewijs — **DONE** (static)

UI toont Waarde / Status / Methode / Betrouwbaarheid / Bron + Conflicten. Offline gates + admin-intake asserts groen. Optioneel: live browser-spotcheck met admin-sessie.

---

## FU-4 — Anthropic secret-configuratie — **CHECKED**

Shape/presence OK in huidige sessie; **geen rotatie**. Bij cold-start pollution: secret-definitie opschonen tot één regel (zelfde key).

---

## FU-5 — AI-only kritieke velden vs auto-publish — **DONE**

`evaluateIntakeApproval` forceert review bij AI/OCR-only datum, bevestigde begintijd, plaats, concrete prijs, singlesgeschiktheid. Admin-edit / onafhankelijke evidence / deepScan-corroboration laten publish toe. Tests 4c/4d.

---

## Prioriteit voor ChatGPT

| ID | Status | Blokkeert merge? |
| --- | --- | --- |
| FU-1 | Done | Nee |
| FU-2 | Done | Nee |
| FU-3 | Done (static); optionele live spotcheck | Nee |
| FU-4 | Checked; no rotate | Nee |
| FU-5 | Done | Nee |
