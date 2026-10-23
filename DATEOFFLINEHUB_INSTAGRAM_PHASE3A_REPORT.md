# DateOfflineHub — Instagram Autopilot Fase 3A

Visuele voorbeelden + eenvoudige preview. Geen Meta-publicatie.

## Preview

- Afgeschermde adminpagina: `/interne-instagram`
- Gerenderde PNG’s: `/api/instagram/image?kind=…` (1080×1350)
- Navigatie: interne admin → **Instagram**

## Huisstijl & assets

- Logo: `public/brand/dateofflinehub-logo.png` (geen nieuw logo)
- Kleuren uit `lib/brand/tokens.ts` / `app/globals.css`: bordeaux `#67283A`, goud `#D4AF37`, cream
- Typografie: Bricolage Grotesque + DM Sans (zelfde als website)
- Op elke slide: logo + `dateofflinehub.be`; slogan waar passend
- Handle: `@dateofflinehub`

## Objectieve selectie

Module: `lib/instagram/selection.ts`

1. Alleen gepubliceerde consumer-events (`listEvents`)
2. Geen sold-out, geen Wallonië (zelfde geo-focus als website-ticker)
3. Prioriteit: 0–7 dagen → 8–14 dagen → later (recent gepubliceerd)
4. Format B: alleen 3–7 dagen vooruit
5. Format C: mid/later, gesorteerd op recentheid
6. Soft caps: max 2× zelfde activiteit, max 2× zelfde organisator, max 2 Brussel
7. Herhaling vermijden via `.data/instagram-concept-history.json` (na “goedkeuren”)

## Carrousels

- Format A: cover “Binnenkort…” + 1 slide per event (4–6)
- Format B: één overzichtsslide “Deze week nog iets gepland?”
- Format C: cover “Nieuw…” + eventslides
- Templates: `lib/instagram/templates/slides.tsx` (aanpasbaar zonder Meta-code)

## Captions

- Template-NL in `lib/instagram/captions.ts` (feiten uit Event; geen AI-verzinsels)
- Website / link in bio; beperkte hashtags
- Geen “plaatsen beschikbaar” tenzij later expliciet bevestigd in data

## Meta-koppeling (later)

Zie `lib/instagram/meta-readiness.ts`. Nodig: IG Professional + Page, Meta App, Graph permissions, server tokens. **Niet geactiveerd.**

## Kosten (indicatief)

- Organic Graph publish: geen Meta per-post fee bij normaal gebruik
- Vercel ImageResponse: binnen bestaande serverless
- Fase 3A captions: gratis (templates). Optionele AI-polish later apart goedkeuren

## Planning (voorstel, niet geautomatiseerd)

- 2–3 feedposts/week wanneer genoeg events
- Stories voor activiteiten binnen ~3 dagen
- Geen post bij te weinig geschikte events
- Geen merge/productie-deploy zonder GO
