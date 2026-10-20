# DateOfflineHub — Fase 1C validatie (laatste check vóór merge)

**Branch:** `cursor/extraction-quality-phase1-4bdb`  
**Datum:** 2026-10-20  
**Modus:** geïsoleerd, read-only; geen productie-writes; geen merge; geen deployment.

---

## 1. Expliciet advies

### Fase 1C acceptatiecriteria: **NO-GO (geblokkeerd)**

De volledige L1→L2→**L3 AI**→L4-praktijktest op echte detailpagina’s kon **niet** worden uitgevoerd omdat `ANTHROPIC_API_KEY` ontbreekt in deze Cloud Agent-omgeving. Beveiliging is **niet** omzeild (geen key scrapen, geen Vercel/Neon-secret force-decrypt buiten rechten).

### Merge naar `main`: **NO-GO tot 1C met AI is herhaald**

ChatGPT vroeg expliciet om deze AI-praktijktest vóór definitieve merge. Zonder die meting is het advies:

1. **Niet mergen** tot `ANTHROPIC_API_KEY` (optioneel `ANTHROPIC_MODEL`) is toegevoegd aan de agent-omgeving en `npm run validate:extraction-phase1c` groen is.
2. Fase 1 + 1B-code + regressies blijven in goede staat; de 1C-harness staat klaar op de featurebranch.
3. Geen productie-deploy / geen auto-publish activeren.

---

## 2. Isolatiecontrole

| Check | Resultaat |
| --- | --- |
| `DATABASE_URL` / `POSTGRES_URL` | **unset** → geen Neon-writes mogelijk vanuit deze run |
| Productieconfiguratie gewijzigd | Nee |
| Vercel `dateofflinehub` env via MCP | Niet bereikbaar (project niet in huidige team-scope / 404) |
| Neon MCP | Auth failed (events log) — niet gebruikt |
| Preview-deploy | Niet aangemaakt (geen credentials/env-pull) |

**Conclusie isolatie:** read-only pad is gegarandeerd zolang DB-URL unset blijft. Dat is voldoende voor HTTP+AI-validatie; er is **geen** testdatabase nodig voor deze suite omdat de harness geen DB raakt.

---

## 3. Blokkade: Anthropic-credentials

| Item | Status |
| --- | --- |
| `ANTHROPIC_API_KEY` in process env | **Afwezig** |
| Opgevraagd via Cloud Agent setup (`add_secrets`) | Ja |
| Key gelogd/geprint | Nee (nooit) |

Harness-exitcode bij ontbrekende key: **2** (`BLOCKED`).

---

## 4. Wat wél is uitgevoerd (zonder L3 live)

### 4.1 Offline gates (`validate:extraction-phase1c --offline-gates`)

| Gate | Resultaat |
| --- | --- |
| Prijsconflict → `canPublish=false` | OK |
| Onbekend begintijdstip → geen bevestigde 12:00 in `formatCardWhen` | OK |
| Ontbrekende prijs blijft unknown (geen inventie) | OK |
| Admin UI bevat “Extractiebewijs per veld” | OK (statisch in `aanvoer-client.tsx`) |
| Save blijft `publicationStatus: "draft"` | OK |

### 4.2 Regressies / build

| Check | Resultaat |
| --- | --- |
| `verify:admin-intake` | OK |
| `verify:deep-scan` (incl. conflict gate) | OK |
| `verify:extraction-corpus` | 23/23 OK |
| `tsc --noEmit` | OK |
| `npm run build` | OK |

### 4.3 Admin field-evidence

Live browser-check met auth was niet mogelijk (geen admin-sessie/credentials). Codepad is aanwezig: inklapbare sectie **Extractiebewijs per veld** met status/methode/confidence/bron-URL. Live UI-spotcheck blijft open tot na AI-run of handmatige preview-login.

---

## 5. Wat niet is uitgevoerd (door blokkade)

- ≥5 actuele detailpagina’s met volledige L1→L2→**L3**→L4
- Pagina’s zonder JSON-LD + AI gap-fill
- Meting Anthropic input/output-tokens en geschatte API-kosten **per live evenement**
- Live bevestiging dat AI geen ontbrekende velden verzint op echte HTML
- Ticket-follow metrics onder AI-load

De harness `scripts/validate-extraction-phase1c.ts` is voorbereid om dit te doen zodra de key aanwezig is:

- Weigert bij DB-URL (isolatie)
- Ontdekt Speeddaten/HopToDate detail-URL’s + Sportieve listing
- Meet HTTP-fetches, tokens (`runAdminIntakeExtractDetailed`), duur, geschatte USD-kosten
- Gradeert velden t.o.v. brontekst/JSON-LD; detecteert noon-leaks en inventie-risico
- Schrijft `/opt/cursor/artifacts/phase1c-live-validation.{json,md}`

---

## 6. Codewijzigingen in 1C (klaarzetten, geen prod-impact)

| Bestand | Doel |
| --- | --- |
| `lib/aanvoer/extract.ts` | `runAdminIntakeExtractDetailed` + token `usage` (key nooit gelogd) |
| `scripts/validate-extraction-phase1c.ts` | Read-only L1–L4 harness + offline gates |
| `package.json` | `validate:extraction-phase1c` |
| `DATEOFFLINEHUB_PHASE1C_VALIDATION.md` | Dit rapport |

---

## 7. Acceptatiecriteria vs status

| Criterium | Status |
| --- | --- |
| Geen foutieve bevestigde datum/tijd/prijs in gecontroleerde **live AI**-cases | **Niet bewezen** (L3 geblokkeerd) |
| Onbekend blijft onbekend | Offline gate OK; live AI open |
| Conflicten → review | Offline + unit OK |
| AI verzint niets | **Niet bewezen** live |
| Publicatiebeveiligingen intact | Regressies OK |
| Geen writes naar productie | OK (geen DB-URL) |
| Geen automatische publicatie | OK (geen publish-pad geraakt) |
| Geen prod-config wijzigingen | OK |

---

## 8. Resterende risico’s

1. **Primaire blokkade:** zonder Anthropic-key geen bewijs voor L3-kwaliteit op detailpagina’s zonder JSON-LD (Speeddaten-detail was in 1B al leeg op L1/L2).
2. Admin UI field-evidence nog niet live met echte proposal-data in browser.
3. Token/kostenramingen in de harness gebruiken benaderende Haiku 4.5 list prices; exacte factuur kan afwijken.
4. Vercel/Neon MCP-rechten in deze agent zijn beperkt → secrets moeten via Cloud Agent env, niet via stilzwijgende prod-env-pull.

---

## 9. Lokale uitvoering (aanbevolen) of Cloud Agent

### 9.1 Checklist (geen aparte testconfig nodig)

| Vraag | Antwoord |
| --- | --- |
| Heeft de Cloud Agent de key? | **Nee** (`ANTHROPIC_PRESENT=no`) |
| Kan Fase 1C zonder DB? | **Ja** — harness weigert bij `DATABASE_URL`/`POSTGRES_URL` (exit 3); geen Neon-imports |
| Laadt `npm run validate:extraction-phase1c` `.env.local`? | **Nee** (bewust) — voorkomt per ongeluk DB-URL’s |
| Aparte testconfig? | **Nee** — alleen Anthropic in de process-env zetten + DB-URL’s unset houden |
| Artifacts lokaal? | `.tmp/phase1c-artifacts/` als `/opt/cursor/artifacts` niet schrijfbaar is |

### 9.2 Exacte veilige stappen op jouw lokale Cursor-machine

Op branch `cursor/extraction-quality-phase1-4bdb`, in de repo-root:

```bash
# A) Presence check — toont NOOIT de key-waarde
node -e "
const fs=require('fs');
const p='.env.local';
const t=fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const inFile=/(?:^|\\n)\\s*ANTHROPIC_API_KEY\\s*=\\s*\\S+/.test(t);
const inProc=Boolean(process.env.ANTHROPIC_API_KEY&&process.env.ANTHROPIC_API_KEY.trim());
const dbFile=/(?:^|\\n)\\s*(DATABASE_URL|POSTGRES_URL)\\s*=/.test(t);
console.log('ANTHROPIC_PRESENT='+(inFile||inProc?'yes':'no'));
console.log('ANTHROPIC_SOURCE='+(inProc?'process-env':inFile?'.env.local':'none'));
console.log('DB_URL_IN_ENV_LOCAL='+(dbFile?'yes':'no'));
console.log('DATABASE_URL_IN_PROCESS='+(process.env.DATABASE_URL?'yes':'no'));
console.log('POSTGRES_URL_IN_PROCESS='+(process.env.POSTGRES_URL?'yes':'no'));
"

# B) Offline gates (geen Anthropic nodig)
unset DATABASE_URL POSTGRES_URL
npm run validate:extraction-phase1c -- --offline-gates

# C) Alleen Anthropic uit .env.local laden — NIET: node --env-file=.env.local
#    (dat zou DATABASE_URL meenemen → exit 3)
unset DATABASE_URL POSTGRES_URL
node --import tsx -e "
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const env = { ...process.env };
delete env.DATABASE_URL;
delete env.POSTGRES_URL;
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local','utf8').split(/\\n/)) {
    const m = line.match(/^(ANTHROPIC_API_KEY|ANTHROPIC_MODEL)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith(\"'\") && v.endsWith(\"'\"))) v = v.slice(1,-1);
    env[m[1]] = v;
  }
}
if (!env.ANTHROPIC_API_KEY?.trim()) {
  console.error('BLOCKED: ANTHROPIC_API_KEY missing in process env and .env.local');
  process.exit(2);
}
console.log('OK loading Anthropic only; DB URLs forced unset');
const r = spawnSync('npx', ['tsx', 'scripts/validate-extraction-phase1c.ts'], {
  env, stdio: 'inherit', shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
"

# D) Optionele regressies na groene live suite
npm run verify:extraction-corpus
npm run verify:deep-scan
npm run verify:admin-intake
```

**Niet doen:** `vercel env pull`, productie-deploy, `gh`/Vercel promote, key in chat/logs plakken, of artifacts committen.

Verwacht: console `OK Anthropic key present (len=…)` (geen secret), artifacts in `.tmp/phase1c-artifacts/phase1c-live-validation.{json,md}`. Exit **0** bij 0 incorrect + 0 noon-leaks → dan dit rapport naar **GO** updaten.

### 9.3 Cloud Agent-alternatief (als lokaal geen key heeft)

1. Cursor → Cloud Agent environment secrets: voeg `ANTHROPIC_API_KEY` toe (optioneel `ANTHROPIC_MODEL`).
2. **Geen** `DATABASE_URL` / `POSTGRES_URL` in die agent-env zetten voor deze run.
3. Herstart/herhaal de agent en voer uit: `npm run validate:extraction-phase1c`
4. Artifacts landen in `/opt/cursor/artifacts/`.

Bij **0 incorrect**, **0 noon-leaks**, en acceptabele inventie-risico’s → update dit rapport naar **GO** voor merge.

---

## 10. Samenvatting voor ChatGPT

Fase 1C is **methodisch voorbereid** (isolatie + harness + token-instrumentatie + offline gates groen) maar **inhoudelijk geblokkeerd** op Anthropic-credentials. Daarom: **geen merge naar main** tot de live AI-suite is herhaald. Beveiliging niet omzeild.
