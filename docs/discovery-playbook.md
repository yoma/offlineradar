# DateOfflineHub discovery playbook

Herhaalbare methodiek om singles-bronnen te vinden zonder crawler/cron.
Controledatum basis: 2026-09-26 (fase 14).

## Productgate (altijd eerst)

DateOfflineHub = offline mogelijkheden voor singles om andere singles te ontmoeten.

- **Route A:** expliciete singlesactiviteit / singlesformule.
- **Route B:** algemene activiteit met bewezen singles-track.

Niet opnemen: gewone travel, hike, party, dinner, meetup, networking, friendship-only.

Geen AI auto-approval. Mens beslist publication.

## Search matrix

Structuur: **REGIO × TAAL × FORMAT × KANAAL**

| Regio | Talen | Formats (prioriteit) | Kanalen (volgorde) |
| --- | --- | --- | --- |
| Antwerpen | NL, EN | party, drinks, activity, dinner, sport | organizer → ticket (Eventgoose/HoE) → IG |
| Brussel | FR, NL, EN | dinner, party, workshop, drinks, speeddate* | organizer → Partyfinder/Hipsy → Meetup |
| Gent | NL, EN | party, workshop, drinks, outdoor | organizer → Hipsy/Lucky Lemon → Eventgoose |
| Leuven / Vlaams-Brabant | NL | dinner, drinks, workshop, outdoor | venue calendar → organizer → Eventbrite |
| Mechelen | NL | travel (Tomeeto HQ), community 50+ | organizer site first |
| Limburg | NL | outdoor, weekend, sport, drinks | Sportieve Singles → speeddaten hubs |
| West-Vlaanderen | NL | dinner, bowling, outdoor, party | Will You Date Me → SS → ticket |
| Oost-Vlaanderen (buiten Gent) | NL | outdoor, travel | SS / Juntas / Hellotravel |
| Wallonië (Liège, Namur, Mons, BW, Charleroi) | FR | dinner, party, speeddate* | LeSpeedDating → HopToDate → Cœur à Cœur → Date-Love |
| Nationaal / multi-regio | NL, FR | travel, weekend, retreat | Tomeeto, VillaVibes, Juntas, Hellotravel, SS reizen |

\*Speeddate alleen als regio/taal uniek uitbreidt.

### Channel order (high → low)

1. Organizer website / kalender
2. Ticketplatform (Hipsy, Eventgoose, Partyfinder, IkWilEenTicket, Billetweb)
3. Link-in-bio / Linktree (naar primary URL)
4. Instagram / Facebook (signaal only; niet scrapen)
5. Nieuwsbrief-aanbod noteren (`newsletter_available=true` in notes)
6. Aggregators / Meetup (laatste; veel noise)

## Provenance

User-supplied bronnen (handmatige productvondst / admin intake):

```
discovered_by=user
```

Admin → Aanvoer → Mijn bronnen → filter **Door jou aangebracht**.

### Mandatory future discovery input

Bronnen met `discovered_by=user` zijn **permanente discovery-input**:

- ze mogen niet verdwijnen omdat een latere scan ze tijdelijk niet terugvindt
- ze mogen niet automatisch naar `low_yield` / `inactive` alleen wegens crawlbaarheid
- geplande refresh / discovery-runs moeten ze blijven raadplegen
- zie ook `lib/aanvoer/future-discovery.ts`

Geen `discovered_by=user` verzinnen: alleen zetten bij bewezen handmatige productvondst of admin intake.

## Best-performing queries (fase 14)

### NL

- `singles weekend België` / `singles reizen België` / `groepsreizen singles`
- `singles diner` + stad · `singles party Gent/Antwerpen`
- `singles wandeling` · `sportieve singles`
- `singles padel` · `conscious dating België`

### FR

- `soirée célibataires Bruxelles` · `dîner célibataires`
- `voyage célibataires Belgique` · `randonnée célibataires`
- `speed dating Liège/Namur` (regio-uitbreiding)

### EN

- `singles events Belgium` · `singles dinner Brussels`
- `singles travel Belgium` · `singles retreat Belgium`

### Intent-varianten (alleen houden bij bewezen singlesfocus)

solo · alleenstaanden · vrijgezellen · mingle · connection · meet new people · dating

## Organizer-first

Bij elke sterke hit:

1. Wie organiseert?
2. Eigen kalender?
3. Meerdere future editions?
4. Andere formats / regio’s?
5. Primary URL vs ticket mirror?

Organizers > losse listings. Ticketplatform = discovery, niet canonical org (tenzij geen website).

## Travel track (verplicht apart)

Queries: singles holidays / ski / citytrip / cruise / wandelvakantie / padelvakantie.

Bekende high-yield: **Tomeeto**, VillaVibes, Hellotravel, Juntas, Sportieve Singles reizen.

Testcase: Tomeeto (`tomeeto.be`) moet via travel-queries gevonden worden.

## Anti-patterns (low yield / niet herhalen)

- Brede Meetup “social” zonder singlesclaim
- Dating apps zonder offline agenda (Farm Date/AgriMatching als app-only)
- Nightlife aggregators zonder singlesfocus
- Generic friendship / expat meetup
- Corporate padel/team-building (PadelMax)
- Blind Instagram hashtag scrolls zonder link-out
- Dupliceren van SmartVibes/HopToDate via elke stadshub als aparte “nieuwe” organizer

## Duplicate handling

Check: normalized URL, organizer name, title + starts_at + city.

Ticket mirror → secondary source op bestaande edition, geen tweede event.

## Source statuses

| Status | Betekenis |
| --- | --- |
| active | meerdere concrete toekomstige events |
| promising | singlesfocus, dunne/huidige agenda beperkt |
| low_yield | veel werk / weinig events |
| inactive | geen actuele events |

`irrelevant` wordt niet opgeslagen (alleen in discovery notes/rejected list).

## Blind recall check

Na matrix-update: sweep **zonder** bekende merknamen als query.

Daarna vergelijken met user-supplied (Tomeeto, The Sircle, Farm Date).

Vraag: zou de methode ze nu zelf vinden? Zo nee → matrix/query aanpassen.

## Out of scope

Geen crawler, cron, browser bot, social scraping, CAPTCHA/login bypass, auto-import, auto-publish.
