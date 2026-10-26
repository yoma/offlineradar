# Instagram-reels

Elke feedpost uit de wachtrij moet een Reel worden met dezelfde events en
caption; lukt de reel niet, dan gaat de gewone post online.

- **Stap 1** (klaar): videotemplate en lokale testrender.
- **Stap 2** (klaar): bij elk voorstel wordt een reel gemaakt en in de
  wachtrij getoond.
- **Stap 3** (klaar): reel publiceren, reel-story, terugval op de post,
  mailmeldingen. Per post te kiezen in de wachtrij.

## Publiceren als reel (stap 3)

In de wachtrij heeft elke post met een reel het vinkje **Plaatsen als reel**
(standaard aan). Aangevinkt gaat de post online als reel, op hetzelfde moment
en na dezelfde goedkeuring als nu; uitgevinkt als gewone carrousel. Nooit een
post en een reel samen. Posts zonder reel (van vóór de reels) gaan gewoon als
post.

1. Is de reel niet *klaar*, dan gaat meteen de gewone post (terugval).
2. Publicatielimiet nakijken (`content_publishing_limit`, 100 per 24 uur).
   Is die op, dan mislukt de post (een gewone post zou ook geweigerd worden).
3. REELS-container met de MP4 (`video_url`), caption, `share_to_feed=true`,
   `cover_url` (de cover) en `collaborators`: de Instagram-accounts van de
   organisatoren (uit het event, max. 3, nooit ons eigen account). Weigert
   Meta de collaborators, dan opnieuw zonder.
4. `status_code` opvragen tot FINISHED (elke 3 s). ERROR, EXPIRED of te
   traag: terugval op de gewone post.
5. `media_publish`. Een duidelijke weigering geeft terugval; een onduidelijk
   antwoord (netwerk, timeout) niet, want de reel kan al online staan: de post
   wordt *mislukt* met "kijk op Instagram".
6. Verhaal (als *Ook als verhaal* aan staat): dezelfde MP4 als videoverhaal.
   Lukt dat niet, dan het reserve-verhaalbeeld ("Nieuwe reel 👀 bekijk ons
   profiel", door de renderer gemaakt). Bij een terugval op de post gaat het
   gewone verhaal van de post.

Tijd: de cron en de wachtrijpagina mogen 300 s draaien (Vercel Fluid). De
reel krijgt tot 170 s voor Meta's verwerking; daarna blijft er tijd voor een
terugvalpost (45 s) en het verhaal.

Captions: zonder em-dashes (ook bij het publiceren nog eens verwijderd) en
met 3 tot 5 hashtags, waarvan minstens één lokaal (`#singlesgent`,
`#oostvlaanderen`, anders `#singlesvlaanderen`).

### Meldingen

Mail via Resend bij: een reel die na 3 pogingen niet gemaakt kon worden, een
reel die als gewone post online ging, en een post die mislukte. Ontvangers:
`INSTAGRAM_ALERT_EMAIL` (komma-gescheiden), anders `OFFLINERADAR_ADMIN_EMAILS`.

### Noodstop

`INSTAGRAM_REEL_ENABLED=0` in Vercel: alles gaat als gewone post, wat de
vinkjes ook zeggen.

## Hoe een reel gemaakt wordt (stap 2)

1. Bij elk nieuw voorstel (automatisch of via *Maak een post*) bewaart de site
   de reel-gegevens (`reel_props`): dezelfde events en hetzelfde formaat als de
   slides. De reel krijgt status *te_maken*.
2. Elk uur (minuut 20) draait de GitHub Actions-workflow
   `.github/workflows/instagram-reels.yml`. Die vraagt eerst aan de site of er
   reels wachten (`GET /api/instagram/reels/jobs`); zo niet, dan stopt hij
   meteen. Anders installeert hij Remotion, claimt hij de reels
   (`POST /api/instagram/reels/jobs`), rendert ze en uploadt MP4, cover en
   reserve-verhaalbeeld (`PUT /api/instagram/reels/<id>/media`), en meldt het resultaat
   (`POST /api/instagram/reels/<id>/result`).
3. MP4 en cover worden in Neon bewaard (zoals de JPEG's) en publiek geserveerd
   via `/api/instagram/media/<id>.mp4` en `.jpg`.
4. In de wachtrij staat de video onder de slides, met de hook en de knop
   *Reel opnieuw maken*. Verplaats je een post naar een andere dag en zou de
   hook anders luiden ("dit weekend", "morgen"), dan wordt de reel automatisch
   opnieuw gemaakt.

Een render wordt maximaal 3 keer geprobeerd (status *mislukt* daarna; de post
blijft gewoon bruikbaar). Een mislukte workflow-run kleurt rood en GitHub mailt
dan de eigenaar van de repo.

Instelling: repository secret `CRON_SECRET` in GitHub (zelfde waarde als in
Vercel). Optioneel de repository variable `REEL_SITE_URL` (standaard
`https://dateofflinehub.be`).

## Testreel maken

```bash
npm run reel:test                        # alle formaten
npm run reel:test -- --format=deze_week  # deze_week | binnenkort | nieuw | single
```

Resultaat in `out/reels/`: per formaat een MP4 (1080x1920, 30 fps, H.264 +
AAC 128 kbps, 8 tot 15 s), een coverbeeld, het reserve-verhaalbeeld, de
caption en de gebruikte props.
Zonder `.env.local` gebruikt de site de voorbeeld-events; met Neon de echte
catalogus (`node --env-file=.env.local --import tsx scripts/render-test-reel.ts`).

Template live bekijken en aanpassen: `npm run reel:studio`.

Remotion downloadt bij de eerste render zelf een headless Chrome. Een eigen
Chrome kan via `REMOTION_BROWSER_EXECUTABLE=/pad/naar/chrome-headless-shell`.

## Opbouw

1. **Hook** (2,5 s, leesbaar binnen de eerste seconde): bv. "5 singles-events in
   Gent dit weekend". Stad als alle events in dezelfde stad zijn, anders de
   provincie, anders niets.
2. **Events**, volgens dezelfde logica als de post:
   *Deze week* = één agendapagina, *Binnenkort* en *Nieuw* = één kaart per event,
   *Eén event* = één uitgebreide kaart. Bij te veel events voor 15 s wordt het
   een agendapagina.
3. **Call-to-action**: logo en dateofflinehub.be.

Huisstijl uit `lib/brand/tokens.ts`, fonts (Bricolage Grotesque, DM Sans) uit
Fontsource, logo in `remotion/public/brand`.

## Muziek

Rechtenvrije tracks in `remotion/public/music/` (mp3, m4a, aac of wav). Elke
reel neemt de volgende track; fade-in en fade-out zitten in de video.
`rustig-01.mp3` is een zelf gegenereerde, neutrale track zonder rechten van derden.

## Instellingen (env)

| Naam | Standaard | Betekenis |
|---|---|---|
| `INSTAGRAM_REEL_ENABLED` | aan | `0` = noodstop, nooit reels (de keuze zelf gebeurt per post in de wachtrij) |
| `INSTAGRAM_REEL_FALLBACK_TO_POST` | aan | `0` = geen post als de reel mislukt |
| `INSTAGRAM_REEL_COLLABORATORS` | aan | `0` = organisatoren niet uitnodigen als collaborator |
| `INSTAGRAM_ALERT_EMAIL` | admins | ontvangers van de meldingen |
| `INSTAGRAM_REEL_MIN_SECONDS` / `_MAX_SECONDS` | 8 / 15 | duur van de reel |
| `INSTAGRAM_REEL_MUSIC_DIR` | `music` | map in `remotion/public` |
| `INSTAGRAM_REEL_MUSIC_VOLUME` | 0.6 | volume 0 tot 1 |
| `INSTAGRAM_REEL_MUSIC_FADE_IN` / `_FADE_OUT` | 0.6 / 1.2 | seconden |

## Code

| Bestand | Rol |
|---|---|
| `lib/instagram/reel/props.ts` | draft → reel-props (hook, timing, teksten) |
| `lib/instagram/reel/config.ts` | instellingen uit env |
| `lib/instagram/reel/music.ts` | trackrotatie |
| `remotion/Reel.tsx` | het videotemplate |
| `lib/instagram/reel/queue-reel.ts` | props bij een nieuw voorstel, opnieuw bij een nieuwe datum |
| `lib/instagram/reel/render.ts` | Remotion-render (MP4 + cover + verhaalbeeld, max 4,2 MB) |
| `lib/instagram/queue-runner.ts` | publiceren: reel, terugval op de post, verhaal |
| `lib/instagram/reel/publish-plan.ts` | collaborators en tijdsbudget |
| `lib/instagram/notify.ts` | mailmeldingen |
| `scripts/render-test-reel.ts` | lokale testrender |
| `scripts/render-queued-reels.ts` | renderer voor de wachtrij (GitHub Actions) |
| `app/api/instagram/reels/` | routes voor de renderer (Bearer `CRON_SECRET`) |

Offline test: `npm run verify:instagram-reel`.

Licentie: Remotion is gratis voor individuen en bedrijven tot 3 medewerkers.
