# Instagram promo-reels

Eén keer per week een reel die mensen naar dateofflinehub.be trekt: echte
sfeerbeelden (Pexels, Pixabay als aanvulling), een korte hook, per clip een
korte zin en een call-to-action. Events zijn hooguit een bijzaak.

- **Stap 1** (deze branch): config, tekst via Claude, clipselectie, 3
  templates en `npm run promo:test`. Er wordt niets gepubliceerd.
- **Stap 2**: in de wachtrij met dezelfde goedkeuring, afkeuren met keuze
  (nieuwe tekst, nieuwe beelden, allebei), publicatie als reel op het eigen
  tijdstip.

## Zelf bijsturen

Alles staat in `config/promo-reels.ts`: thema's (briefing, voorbeeldhooks,
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
   Pexels, Pixabay erbij als Pexels weinig vindt. Alleen clips die scherp genoeg
   zijn voor 1080x1920 (staand, of 4K liggend om bij te snijden) en lang genoeg.
   Al gebruikte clips vallen af. Claude bekijkt de voorbeeldbeelden en geeft
   scores op sfeer (warm licht, duo's of groepjes, niet geposeerd, geen tekst of
   logo's). Onder 6/10: volgende zoekterm uit het thema. Niets bruikbaar: een
   Pexels-foto met een trage zoom (Ken Burns).
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

Nodig: `ANTHROPIC_API_KEY` en `PEXELS_API_KEY` (`PIXABAY_API_KEY` optioneel),
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
| `ANTHROPIC_API_KEY` | Vercel, GitHub secret | tekst en beeldkeuze |
| `PEXELS_API_KEY` | Vercel, GitHub secret | stockvideo en foto's (verplicht) |
| `PIXABAY_API_KEY` | Vercel, GitHub secret | extra stockvideo (optioneel) |

## Licenties

- **Remotion**: gratis voor individuen en bedrijven tot 3 medewerkers; een
  eenmanszaak valt daaronder. Daarboven is een bedrijfslicentie nodig.
- **Pexels** en **Pixabay**: gratis, ook commercieel, bewerken mag, vermelding
  niet verplicht. Niet toegestaan: suggereren dat herkenbare personen iets
  aanbevelen of ergens bij horen (daarom de controle in stap 2 hierboven). We
  vermelden de bron toch onderaan de caption ("Beelden: Pexels"). Per clip
  wordt bron, id, maker en pagina bewaard.
- **Muziek**: alleen rechtenvrije tracks die je zelf in de muziekmap zet.
