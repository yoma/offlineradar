# DateOfflineHub — Autopilot Phase 2A report

**Branch:** `cursor/autopilot-organizer-discovery-4b09`  
**Scope:** veilige organizer-discovery (draft / `promising` only)  
**Merge/deploy:** niet uitgevoerd (wacht op expliciete vraag)

## Verdict

**GO voor review op feature branch.** Phase 2A foundation staat: query matrix, bounded sweep, kill switch (default OFF), cron route, admin filter `discovered_by=agent`, offline verify groen.

**Niet** productie-activeren tot kill switch bewust op `1` gezet wordt na review.

## Wat er is

| Onderdeel | Pad |
| --- | --- |
| Query matrix (REGIO × TAAL × FORMAT) | `data/discovery/query-matrix.ts` |
| Sweep orchestrator | `lib/discovery/sweep.ts` |
| Agent provenance | `lib/discovery/agent-provenance.ts` |
| Kill switch / caps | `lib/discovery/sweep-config.ts` |
| Web search (Bing/DDG + optional Anthropic) | `lib/discovery/web-search.ts` |
| Route A heuristics | `lib/discovery/heuristics.ts` |
| Manual / dry-run script | `scripts/run-discovery-sweep.ts` |
| Offline verify | `scripts/verify-discovery-sweep.ts` |
| Cron | `app/api/cron/discovery-sweep/route.ts` |
| Schedule | `vercel.json` → `30 5 * * *` |
| Admin filter | Bronnen → herkomst **Autopilot (agent)** |

## Invarianten (afgedwongen)

1. Geen auto-publish; sweep schrijft alleen `catalog_sources`.
2. Nieuwe hits: `status=promising`, `refresh_enabled=false`, notes `discovered_by=agent`.
3. Nooit `discovered_by=user` verzinnen of overschrijven.
4. Instagram/Facebook = signal only (niet als primary URL opgeslagen).
5. Aggregators low priority (niet inserten in 2A).
6. Kill switch `OFFLINERADAR_DISCOVERY_SWEEP` default OFF; cron no-op zonder `=1`.
7. Wallonië default OFF (`OFFLINERADAR_DISCOVERY_WALLONIE=1` om te openen).
8. Blind-recall: geen merknamen in matrix-queries.
9. Zelfde `CRON_SECRET` Bearer-auth als source-refresh.

## Hoe te draaien

```bash
npm run verify:discovery-sweep
npm run discovery:sweep                  # dry-run
# write (na review + env):
OFFLINERADAR_DISCOVERY_SWEEP=1 npm run discovery:sweep:write
```

## Out of scope (bewust)

- Auto `refresh_enabled=true`
- Event draft import / promote-drafts cron
- Instagram scraping / Meta posting
- AI auto-approval van publicatie

## Volgende stap (na merge + expliciete enable)

1. Admin bekijkt Autopilot-bronnen in Bronnen-filter.
2. Mens enable follow per bron → bestaande source-refresh neemt over.
3. Pas daarna eventueel Phase 2B (striktere AI Route A/B op page fetch, bredere regio).
