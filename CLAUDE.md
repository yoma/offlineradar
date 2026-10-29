@AGENTS.md

# DateOfflineHub: werkafspraken voor Claude Code

DateOfflineHub (repo heet nog `offlineradar`) helpt singles offline activiteiten vinden waar ze andere singles ontmoeten. Discovery, geen datingapp en geen ticketwinkel: ontdekken, filteren, detail, doorklikken naar de organisator.

Eigenaar: Youri. Volledig dossier: Google Drive, "DateOfflineHub, volledig projectdossier en AI-overdracht". Bij twijfel gaan latere expliciete besluiten en actuele code/data voor op oudere docs (README, domain-model, discovery-playbook en instagram-meta-setup zijn deels verouderd).

## Communicatie

- Nederlands, kort en helder. Resultaat en volgende stap eerst.
- Geen em-dashes (—) in tekst voor Youri of in publieke copy.
- Bundel samenhangende taken in één ronde met één eindrapport. Stop niet na een plan als uitvoering al gevraagd is. Vraag alleen bij echte onzekerheid of nieuwe scope.
- Houd uit elkaar: lokaal klaar, gepusht, PR open, gemerged, gedeployed, live gecontroleerd. Claim nooit meer dan je zag.

## Veiligheid: productie

`.env.local` wijst naar de productiedatabase (Neon). Daarom:

- **Vraag eerst** vóór elk script of commando dat kan schrijven: alles met `--env-file=.env.local`, en scripts met import, curate, backfill, publish, enrich, fix, reclassify, migrate of `db:migrate:*` in de naam. "verify" betekent niet automatisch read-only: lees het script eerst.
- Geen deletes, geen env-wijzigingen in Vercel, geen migraties, geen deploys zonder expliciete GO van Youri voor die concrete actie. Een eerdere GO geldt niet voor nieuwe taken.
- Geen handmatige cron- of refresh-trigger om een geplande run te "simuleren".
- Secrets nooit in code, logs, prompts of rapporten. Noem alleen variabelenamen. Nooit `NEXT_PUBLIC_*` voor secrets.
- Werk op een branch en open een PR. Mergen naar `main` (= productie) beslist Youri.

## Productregels die niet ter discussie staan

- Toelating: Route A (aantoonbaar singlesgerichte activiteit) of Route B (gewone activiteit met vooraf bevestigde singlesformule). Betaling koopt nooit toelating.
- Eligibility (harde leeftijds-/gendervoorwaarden) komt vóór ranking. Richtleeftijd is geen harde grens.
- Onbekend blijft onbekend: geen verzonnen prijs, leeftijd, capaciteit, beschikbaarheid of tijden.
- Tijden altijd via Europe/Brussels (winter +01:00, zomer +02:00).
- Geen eventfoto van een ander event tonen alsof het de echte editie is. Sfeerbeelden duidelijk als sfeerbeeld.
- Instagram: geen Facebook-pagina. Doel is directe Instagram Login. Nooit live publiceren zonder expliciete GO.
- Mobiel eerst: zoeken en filters snel bereikbaar, resultaten zo hoog mogelijk in beeld.

## Werkwijze

- Lees de Next.js-docs in `node_modules/next/dist/docs/` vóór je Next-specifieke code schrijft (zie AGENTS.md).
- UI-werk: draai `npm run dev`, bekijk de pagina op 375x812 en op desktop, en neem screenshots voor en na op in de PR.
- Vóór elke PR: `npx tsc --noEmit`, `npm run build`, plus de relevante `verify:*` scripts uit package.json (offline varianten zonder `.env.local` eerst).
- Commit-berichten en PR-beschrijving: wat, waarom, hoe geverifieerd, wat nog open staat.
