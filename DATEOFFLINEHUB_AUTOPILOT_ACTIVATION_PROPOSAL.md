# DateOfflineHub — Gecontroleerde autopilot-activatie

Zie ook `/opt/cursor/artifacts/DATEOFFLINEHUB_AUTOPILOT_ACTIVATION_PROPOSAL.md`.

## Verdict

**Huidige productie is niet veilig genoeg om globals blind aan te zetten** (87× `refresh_enabled`).  
PR `cursor/autopilot-controlled-activation-4b09` voegt allowlists + harde draft-cap toe.  
**Activeer kill switches pas na merge/deploy van die PR**, met onderstaande env.

## Voorgestelde Production env

```
OFFLINERADAR_SCHEDULED_REFRESH=1
OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS=975fc9d7-2639-4e03-9139-a588af62b869
OFFLINERADAR_REFRESH_AUTO_DRAFT=1
OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS=975fc9d7-2639-4e03-9139-a588af62b869
OFFLINERADAR_REFRESH_AUTO_DRAFT_MAX_PER_SOURCE=10
```

`OFFLINERADAR_DISCOVERY_SWEEP` blijft uit. Geen auto-publish.

## Impact

- Cron 06:00 Europe/Brussels; alleen Sportieve Singles.
- ≤10 nieuwe concepten per thorough run; dedupe behouden.
- Twijfel → Nakijken; geverifieerd → Klaar.
- Published count ongewijzigd zonder handmatige publicatie.
