# DateOfflineHub — Sportieve locatieherkenning

**Branch:** `cursor/sportieve-location-evidence-4b09`  
**Base:** `main` (`7681989`)  
**Merge/deploy:** niet uitgevoerd (wacht op goedkeuring)

## Verdict

**GO voor merge** (na review).

Kwaliteitsgate ongewijzigd: `België`/regio alleen blijft Nakijken; locatie wordt alleen bevestigd bij overeenstemmend bronbewijs (postcode ↔ plaats of betrouwbare alias) + bekende geo-coördinaten.

## Wat gebouwd is

| Onderdeel | Pad |
| --- | --- |
| Postcode + plaats evidence + conflictcheck | `lib/source-refresh/parsers/sportieve-location.ts` |
| Parser gebruikt evidence; detail-URL match | `lib/source-refresh/parsers/sportieve-singles.ts` |
| Detailpagina-enrichment (max 8, alleen zwakke stad) | `lib/source-refresh/sportieve-enrich-location.ts` |
| Engine-hook na Sportieve parse | `lib/source-refresh/engine.ts` |
| Geo voor Koksijde, Oudenaarde, Tessenderlo, Florenville, Hoogstraten, Houthalen-Helchteren, Bierbeek/Lovenjoel, Brasschaat, Berchem→Antwerpen | `lib/geo-cities.ts` |
| Regressie 10 Nakijken-cases | `scripts/verify-sportieve-location.ts` (`npm run verify:sportieve-location`) |

## Gedrag

1. Listing: titel-suffix `/ plaats`, BE-postcode `#### Plaats`, alias-map (Berchem→Antwerpen, Ename→Oudenaarde, …).  
2. Postcode-gemeente en plaatsnaam moeten overeenkomen (of alias); anders **unconfirmed**.  
3. `België` / regio-only → zwak → Nakijken.  
4. Zwakke kandidaten met `/events/…`-URL: begrensde detail-fetch; locatie opnieuw resolven; bij twijfel blijft Nakijken.

## Read-only projectie bestaande 10 Nakijken (geen DB-update)

| Bron | Resultaat |
| --- | --- |
| Opgeslagen description alleen | **8/10** → Klaar (Koksijde, Antwerpen/Berchem, Oudenaarde, Tessenderlo, Bierbeek, Florenville, Hoogstraten, Houthalen-Helchteren) |
| + detailpagina (2 lege listing-bodies) | **+2** → Brasschaat (stiltewandeling + herfstkleuren / Peerdsbos) |
| **Totaal projectie** | **10/10 → Klaar** |
| Bestaande 5 Klaar | ongewijzigd relevant |
| Published 194 / Sportieve 19 | niet aangeraakt |

Productieconcepten zijn **niet** bijgewerkt. Na merge: optioneel één controlled refresh of gerichte city-patch met aparte GO.

## Tests

| Check | Resultaat |
| --- | --- |
| `npm run verify:sportieve-location` | OK (10/10 + conflict + België-weak) |
| `npm run verify:phase19-sportieve` | OK |
| `npm run verify:source-refresh` | OK |
| `npx tsc --noEmit` | OK |
| Live listing parse (read-only) | 16/16 met bevestigde stad |

## Niet gedaan

- Geen nieuwe scans / extra drafts  
- Geen publicatie  
- Geen update van de 15 bestaande concepten in Neon  
- Geen kill-switch wijzigingen  
- Geen merge/deploy  

## GO / NO-GO

| Vraag | Antwoord |
| --- | --- |
| Merge PR? | **GO** |
| Deploy? | na merge via normale pipeline |
| Bestaande drafts herschrijven? | **NO-GO** tot expliciete toestemming |
| Auto-publish? | **NO-GO** |
