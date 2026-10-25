# DateOfflineHub

> OfflineRadar was renamed to DateOfflineHub.


Prototype om offline activiteiten te ontdekken waar je nieuwe mensen kunt ontmoeten.

Geen betalingen, geen chat. Tickets blijven bij de organisator. Een account is optioneel (Google-login bewaart voorkeuren en bewaarde activiteiten).

Productie toont de gepubliceerde events uit Neon (`OFFLINERADAR_EVENTS_CANONICAL_FEED=1`). Lokaal zonder database draait de site op fictieve testevents uit `data/events.ts`.

```bash
npm install
npm run dev
```

Open daarna [http://localhost:3000](http://localhost:3000).
