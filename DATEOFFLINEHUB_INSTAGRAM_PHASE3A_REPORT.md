# DateOfflineHub — Instagram Autopilot Fase 3A

**Branch:** `cursor/instagram-autopilot-phase3a-183e`  
**PR:** https://github.com/yoma/offlineradar/pull/50  
**Status:** Visuele review (geen Meta-publicatie, geen merge/deploy zonder GO)

---

## 1. Doel van deze fase

Instagram (@dateofflinehub) voorbereiden zonder de bestaande eventscanner of Autopilot-env te verstoren.

Gewenst resultaat:

1. Herkenbaar DateOfflineHub-logo en website op elke slide  
2. Professionele, aantrekkelijke Instagrambeelden (1080 × 1350)  
3. Correcte aankomende gepubliceerde evenementen  
4. Objectieve selectie + variatie  
5. Minimale handmatige tussenkomst (preview + goedkeuren/onthouden)

---

## 2. Wat er gebouwd is

### Preview & workflow

| Onderdeel | Locatie |
|---|---|
| Admin-preview | `/interne-instagram` (nav: **Instagram**) |
| Image API | `/api/instagram/image?kind=…` (admin-only) |
| Goedkeuren | Onthoudt event-ids lokaal (`.data/…`); **publiceert niet** |

Flow: selecteer events → render afbeelding + caption → preview → optioneel “goedkeuren (onthouden)”.

### Kernmodules (`lib/instagram/`)

| Module | Rol |
|---|---|
| `selection.ts` | Objectieve eventselectie (geen AI-“leukste”) |
| `captions.ts` | NL-captions uit Event-feiten |
| `templates/slides.tsx` | Visuele 4:5-templates |
| `templates/shared.tsx` | Logo-header, footer, CTA, petal-chrome |
| `mood.ts` | Generieke sfeerbeelden (activity-matched) |
| `render.tsx` | `next/og` ImageResponse |
| `drafts.ts` | Concepten (slides + caption) |
| `history.ts` | Conceptgeschiedenis (anti-herhaling) |
| `meta-readiness.ts` | Notities voor latere Graph API |
| `assets.ts` | Officieel logo + fonts |

### Formats

- **A — Binnenkort te beleven:** overzicht + carrouselslides per event  
- **B — Deze week / Nog iets gepland?:** compact overzicht  
- **C — Nieuw op DateOfflineHub:** nieuwere / latere publicaties  

### Selectieregels (objectief)

1. Alleen gepubliceerde consumer-events (`listEvents`)  
2. Geen sold-out; geen Wallonië (ticker-geo)  
3. Prioriteit: 0–7 dagen → 8–14 → later (recent gepubliceerd)  
4. Soft caps: max 2× zelfde activiteit / organisator; max 2 Brussel  
5. Herhaling vermijden via conceptgeschiedenis  

### Captions

- Templates in het Nederlands  
- Feiten enkel uit Event-data  
- Verwijzing naar `dateofflinehub.be` / link in bio  
- Beperkte hashtags; geen verzonnen beschikbaarheid  

---

## 3. Visuele evolutie (wat we leerden)

### Ronde 1 — eerste oplevering

Typografische “poster”-stijl (bordeaux vlak, weinig sfeer).  
**Niet goedgekeurd:** te affiche-achtig, te weinig merkgevoel.

### Ronde 2 — premium referentie (lifestyle)

Sfeerfoto’s + cream cards + gouden CTA’s, volgens aangeleverde mockups.  
**Feedback:**

- “Binnenkort **op** DateOfflineHub” is verkeerd: events staan al op de site; ze zijn binnenkort **te doen**  
- Rode/bordeaux full-bleed wash te zwaar (website is cream, geen rood scherm)

### Ronde 3 — huidige richting (combo)

Combinatie van:

- Cream canvas zoals de website  
- Zachte foto-header (geen zware rode overlay)  
- Petal-datumicons / strakke rijen (inspiratie upcoming-events stijl, maar licht)  
- Copy: **“Binnenkort te beleven”**  
- Officieel logo, slogan, `dateofflinehub.be`, `@dateofflinehub`  

Sfeerbeelden zijn generiek; eventslides markeren **sfeerbeeld** (geen claim dat het foto’s van dat event zijn).

---

## 4. Huisstijl & assets

- Logo: `public/brand/dateofflinehub-logo.png` (geen nieuw logo)  
- Kleuren: bordeaux `#67283A`, goud `#D4AF37`, cream `#F9F2EA` (`lib/brand/tokens.ts`)  
- Fonts: Bricolage Grotesque + DM Sans (zelfde als site)  
- Slogan: *Minder swipen, terug echte connecties*  

---

## 5. Wat we bewust níet deden

- Geen Meta Graph API / geen posts naar Instagram  
- Geen wijziging Autopilot-env of eventscanner  
- Geen forceren van nieuwe scans  
- Geen merge / productie-deploy  
- Geen nieuwe betaalde diensten  

---

## 6. Meta later (voorstel)

Nodig: Instagram Professional + Facebook Page, Meta App, Graph-permissions, server tokens.  
Zie `lib/instagram/meta-readiness.ts`. **Nog niet aangesloten.**

Publicatievoorstel (niet geautomatiseerd):

- 2–3 feedposts/week bij genoeg geschikte events  
- Stories voor activiteiten binnen ~3 dagen  
- Geen post bij te weinig events  

### Kosten (indicatief)

- Organic Graph publish: geen Meta per-post fee bij normaal gebruik  
- ImageResponse: binnen bestaande Vercel serverless  
- Captions fase 3A: templates (gratis); AI-polish later apart goedkeuren  

---

## 7. Testen

| Check | Resultaat |
|---|---|
| `npm run verify:instagram-phase3a` | OK |
| Live PNG-render 1080×1350 (Neon published events) | OK |
| Admin-preview `/interne-instagram` | OK |
| Carrousel Slide 1 (Playwright / headless Chrome) | OK — wisselt cover → event; eerdere “klik doet niets”-melding was false negative (trage render 1–3s) |

---

## 8. Git-commits op deze branch

1. `Add Instagram Autopilot Phase 3A preview and image templates`  
2. `Redesign Instagram templates to premium lifestyle reference`  
3. `Improve Instagram preview carousel feedback while slides render`  
4. `Lighten Instagram visuals: cream canvas, petal dates, clearer copy`  
5. `Add stable test ids for Instagram preview carousel tabs`  

**Diff t.o.v. main:** ~19 files, ~3060 insertions (nieuwe Instagram-module + preview).

---

## 9. Hoe te bekijken

1. Branch / PR #50  
2. Lokaal of preview: `/interne-instagram`  
3. Artifacts (laatste renders):  
   - `ig-format-a-cover.png` — Binnenkort te beleven  
   - `ig-format-a-event-slide.png` — individuele eventslide  
   - `ig-format-b-deze-week.png` — Deze week  

---

## 10. Open voor jouw GO

- Visuele fine-tuning (petal-vorm, foto’s, spacing)  
- Daarna pas: Meta-koppeling / automatische publicatie  
- Optioneel: Neon-tabel i.p.v. lokale conceptgeschiedenis  

**Geen productie zonder expliciete GO.**
