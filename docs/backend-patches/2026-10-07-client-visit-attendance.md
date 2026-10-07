# Backend patch — attendance + panels cleaned on the client visit report

**For:** `sowash-backend/routes/customerJobHistoryRoutes.js`, route `GET /:schedule_id/detail`
(the client app's visit report, `app/job/[id].tsx` and the chat visit popup).
**Why:** the staff Jobs sheet shows the crew's attendance (who clocked in/out, when, photos); the
client report didn't, because this endpoint never selected it. The app side is already done and
renders an **Attendance** section as soon as the response carries `attendance`.

**Why a patch file and not an edited route file:** the only backend checkout on this PC
(`Desktop/sowash-backend`) dates from 21 Sep and is missing the October chat work (rings, typing,
reactions, paging). Uploading a file edited from that copy would remove those features from the
live server. Apply the two additions below to the **live** file instead (download it from the VPS
with WinSCP first), then upload it and `pm2 restart`.

No migration — it only reads existing tables (`attendance`, `field_service_reports`).

## The change

In `scheduleQuery` inside `router.get('/:schedule_id/detail', …)`, the SELECT list ends with:

```sql
        fsr.customer_signature,
        fsr.additional_notes
      FROM site_schedules ss
```

Change it to (add a comma after `fsr.additional_notes`, then the two new columns):

```sql
        fsr.customer_signature,
        fsr.additional_notes,
        fsr.total_panels_cleaned,
        -- Crew attendance for this visit — the same json_agg the staff
        -- GET /schedule/history uses (routes/schedulingRoutes.js), so both apps
        -- receive the identical shape. COALESCE keeps it [] (not null) when
        -- nobody clocked in against this job.
        (SELECT COALESCE(json_agg(
           json_build_object(
             'fo_name', a.fo_name,
             'clock_in_at', a.clock_in_at,
             'clock_out_at', a.clock_out_at,
             'status', a.status,
             'clock_in_image_url', a.clock_in_image_url,
             'clock_out_image_url', a.clock_out_image_url
           ) ORDER BY a.clock_in_at
         ), '[]'::json)
         FROM attendance a WHERE a.job_id = ss.id) AS attendance
      FROM site_schedules ss
```

Nothing else in the route changes: the row is already returned as `job`, so the two new fields
ride along. The visibility gate (`approval_status = 'approved' OR scheduled_date = CURRENT_DATE`)
still applies — attendance is only shown for visits the client may already see.

## Check after deploy

1. `pm2 logs` — no SQL error on opening a visit in the client app.
2. Open a completed, approved visit whose crew clocked in → the report shows **ATTENDANCE · N ON SITE**
   with names, in/out times, time on site and the clock-in/out photos.
3. A visit with no attendance rows still opens normally (the section is just absent).

## Decision to confirm

The clock-in/out photos are crew selfies. The staff app already shows them; with this patch the
**client** sees them too. If that isn't wanted, drop the two `*_image_url` lines from the
`json_build_object` (the app then shows names and times only).
