# Instagram promo-reels

Eén keer per week een reel die mensen naar dateofflinehub.be trekt: echte
sfeerbeelden (Pixabay, Pexels als aanvulling als er een sleutel is), een korte hook, per clip een
korte zin en een call-to-action. Events zijn hooguit een bijzaak.

Template: **Ondertitel** (gekozen in oktober 2026). Tekst, thema, beelden,
caption en muziek zijn elke week nieuw; de look blijft dezelfde.

## Elke week

1. **Voorstel**: de avondcron van Vercel zet een week vooraf een promo-post in
   de wachtrij voor het promo-moment (standaard zondag 11:00). Die post heeft
   nog geen tekst of video.
2. **Maken**: de uurlijkse GitHub-workflow *Instagram reels* ziet de post,
   laat Claude de tekst schrijven en de beelden kiezen (zie hieronder), stuurt
   het plan naar de site en rendert de video. Binnen het uur staat hij onder
   **Te keuren** op `/interne-instagram/wachtrij`, met video, caption en de
   bron van elke clip.
3. **Keuren**: zoals de andere posts: caption aanpassen, *Plannen voor die dag*
   of *Nu plaatsen*. Niet goed? Kies **Nieuwe tekst** (zelfde beelden),
   **Nieuwe beelden** (zelfde tekst) of **Allebei nieuw**; binnen het uur staat
   de nieuwe versie er. Afgekeurde hooks en clips komen niet terug.
   *Deze week geen promo-reel* parkeert hem.
4. **Plaatsen**: de GitHub-workflow *Instagram promo publish* vraagt elk uur
   (om :05) of er een promo-reel klaar staat en plaatst hem als reel, met de
   video ook als verhaal. Een promo-reel heeft geen slides: lukt de reel niet,
   dan gaat er niets online en krijg je een mail.

Zelf een extra promo-reel: *Maak een post* → **Promo-reel** (voor het volgende
promo-moment; de datum kan je daarna aanpassen).

## Zelf bijsturen

Alles staat in `config/promo-reels.ts`: dag en uur (`schedule`), thema's (briefing, voorbeeldhooks,
beeldideeën, gewicht), toon, vaste hashtags, call-to-action, dag en uur,
templates, lengte en aantal clips, en het Claude-model.

## Hoe een promo-reel gemaakt wordt

1. **Thema**: willekeurig volgens gewicht, nooit twee keer na elkaar hetzelfde.
   Het thema *deze-week* komt alleen als er minstens 3 events in de komende 7
   dagen zijn, met het echte aantal.
2. **Tekst** (`lib/instagram/promo/script.ts`): Claude schrijft hook, één zin
   per volgende clip, per clip een Engelse zoekterm en de caption. Daarna
   controleert de code: lengte, geen em-dashes, geen verzonnen getallen, geen
   herhaling van recente hooks, dateofflinehub.be in de caption, en **niets
   dat suggereert dat de mensen in beeld leden of gebruikers zijn** of elkaar
   via de site vonden. Faalt een controle, dan schrijft Claude opnieuw (max. 3
   keer).
3. **Beelden** (`lib/instagram/promo/select-clips.ts`): per scène zoeken op
   Pixabay; Pexels erbij als Pixabay weinig vindt en `PEXELS_API_KEY` gezet is
   (Pexels geeft sinds oktober 2026 tijdelijk geen nieuwe sleutels). Vindt
   Pixabay weinig, dan nog eens met de eerste twee woorden van de zoekterm. Alleen clips die scherp genoeg
   zijn voor 1080x1920 (staand, of 4K liggend om bij te snijden) en lang genoeg.
   Al gebruikte clips vallen af. Claude bekijkt de voorbeeldbeelden en geeft
   scores op sfeer (warm licht, duo's of groepjes, niet geposeerd, geen tekst of
   logo's). Onder 6/10: volgende zoekterm uit het thema. Niets bruikbaar: een
   stockfoto met een trage zoom (Ken Burns). Pixabay-foto's zijn via de API
   hoogstens 1280 px, dus iets zachter dan video; daarom alleen als back-up.
4. **Render** (`remotion/promo/PromoReel.tsx`): 2 tot 4 clips met crossfades,
   10 tot 20 s, een zachte warme kleurcorrectie zodat clips van verschillende
   bronnen bij elkaar passen, muziek uit `remotion/public/music/promo/`
   (roterend; leeg = de gewone reel-muziek).

### Templates

| Template | Look |
|---|---|
| `terras` | Beeld schermvullend, donker verloop onderaan, hook groot in Bricolage Grotesque woord per woord. Einde: logo en url op een donkere sluier. |
| `magazine` | Beeld in een cream kader zoals een tijdschriftpagina, tekst in antraciet eronder. Einde: het cream papier schuift dicht, logo en url in bordeaux. |
| `ondertitel` | Beeld schermvullend, korte zinnen in het midden als een rustige ondertitel. Einde: bordeaux vlak met logo en url. |

Alle tekst blijft in de safe zone van Reels: niets in de bovenste 250 en
onderste 360 pixels, en in de onderste helft niet onder de knoppen rechts.

## Testen

```bash
npm run promo:test                          # één reel per template
npm run promo:test -- --template=magazine   # terras | magazine | ondertitel
npm run promo:test -- --theme=swipen-beu    # thema-id uit de config
npm run promo:test -- --count=2             # meer per template
npm run promo:test -- --clips-dir=pad/naar/clips  # eigen mp4/jpg, zonder API's
```

Nodig: `ANTHROPIC_API_KEY` en `PIXABAY_API_KEY` (`PEXELS_API_KEY` optioneel),
behalve met `--clips-dir`. Resultaat in `out/promo/`: per reel de MP4, cover,
reserve-verhaalbeeld, caption en `-plan.json` met het script en de bron van elke
clip. `out/promo/history.json` onthoudt hooks en clips zodat een volgende run
niet herhaalt.

Zonder lokale sleutels: GitHub, tab **Actions**, workflow **Instagram promo
test**, *Run workflow*. Die rendert met de repository secrets en zet de video's
als artifact *promo-reels* bij de run. Hij draait ook vanzelf bij een push van
promo-code op een `claude/`-branch.

Offline controles: `npm run verify:instagram-promo`.

## Instellingen

| Naam | Waar | Betekenis |
|---|---|---|
| `ANTHROPIC_API_KEY` | GitHub secret | tekst en beeldkeuze |
| `PIXABAY_API_KEY` | GitHub secret | stockvideo en foto's (verplicht) |
| `PEXELS_API_KEY` | GitHub secret | extra stockvideo en scherpere foto's (optioneel) |
| `CRON_SECRET` | Vercel, GitHub secret | de workflows praten met de site (bestond al) |

Claude en Pixabay worden alleen vanuit GitHub Actions aangesproken, niet
vanuit Vercel. In Vercel zijn deze sleutels dus niet nodig.

In de database (Neon, `instagram_post_queue`): `format = 'promo'`,
`promo_plan` (script, clips, template, afgekeurde hooks en clips) en
`promo_redo` (`alles`, `tekst` of `beelden` zolang er een nieuwe versie
gemaakt moet worden). De kolommen komen er vanzelf bij (migratie v5).

## Licenties

- **Remotion**: gratis voor individuen en bedrijven tot 3 medewerkers; een
  eenmanszaak valt daaronder. Daarboven is een bedrijfslicentie nodig.
- **Pixabay** en **Pexels**: gratis, ook commercieel, bewerken mag, vermelding
  niet verplicht. Niet toegestaan: suggereren dat herkenbare personen iets
  aanbevelen of ergens bij horen (daarom de controle in stap 2 hierboven). We
  vermelden de bron toch onderaan de caption ("Beelden: Pixabay"). Per clip
  wordt bron, id, maker en pagina bewaard.
- **Pixabay-API**: zoekresultaten worden 24 uur bewaard, zoals Pixabay vraagt
  (`.cache/promo-stock`, in GitHub Actions bewaard tussen runs). Bestanden
  worden enkel tijdens het renderen opgehaald en in de MP4 verwerkt, nooit
  rechtstreeks vanaf Pixabay op de site getoond.
- **Muziek**: alleen rechtenvrije tracks die je zelf in de muziekmap zet.
