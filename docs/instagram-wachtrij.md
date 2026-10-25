# Instagram-wachtrij (automatisch posten met goedkeuring)

Adminpagina: `/interne-instagram/wachtrij` (zelfde Google-login als `/interne-events`).

## Hoe het werkt

1. De site stelt elke week drie posts voor (Brusselse tijd):
   maandag 19:00 *Deze week*, woensdag 19:00 *Nieuw*, vrijdag 17:00 *Binnenkort* (carrousel).
   Voorstellen verschijnen tot 7 dagen vooraf onder **Te keuren**.
2. Jij past eventueel caption/tijdstip aan en klikt **Goedkeuren** (of **Afwijzen**).
3. Elke 15 minuten kijkt een geplande taak of er een goedgekeurde post klaarstaat
   en plaatst die via de Instagram API (container → wachten tot klaar → publish).
4. Schakelaar **Automatisch posten zonder goedkeuring** (standaard UIT): als die aan
   staat, gaan ook niet-goedgekeurde voorstellen op hun tijdstip online.

Afbeeldingen worden bij het voorstel één keer als JPEG gemaakt en in Neon bewaard.
Instagram haalt ze op via `https://dateofflinehub.be/api/instagram/media/<id>.jpg`.
Na 30 dagen (gepost) of 60 dagen (afgewezen/mislukt) worden de bytes opgeruimd.

Veiligheid tegen dubbel posten: een post wordt in één databasestap "geclaimd".
Als publiceren halverwege stopt, wordt de post *mislukt* met de vraag om eerst op
Instagram te kijken; er is nooit een automatische herhaling.

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

### GitHub (repo → Settings → Secrets and variables → Actions)

Vercel Hobby laat crons maar één keer per dag lopen, daarom roept
`.github/workflows/instagram-cron.yml` elke 15 minuten `/api/cron/instagram` aan.

- **New repository secret** `CRON_SECRET` = exact dezelfde waarde als `CRON_SECRET` in Vercel.
  Kun je die in Vercel niet meer zien? Maak een nieuwe lange willekeurige waarde,
  zet die in Vercel (en redeploy) én hier.
- Optioneel: **Variables** → `SITE_URL` als het domein ooit niet `https://dateofflinehub.be` is.

Testen: GitHub → **Actions** → *Instagram wachtrij* → **Run workflow**.
Let op: GitHub pauzeert geplande workflows na 60 dagen zonder activiteit in de repo;
je krijgt dan een mail en zet hem met één klik weer aan.

### Database

Geen handwerk nodig: de tabellen worden bij het eerste gebruik aangemaakt.
Handmatig kan ook: `npm run db:migrate:instagram-post-queue`.

## Code

| Bestand | Rol |
|---|---|
| `lib/instagram/queue-schema.ts` | tabellen `instagram_post_queue`, `instagram_post_media`, `instagram_settings` |
| `lib/instagram/queue.ts` | wachtrij-opslag + statussen |
| `lib/instagram/queue-runner.ts` | cron-ronde: opruimen, token, publiceren, voorstellen |
| `lib/instagram/queue-media.ts` | JPEG-rendering en externe afbeeldingen |
| `lib/instagram/token-store.ts` | token versleuteld opslaan + vernieuwen |
| `app/api/cron/instagram/route.ts` | cron-endpoint (Bearer `CRON_SECRET`) |
| `app/api/instagram/media/[id]/route.ts` | publieke JPEG's voor Meta |
| `app/interne-instagram/wachtrij/` | adminpagina |

Offline test: `npm run verify:instagram-queue`.
