# Instagram Fase 3B — eenmalige Meta-koppeling

Korte handleiding om `@dateofflinehub` klaar te zetten voor officiële publicatie via de Instagram Graph API. Geen cron, geen automatische posts: publicatie gebeurt alleen via de knop **Publiceren naar Instagram** op `/interne-instagram`.

Bron: [Meta Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing).

## Wat je eenmalig nodig hebt

1. Instagram-account als **Professional** (Business of Creator): `@dateofflinehub`
2. Een **Facebook Page** die gekoppeld is aan dat Instagram-account
3. Een **Meta App** (developers.facebook.com) met Instagram Graph API
4. Rechten (Facebook Login for Business-pad):
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
5. Voor productie: **Advanced Access** op die permissions (App Review), of test met een rol op de app/Page

## Eenmalige stappen (minimaal)

1. Bevestig in Meta Business Suite / Instagram-instellingen dat de Page ↔ IG-koppeling actief is.
2. Maak of open de Meta App → voeg **Instagram** / Graph API product toe.
3. Genereer een **Page access token** met publish-rechten voor de gekoppelde Page (Graph API Explorer of Business Login).
4. Wissel om naar een **long-lived** token (of system user token in Business Manager) en bewaar die alleen server-side.
5. Zoek de **Instagram Business Account ID** (`META_IG_USER_ID`):
   - `GET /{page-id}?fields=instagram_business_account`
6. Zet server environment variables (Vercel → Project → Settings → Environment Variables), **nooit** `NEXT_PUBLIC_*`:

| Variable | Verplicht | Betekenis |
|---|---|---|
| `META_IG_USER_ID` | ja (live) | IG professional account id |
| `META_PAGE_ACCESS_TOKEN` | ja (live) | Long-lived Page token |
| `META_GRAPH_API_VERSION` | nee | default `v22.0` |
| `INSTAGRAM_META_PUBLISH_ENABLED` | nee | `1` = echte posts toestaan (default uit) |
| `INSTAGRAM_META_DRY_RUN` | nee | `1` = dry-run zonder Meta HTTP |
| `INSTAGRAM_IMAGE_SIGNING_SECRET` | aanbevolen | HMAC voor publieke JPEG-URL’s (valt terug op `AUTH_SECRET`) |
| `OFFLINERADAR_PUBLIC_BASE_URL` | aanbevolen | bv. `https://dateofflinehub.be` (Meta moet images kunnen fetchen) |

7. Database (eenmalig, non-destructief):

```bash
npm run db:migrate:instagram-publishes
npm run db:migrate:instagram-approvals
npm run verify:instagram-phase3b
```

Publieke JPEG-tickets (`/api/instagram/public-media`) zijn **6 uur** geldig — voldoende voor Meta om alle carrousel-slides op te halen.

## Hoe publiceren werkt in de app

1. Open `/interne-instagram` als beheerder.
2. Controleer slides + caption.
3. **Goedkeuren (onthouden)** → schrijft event-ids naar Neon conceptgeschiedenis.
4. **Publiceren naar Instagram**:
   - mode `disabled` → duidelijke fout (flags uit)
   - mode `dry_run` → logt poging in Neon, **geen** Meta-aanroep
   - mode `live` → maakt JPEG-containers via Graph API en publiceert één feed-post/carrousel
5. Resultaat (status, Meta media id, fout) staat in tabel `instagram_publishes`.
6. Dubbelklik / retry op een al gepubliceerd concept wordt geblokkeerd.

## Belangrijke Meta-beperkingen

- Images moeten **JPEG** zijn en publiek bereikbaar (wij serveren signed `/api/instagram/public-media`).
- Max. **50** publishes / 24u per professional account.
- Page Publishing Authorization / 2FA op de Page kan publicatie blokkeren — eenmalig afronden in Meta.

## Veilig default

- Feature flag **uit** laten tot expliciete GO.
- Eerst `INSTAGRAM_META_DRY_RUN=1` op preview/staging.
- Pas daarna `INSTAGRAM_META_PUBLISH_ENABLED=1` en `INSTAGRAM_META_DRY_RUN` uitzetten voor één gecontroleerde live test.
