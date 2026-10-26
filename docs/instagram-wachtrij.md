# Instagram-wachtrij (automatisch posten met goedkeuring)

Adminpagina: `/interne-instagram/wachtrij` (zelfde Google-login als `/interne-events`).

## Hoe het werkt

1. **Maak een post** (bovenaan de pagina): kies *Binnenkort*, *Deze week*, *Nieuw*
   of *Eén event*. De site maakt de afbeeldingen + caption; er wordt nog niets geplaatst.
2. Bekijk het voorbeeld, pas eventueel de caption aan en klik:
   - **Nu plaatsen**: meteen op Instagram (±30 seconden), of
   - **Plannen voor die avond (18–20 u)**: je kiest een dag; de post gaat die avond automatisch online.
3. De site stelt daarnaast zelf vier posts per week voor (ma *Deze week*, wo *Nieuw*,
   vr *Binnenkort*, za één event in de kijker dat de laatste 3 weken nog niet in een
   post stond). Die verschijnen onder **Te keuren**. Goedkeuren of **Afwijzen**;
   afgewezen posts worden verborgen en nooit geplaatst.
4. **Verhaal (story):** vinkje "Ook als verhaal" (standaard aan). Na de feedpost
   plaatst de site een staand beeld (1080×1920): de eerste slide met
   `dateofflinehub.be` eronder. Instagram laat via de API geen
   linksticker toe; wil je een klikbare link, klik dan **Download verhaal** en plaats
   het zelf in de app met een linksticker. Mislukt het verhaal, dan blijft de post
   gewoon staan en kun je **Verhaal plaatsen** opnieuw proberen.
5. **Reel:** bij elk nieuw voorstel wordt binnen het uur ook een reel gemaakt
   (zie `docs/instagram-reels.md`). Je ziet de video onder de slides; je keurt
   slides, reel, caption en verhaal samen goed. Met het vinkje **Plaatsen als
   reel** (standaard aan) gaat de post online als reel (verhaal = dezelfde
   video); lukt de reel niet, dan gaan automatisch de slides als gewone post.
6. Schakelaar **Automatisch posten zonder goedkeuring** (standaard UIT): als die aan
   staat, gaan ook niet-goedgekeurde voorstellen op hun dag online.

Afbeeldingen worden één keer als JPEG gemaakt en in Neon bewaard.
Instagram haalt ze op via `https://dateofflinehub.be/api/instagram/media/<id>.jpg`.
Na 30 dagen (gepost) of 60 dagen (afgewezen/mislukt) worden de bytes opgeruimd.

Geen dubbele posts: een post wordt in één databasestap geclaimd. Als een poging
onduidelijk afloopt, onthoudt de wachtrij de Instagram-container. "Opnieuw proberen"
vraagt eerst aan Instagram wat ermee gebeurde: gepubliceerd → status *gepost*,
nooit gepubliceerd → verse containers (met de huidige caption). Is het onduidelijk,
dan post de site niets en vraagt ze jou eerst op Instagram te kijken
(knop "Staat niet op Instagram, opnieuw plaatsen").

De dagelijkse ronde plaatst alle posts die aan de beurt zijn (zolang de tijd het
toelaat). Een post die meer dan 48 uur te laat is, wordt niet meer geplaatst.

Noodstop: zet `INSTAGRAM_META_PUBLISH_ENABLED=0` in Vercel (en redeploy) om alle
posting via de wachtrij te stoppen.

## Eenmalige instellingen

### Vercel (project → Settings → Environment Variables)

| Naam | Type | Waarde |
|---|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | Secret, Production | token uit de Meta-app (Instagram Login) |
| `INSTAGRAM_USER_ID` | Config | `17841452044721453` |
| `CRON_SECRET` | Secret | bestaat al (ook gebruikt door de andere crons) |
| `AUTH_SECRET` | Secret | bestaat al; versleutelt het opgeslagen token |

Daarna **Deployments → ⋯ → Redeploy**.

Het token wordt bij eerste gebruik versleuteld in de database bewaard en daarna
automatisch vernieuwd (`refresh_access_token`, ±elke 50 dagen). Zet je ooit een
nieuw token in Vercel, dan neemt de site dat automatisch over.

De avondronde is een Vercel-cron die elke avond drie keer loopt (`vercel.json`, 17:00/17:20/17:40 UTC, 18–20 u Belgische tijd);
op het Hobby-plan kan dat maar één keer per dag. Voor een ander moment: **Nu plaatsen**.

### Database

Geen handwerk nodig: de tabellen worden bij het eerste gebruik aangemaakt.
Handmatig kan ook: `npm run db:migrate:instagram-post-queue`.

## Code

| Bestand | Rol |
|---|---|
| `lib/instagram/queue-schema.ts` | tabellen `instagram_post_queue`, `instagram_post_media`, `instagram_settings` |
| `lib/instagram/queue.ts` | wachtrij-opslag + statussen |
| `lib/instagram/queue-runner.ts` | cron-ronde: opruimen, token, publiceren, voorstellen |
| `lib/instagram/queue-media.ts` | JPEG-rendering |
| `lib/instagram/story.tsx` | verhaal-beeld 1080×1920 |
| `lib/instagram/token-store.ts` | token versleuteld opslaan + vernieuwen |
| `app/api/cron/instagram/route.ts` | dagelijkse Vercel-cron (Bearer `CRON_SECRET`) |
| `app/api/instagram/media/[id]/route.ts` | publieke JPEG's voor Meta |
| `app/interne-instagram/wachtrij/` | adminpagina |

Offline test: `npm run verify:instagram-queue`.
