# Instagram-wachtrij (automatisch posten met goedkeuring)

Adminpagina: `/interne-instagram/wachtrij` (zelfde Google-login als `/interne-events`).

## Hoe het werkt

1. **Maak een post** (bovenaan de pagina): kies *Binnenkort*, *Deze week*, *Nieuw*
   of *Eén event*. De site maakt de afbeeldingen + caption; er wordt nog niets geplaatst.
2. Bekijk het voorbeeld, pas eventueel de caption aan en klik:
   - **Nu plaatsen**: meteen op Instagram (±30 seconden), of
   - **Plannen op dit tijdstip**: gaat online bij de dagelijkse ronde (18–20 uur).
3. De site stelt daarnaast zelf drie posts per week voor (ma *Deze week*, wo *Nieuw*,
   vr *Binnenkort*). Die verschijnen onder **Te keuren**. Goedkeuren of **Afwijzen**;
   afgewezen posts worden verborgen en nooit geplaatst.
4. Schakelaar **Automatisch posten zonder goedkeuring** (standaard UIT): als die aan
   staat, gaan ook niet-goedgekeurde voorstellen op hun dag online.

Afbeeldingen worden één keer als JPEG gemaakt en in Neon bewaard.
Instagram haalt ze op via `https://dateofflinehub.be/api/instagram/media/<id>.jpg`.
Na 30 dagen (gepost) of 60 dagen (afgewezen/mislukt) worden de bytes opgeruimd.

Geen dubbele posts: een post wordt in één databasestap geclaimd. Als een poging
onduidelijk afloopt, onthoudt de wachtrij de Instagram-container; "Opnieuw proberen"
vraagt eerst aan Instagram of die al gepubliceerd is en plaatst dan niet opnieuw.

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

De geplande ronde is een gewone Vercel-cron (`vercel.json`, dagelijks 17:xx UTC);
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
| `lib/instagram/token-store.ts` | token versleuteld opslaan + vernieuwen |
| `app/api/cron/instagram/route.ts` | dagelijkse Vercel-cron (Bearer `CRON_SECRET`) |
| `app/api/instagram/media/[id]/route.ts` | publieke JPEG's voor Meta |
| `app/interne-instagram/wachtrij/` | adminpagina |

Offline test: `npm run verify:instagram-queue`.
