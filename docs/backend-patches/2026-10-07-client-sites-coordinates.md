# Backend patch — send site coordinates to the client app (weather card)

**Symptom:** a site has `latitude`/`longitude` filled in the database, but the client app's
Overview → Site weather still says **"No location on file for <site>"**.

**Cause:** the client app gets its sites from `GET /customer-portal/client/sites`
(`sowash-backend/routes/customerJobHistoryRoutes.js`). That query selects only
`id, site_name, address, city, state, system_size, system_type, installation_status,
installation_date` — **not** `latitude`/`longitude` — so the coordinates never reach the app.
The app side already reads them (`extractCoords` in `app/(tabs)/index.tsx` accepts
`latitude`/`longitude`, including the string form node-postgres uses for `numeric`).

**Apply to the LIVE file** (download it from the VPS first — the copy on this PC,
`Desktop/sowash-backend`, is from 21 Sep and missing the October chat work; don't upload a file
edited from it). No migration.

## The change

In `router.get('/client/sites', …)`, the SELECT is:

```sql
      SELECT 
        id,
        site_name,
        address,
        city,
        state,
        system_size,
        system_type,
        installation_status,
        installation_date
      FROM commercial_sites
```

Add the two columns:

```sql
      SELECT 
        id,
        site_name,
        address,
        city,
        state,
        system_size,
        system_type,
        installation_status,
        installation_date,
        latitude,
        longitude
      FROM commercial_sites
```

Then upload and `pm2 restart`.

## Check after deploy

1. In the client app, pull to refresh on Overview (or reopen the app — the site list is cached).
2. Pick the site whose coordinates you entered → **Site weather** shows the temperature.
3. A site without coordinates still shows "No location on file" (expected).

Note: latitude is `numeric(10,8)` (−90…90) and longitude `numeric(11,8)` — if a value was typed
the wrong way round (lat/lng swapped), the weather will be for the wrong place.
