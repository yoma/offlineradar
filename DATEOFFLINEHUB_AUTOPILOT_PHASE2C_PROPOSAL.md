# DateOfflineHub — Autopilot Phase 2C (uitbreiding)

**Branch:** `cursor/autopilot-phase2c-expansion-4b09`  
**Doel:** van Sportieve-testcase → gevarieerde autonome eventaanvoer + gecontroleerde organizer-discovery  
**Merge/deploy/env-wijziging:** wacht op expliciete GO

## 1. Eerste Sportieve cron

| Check | Resultaat |
| --- | --- |
| Geplande run | **nog niet uitgevoerd** |
| Laatste Sportieve run | manueel 23 okt 2026 ~12:22 Europe/Brussels (15 drafts) |
| Eerstvolgende cron | **24 okt 2026 06:00 Europe/Brussels** |
| Actie | geen geforceerde scan |

Na die run: controleer `source_refresh_runs` (`trigger_type=scheduled`, `drafted_count`, status) + published blijft 194 tenzij jij publiceert.

## 2. Bruikbaarheid van de 87 `refresh_enabled` bronnen

| Bucket | # | Auto-draft concepten? |
| --- | --- | --- |
| Dedicated parser-pilots | **5** | **ja** (thorough + allowlist) |
| Organizer-sites (generic) | ~43 | nee — alleen review-items, geen drafts |
| Aggregators/tickets | ~21 | nee — discovery/signal |
| Social (IG/FB/Meetup) | ~7 | nee — signal only |
| Overig | ~11 | nee |

**Conclusie:** veilige autonome eventverwerking = uitbreiden via de **5 dedicated parsers**, niet via alle 87. De rest blijft discovery/handmatig tot er een stabiele parser is.

## 3. Wave 2 — volgende 4 organisatoren (3–5 incl. Sportieve)

| # | Organisator | ID | Format | Live listing | Cap/run | Verwacht nieuw/run* |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Sportieve Singles | `975fc9d7-…af62b869` | wandelingen | 16 | 10 | 0–5 (meeste al als concept) |
| 2 | SmartVibes / Speeddaten.be | `de8d83b1-…378b2f764` | speeddates | 224 | 10 | 0–10 (veel al published → dedupe) |
| 3 | Tomeeto singles hub | `18ac22ba-…6068bc372` | weekends / activiteiten | 15 | 10 | 0–8 |
| 4 | Juntas exclusief singles | `b6af624e-…24152f9ae9` | singlereizen | 26 | 10 | 0–8 |

\*Na URL/catalog-dedupe; harde limiet altijd ≤10.

**Niet in wave 2:** HopToDate (zelfde SmartVibes-netwerk als Speeddaten → dubbel risico).  
**Nog geen dedicated parser (later):** Party4singles, Will You Date Me, Lucky Lemon, How to be Single — wel al in catalogus; discovery kan meer party/diner-orgs aandragen.

## 4. Exacte Production-env (wave 2) — nog niet toepassen

Vervang de huidige Sportieve-only allowlists door:

```
OFFLINERADAR_SCHEDULED_REFRESH=1
OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS=975fc9d7-2639-4e03-9139-a588af62b869,de8d83b1-217b-4004-9a83-9c6378b2f764,18ac22ba-a921-4317-bbd0-06a6068bc372,b6af624e-337d-41e3-8f4f-524a152f9ae9
OFFLINERADAR_REFRESH_AUTO_DRAFT=1
OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS=975fc9d7-2639-4e03-9139-a588af62b869,de8d83b1-217b-4004-9a83-9c6378b2f764,18ac22ba-a921-4317-bbd0-06a6068bc372,b6af624e-337d-41e3-8f4f-524a152f9ae9
OFFLINERADAR_REFRESH_AUTO_DRAFT_MAX_PER_SOURCE=10
```

`OFFLINERADAR_DISCOVERY_SWEEP` blijft uit in wave 2.  
Daarna Production redeploy. Geen geforceerde cron.

Batchgrootte blijft 3 bronnen/dag → 4 bronnen roteren over ~2 cron-cycles.

## 5. Wave 3 — organizer-discovery (gecontroleerd)

Bestaande Phase 2A is al veilig:

- Inserts: `status=promising`, `refresh_enabled=false`, `discovered_by=agent`
- Geen auto-approve, geen auto-follow, geen event-drafts
- Caps: ≤6 queries, ≤12 candidates, ≤5 inserts/run
- Wallonië default OFF

**Activatie (apart GO, na stabiele wave 2):**

```
OFFLINERADAR_DISCOVERY_SWEEP=1
```

Cron: `30 5 * * *` UTC (= 07:30 Europe/Brussels).  
Admin: Bronnen → filter Autopilot (agent) → jij enable follow per bron.

AI-kosten: Bing/DDG eerst; Anthropic web_search alleen als fallback (bestaande Haiku-key). Geen Instagram.

## 6. Runtime / kosten / frequentie

| Item | Beoordeling |
| --- | --- |
| Cron source-refresh `maxDuration=60` | OK voor batch 3 + draft_cap 10 |
| Frequentie dagelijks 04:00 UTC | OK; pilots hebben 24–84u interval |
| AI event-extract in thorough pilots | deterministische HTML-parsers — laag |
| Discovery AI | optioneel, bounded — OK bij wave 3 |
| Auto-publish | blijft uit |

## 7. Beheerervaring

- Klaar → jij publiceert (of later bulk)
- Nakijken → alleen twijfel/locatie/conflicten
- Nieuwe organisatoren → promising-lijst, geen aandacht tot jij follow aanzet
- Geen nieuwe admin-schermen nodig

## 8. Code in deze PR (klein)

- Cron-outcomes tonen `draftedCount` (zichtbaarheid eerste runs)
- Dry-run alle 5 pilots
- `verify:phase2c-readiness` + dit voorstel

## GO / NO-GO

| Stap | Advies |
| --- | --- |
| Wachten op eerste Sportieve scheduled run | **ja** |
| Wave 2 env (4 bronnen) | **GO na** die eerste run groen is |
| Discovery sweep | **GO later** (wave 3), apart |
| Alle 87 / HopToDate / auto-publish | **NO-GO** |
