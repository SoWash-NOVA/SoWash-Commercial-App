# CLAUDE.md — SoWash Commercial App

This file is a full map of this repository and the backend it talks to, built by reading every
source file in both. It exists because neither repo had project documentation when this was
written (2026-09-17). Keep it updated as the code changes — it will go stale otherwise.

---

## 1. What this app is

**SoWash Commercial** is an Expo / React Native mobile app for the site managers of SoWash's
commercial and industrial (C&I) solar-cleaning clients. It is the **B2B sibling** of the
residential `sowash-customer-app` — same design language, different accent color (teal
`#0F766E` vs. residential's `#2E6BFF`), different density (tables over hero cards), and a
structurally different data model: a commercial client has **many sites**, not one address.

- Stack: Expo SDK ~57, `expo-router` (file-based routing), React 19, React Native 0.86,
  TypeScript (strict), `react-native-reanimated` 4 (installed but **not used** — see §6),
  Firebase Cloud Messaging via `@react-native-firebase/*` for push.
- No self-registration. Accounts are created by SoWash staff and linked to a
  `commercial_clients` row; the login screen has no sign-up path by design.
- Backend: a shared Node/Express + PostgreSQL API (`sowash-backend`, separate repo) — see §7.

---

## 2. Repository layout

```
app/                          expo-router file-based routes
  _layout.tsx                 root layout: providers, auth-gate redirect, push init
  (tabs)/_layout.tsx          5-tab shell: Overview, Visits, Sites, Support, Account
  (tabs)/index.tsx            Overview — next visit, KPIs, recent visits
  (tabs)/jobs.tsx             Visits — full history list, scope tabs, search
  (tabs)/sites.tsx            Sites — the client's estate, tap to filter + jump to Visits
  (tabs)/support.tsx          Support — one chat thread per account
  (tabs)/profile.tsx          Account — identity, contract info, privacy, sign out
  job/[id].tsx                One visit's full detail (route wrapper around JobDetailBody)
  maintenance/index.tsx       Maintenance task list (contract-level, not site-level)
  maintenance/[id].tsx        One maintenance task detail
  walkthrough/[id].tsx        Full-screen SLD (single-line diagram) walkthrough viewer
  notifications.tsx           The bell — notification feed
  login.tsx                   Email + password sign-in
  privacy.tsx                 In-app privacy policy (must mirror docs/privacy-policy.html)

src/
  api/client.ts                axios instance, token storage, photo URL resolution, error parsing
  api/types.ts                 TypeScript types transcribed from the backend SELECT lists
  auth/AuthContext.tsx         session state, sign in/out, restores session from SecureStore
  site-context.tsx             the multi-site "which site am I looking at" filter (persisted)
  theme.ts / theme-context.tsx design tokens + runtime-switchable accent color
  hooks.ts                     every data hook (useAsync-based) + formatting/status helpers
  push.ts                      FCM registration, permission flow, notification-tap routing
  contact.ts                   shared contact email constant
  components/
    JobCard.tsx                one visit row, shared by Overview + Visits list
    JobDetailBody.tsx           the 5-section visit report, shared by the route AND the chat popup
    SldWalkthrough.tsx          the animated diagram walkthrough (hand-rolled Animated, not Reanimated)
    ChatVisitCard.tsx           rich "about this visit" preview card inside a chat bubble
    SiteSwitcher.tsx            header control for picking the active site
    MeshBlob.tsx, StatusBar.tsx  decorative bits

plugins/withFcmNotification.js  Expo config plugin: FCM tray icon/color, works around a
                                 manifest-merger conflict between expo-notifications and
                                 @react-native-firebase/messaging
docs/privacy-policy.html        hosted privacy policy (Play Console links here) — keep in
                                 sync with app/privacy.tsx by hand
```

---

## 3. Data flow

Every screen follows the same shape: a hook from `src/hooks.ts` built on the shared `useAsync`
helper (load / refresh / error, with a generation counter to guard against stale responses
overwriting fresh ones), talking to `src/api/client.ts`'s axios instance.

- **Auth**: email + password → `POST /customer-portal/auth/login` → a 30-day JWT
  (`kind: 'portal'`) stored in `expo-secure-store` under key `portalToken` (namespaced so the
  residential app's `customerToken` can coexist on one phone). Token is attached by an axios
  request interceptor; a 401 response interceptor clears the token and redirects to `/login`.
- **Site filter**: `SiteContext` wraps the tab navigator (not the root), fetches
  `/customer-portal/client/sites`, and persists the chosen site id in SecureStore. `null` means
  "All sites" and is a legitimate state, not "unset."
- **Photos**: `before_photos`/`after_photos` on a visit are a `text` column holding a **JSON
  array**, not a Postgres array — always go through `parsePhotos`/`photoUrl`/`photoUrls` in
  `src/api/client.ts`, never straight into `<Image>`. `photoUrl()` has three legacy-path
  branches ported from the web portal, plus one **new** branch: a bare filename (no `/`)
  resolves to `/uploads/<name>` — the old fallback produced a URL with no separating slash,
  which is the exact bug that silently hid every photo in the residential app for months (the
  SPA catch-all answers a malformed URL with `index.html` + 200, so `<Image>` never fires
  `onError`).
- **Dates**: `scheduled_date` is a `DATE` column — render it from its string parts
  (`formatDateOnly`, `relativeDay`), **never** through `new Date()` + a timezone conversion, or
  it shifts a day. Timestamp columns (`started_at`, `completed_at`, chat `created_at`, …) DO
  carry a real instant and are rendered in `Asia/Karachi` (PKT) per the workspace-wide
  convention — see `formatDateTime`/`formatTime` in `src/hooks.ts`.
- **Money/size fields** (`total_system_size`, `sales_price_before_tax`, etc.) are `VARCHAR` in
  the schema, not numeric — they arrive as strings like `"1,250,000"` or `"300 kW"` and must be
  parsed, not summed, on the client.
- **Push**: `src/push.ts` registers an FCM token once signed in (`POST
  /customer-portal/push/register`) and listens for foreground messages / notification taps,
  routing via `notificationTarget()` in `src/hooks.ts` — the same function the notifications
  screen uses, so a tap from the tray and a tap from the feed can never disagree about where
  they go. Everything in `push.ts` is `Platform.OS === 'web'`-guarded and try/catch-wrapped so
  the web preview (`expo start --web`) and a build with no Firebase config both degrade to
  "polling only" instead of crashing.

---

## 4. Backend API surface this app uses

All mounted under `https://app.sowashusa.com/api/customer-portal` (see `SERVER_BASE` in
`src/api/client.ts`). Backend source: `sowash-backend/routes/customerJobHistoryRoutes.js` (data)
and `sowash-backend/routes/portalAuthRoutes.js` (login).

| Endpoint | Purpose |
|---|---|
| `POST /auth/login` | email+password → 30-day `kind:'portal'` JWT |
| `GET /customer/profile` | the `commercial_clients` row (contract, contact, sizes) |
| `GET /stats` | KPI counts — **client-wide, not site-filtered** (no `site_id` param) |
| `GET /history` | visit list — `scope=past\|upcoming\|all`, `site_id`, `search`, `limit`/`offset` |
| `GET /:schedule_id/detail` | one visit + its FSR (field service report); only returns approved visits, or one scheduled today |
| `GET /client/sites` | every site under this client |
| `GET /maintenance-history`, `/maintenance-stats`, `/maintenance/:id/detail` | contract-level maintenance tasks — **no site column exists**, so these never take a `site_id` |
| `GET /sld/:schedule_id` | the site's single-line diagram + pins + this visit's before/after photos per pin |
| `GET/POST /notifications*`, `/push/register` | bell feed, unread count, mark-read, FCM registration |
| `GET/POST /chat*` | the one support thread for this account (polled, not websocket) |

Two backend behaviors the app's UI is built around:
- **Approval gating**: a completed visit is invisible to the customer (`/history`, `/stats`,
  `/:id/detail`) until CI admin approves it (`status != 'completed' OR approval_status =
  'approved'`). A `crew_started` push/notification can therefore deep-link to a visit that
  404s the next day if it still isn't approved — the app's job-detail screen renders "not
  available yet" for this case rather than swallowing the tap (see the comment in
  `app/notifications.tsx`).
- **`has_sld_walkthrough`** is computed only in `/history`'s SELECT (an `EXISTS` subquery), not
  in `/:id/detail`. `JobDetail` in `src/api/types.ts` `Omit`s the field on purpose so using it
  on the detail screen is a compile error; that screen instead calls `/sld/:schedule_id`
  directly and decides with `sldHasWalk()`.

---

## 5. Design system

`src/theme.ts` is shared in spirit with `sowash-customer-app`'s theme — same component
language (cards, tabs, pills, spacing) — differing only in accent color and density. If a
style change here isn't commercial-specific, the residential app probably wants it too.
Accent is user-selectable (Account tab) and held in `ThemeProvider` (`src/theme-context.tsx`),
default `#0F766E`.

---

## 6. Non-obvious things worth knowing before touching this code

- **No Reanimated despite it being installed.** `react-native-reanimated` v4 is in
  `package.json` but imported nowhere — this project has no `babel.config.js`, and v4 worklets
  need `react-native-worklets/plugin` registered there. `SldWalkthrough.tsx` uses the built-in
  `Animated` API instead (everything it animates is opacity/scale/rotate/translate, which the
  native driver handles natively).
- **RN 0.86's types dropped `StyleSheet.absoluteFillObject`** — spreading it now fails
  typecheck. Places that need a full-bleed overlay write the four `position/left/right/top/
  bottom` properties out by hand instead (see `SldWalkthrough.tsx`, `ChatVisitCard.tsx`).
- **Express 5 rejects inline regex route params** (`/:id(\d+)`) at `require()` time and takes
  the whole backend API down, not just that route — this doesn't affect this repo directly but
  matters if you're reading backend route code alongside it: ids are always validated inside
  handlers instead.
- **`site_schedules.status` is free-text**, written by several screens over several years.
  Always compare case-insensitively; `isCompleted()` in `src/hooks.ts` prefix-matches
  `complet%` because both `'completed'` and `'complete'` exist in production data.
- **`commercial_sld_points.x_percent`/`y_percent`** are typed loosely
  (`number | string | null`) in `src/api/types.ts` because the column is Postgres `numeric`,
  which `node-postgres` returns as a **string** to avoid float precision loss — confirmed
  against the live schema (see §8). Always coerce through `pointXY()` in `SldWalkthrough.tsx`.
- **Privacy policy duplication**: `app/privacy.tsx` (in-app) and
  `docs/privacy-policy.html` (hosted, linked from the Play Console) must be changed together —
  there is no shared source. `PRIVACY_EMAIL` in `src/contact.ts` is a domain-based **guess**
  (`privacy@sowashusa.com`) — no real contact address existed anywhere in the codebase when it
  was added.
- **Account deletion is staff-mediated, not self-service.** "Close my account" opens a
  prefilled `mailto:` rather than calling a delete endpoint — deliberately, since these logins
  belong to an organization and one employee deleting the account would take the whole
  company's access with it.

---

## 7. The backend (`sowash-backend`, sibling repo)

One Express monolith on a single shared `pg.Client` (not a pool — see the transaction caveat
below) serves **four different client apps** off one main PostgreSQL database, plus a second,
fully isolated Postgres connection for a Mideast/NOVAA region:

| App | Mount prefix | Auth |
|---|---|---|
| **This app** (commercial portal) + its web portal | `/api/customer-portal/*` | `kind:'portal'` 30-day JWT (mobile) or legacy 12h staff JWT (web) |
| `sowash-customer-app` (residential) | `/api/customer-app/*` | Firebase phone-OTP → 30-day JWT |
| Staff/ops console (`sowash-frontend`) | `/api/{scheduling,ci-admin,attendance,userRoutes,...}` | 12h staff JWT, no `kind` claim |
| Mideast region | `/api/mideast/*` | separate JWT, separate `md_users` table, **separate database connection** (`mideastClient`) — no query anywhere spans both databases |

Cross-cutting patterns worth knowing if you ever touch backend code:
- **One emitter per notification domain.** `notifyScheduleEvent`/`notifyJobEvent`/
  `emitChatReply` (in `services/commercialNotifications.js` / `customerNotifications.js`) are
  the *only* place a feed row + push get written, because the underlying tables are written
  from multiple independent route files (e.g. both `ciFOSchedulesRoutes.js` and
  `ciAdminApprovalRoutes.js` touch `site_schedules`). Emitting inline at each call site is how
  the residential app first learned this lesson (see the header comments in those files) — a
  dedupe unique index (`uq_commercial_notifications_event`, `uq_customer_notifications_job_event`)
  backs this up at the DB level.
- **FCM modules never `require('./firebaseAdmin')` at the top.** That module builds its
  service-account object at module scope from `process.env.FIREBASE_PRIVATE_KEY` — multiple
  code comments (in `services/commercialPush.js`, `customerPush.js`, `staffPush.js`,
  `routes/customerAppRoutes.js`) assert this env var is unset in `.env` and that requiring it
  would throw at require-time and crash the whole process. **This is now stale**: the local
  `.env` checked during this review *does* have all six `FIREBASE_*` vars populated, including
  what looks like a real PEM private key. Worth re-verifying which is actually true before
  trusting either the comments or this note.
- **No SQL transactions across requests.** `config/db.js` exports a single shared `pg.Client`,
  not a `Pool` — a `BEGIN` is process-global, so a `ROLLBACK` in one request's handler can
  discard an unrelated concurrent request's writes. Code that needs atomicity uses a
  claim/finalize state machine on the row itself instead (see
  `routes/attendanceReviewRoutes.js`'s `pending → approving → approved` dance, documented at
  length in `docs/attendance-review-queue.md`).
- **PKT (`Asia/Karachi`, UTC+5) vs. the VPS's own clock (documented as UTC+2, no DST)** is a
  recurring source of off-by-one bugs. `DATE` columns are always rendered from their string
  parts, never through a `Date` object; `timestamp without time zone` columns are written and
  read back correctly only because `node-postgres` round-trips them through the **same**
  process-local clock — a comment in `routes/attendanceReviewRoutes.js` calls out that a fixed
  SQL `+ interval` offset (rather than a real JS `Date` boundary) silently misdated punches
  between 22:00–24:00 PKT for months before it was caught.

### 7.1 Known issue: 7 files missing from the local checkout

As of 2026-09-17, these files are `require()`d by code that loads at server-startup or
route-registration time, but are **absent from disk and absent from git history** in this
checkout (not merely untracked — confirmed via `git log --all --diff-filter=A`):

- `middleware/demoAnonymizer.js` — required at the top of `server.js` itself; this alone means
  `node server.js` would throw `MODULE_NOT_FOUND` and fail to boot as currently checked out.
- `middleware/portalAuth.js` — the auth boundary for **this app's own API**
  (`authenticatePortal`, `signPortalToken`), required by `routes/customerJobHistoryRoutes.js`
  and `routes/portalAuthRoutes.js`.
- `middleware/customerAuth.js` — residential app's auth boundary.
- `middleware/mideastAuth.js` — required by all 12 files under `routes/mideast/`.
- `config/mideast_db.js` — the `mideastClient` Postgres connection, required by all
  `routes/mideast/*` files and `services/regions/mideastProvider.js`.
- `utils/cleanFilter.js` — the "hide test data / pre-cutoff history" toggle, required by
  `routes/schedulingRoutes.js` and `routes/attendanceRoutes.js`.
- `utils/commercialChatVisit.js` — builds the visit-tag preview card, required by
  `routes/commercialChatRoutes.js` and `routes/customerJobHistoryRoutes.js` (i.e. **this app's
  own chat feature depends on this missing file**).

Best guess: these live only on the deployed VPS (the team's own workflow syncs files by hand
via WinSCP, per `docs/attendance-review-queue.md`) and were never pulled into this local clone.
Re-verify with a fresh `find`/`ls` before relying on this — it's a live fact, not a permanent one.

### 7.2 Routes referencing tables absent from the current schema dump

Two route files query tables that don't exist in the current database (§8) — these would 500
at request time (not crash at boot). Likely dead/legacy, superseded by newer tables:
- `routes/ciClientsRoutes.js`, `routes/ciFoTaskRoutes.js` — use `ci_clients`, `ci_client_sites`,
  `ci_site_jobs`, `ci_job_tasks`, `ci_task_templates`, `ci_task_classifications`, `ci_fsrs`
  (an older prototype schema, superseded by `commercial_clients`/`commercial_sites`/
  `site_schedules`).
- `routes/maintenanceJobRoutes.js` — uses `maintenance_jobs`/`maintenance_job_tasks`, distinct
  from the `maintenance_schedules`/`maintenance_task_templates` tables this app and the CI
  console actually use (via `routes/ciMaintenanceRoutes.js` /
  `routes/customerJobHistoryRoutes.js`).

### 7.3 Dead files (confirmed, harmless)

`routes/diagrams.js` (root of `routes/`) and the root-level `ciFOSchedulesRoutes.js` /
`routes/ciFOSchedulesRoutesold.js` are byte-identical stale copies of files that *are* mounted
(`routes/commercial-sld/diagrams.js` and the current 2111-line `routes/ciFOSchedulesRoutes.js`
respectively). Confirmed via `grep` that none of the three are `require()`d anywhere — safe to
ignore or delete.

---

## 8. Database schema (main DB — not Mideast)

Source: a `pg_dump` of the live database (`database dump file/dumb-file.sql`, ~145MB with data;
schema-only extraction is ~3,000 lines). 58 tables. Core commercial chain, with `ON DELETE`
behavior:

```
commercial_clients (1) ──┬─→ commercial_sites (cascade)
                          ├─→ commercial_teams (via team_lead_user_id/user_id → users, no cascade)
                          ├─→ commercial_chat_threads (cascade, UNIQUE per client_id — one thread per client)
                          ├─→ commercial_notifications (cascade)
                          ├─→ maintenance_schedules (cascade)
                          └─→ ci_client_mandates (cascade, 1:1 via UNIQUE client_id)

commercial_sites (1) ──┬─→ site_schedules (cascade)
                        ├─→ commercial_sld_diagrams (cascade)
                        └─→ monthly_schedule_summary (cascade)

site_schedules (1) ──┬─→ field_service_reports (cascade, 1:1 via schedule_id)
                      ├─→ commercial_sld_point_photos / _annotations / _string_flags (cascade)
                      ├─→ commercial_chat_messages.schedule_id (SET NULL — the visit tag)
                      ├─→ commercial_notifications.schedule_id (cascade)
                      ├─→ schedule_history (cascade, via a trigger: log_schedule_change())
                      ├─→ attendance.job_id (SET NULL)
                      └─→ tracker_data.job_id (cascade)

commercial_sld_diagrams (1) ─┬─→ commercial_sld_points (cascade)
                              └─→ commercial_sld_strings (cascade) ─→ commercial_sld_string_flags (cascade)

users (1) ──┬─→ commercial_teams (team_lead_user_id, user_id)
            ├─→ commercial_chat_thread_reads, commercial_fcm_tokens, user_fcm_tokens (cascade)
            └─→ users.client_id → commercial_clients (SET NULL — links a portal login to its client)
```

Parallel residential chain (unrelated to this app): `new_customers` (business key
`"Cust_id"`) → `sales_orders` → `job_orders`, with its own `customer_chat_*`,
`customer_notifications`, `customer_fcm_tokens` tables mirroring the commercial ones almost
exactly.

Notable constraints:
- `site_schedules` has **two** equivalent unique constraints on
  `(site_id, scheduled_date, service_number)` (`site_schedules_unique_service` and
  `unique_site_date_service`) plus one on `(client_id, scheduled_date, service_number)` —
  redundant, not a bug, just schema debt.
- `commercial_notifications` type is CHECK-constrained to `crew_started | visit_approved |
  chat_reply`; `customer_notifications` (residential) to a 6-value set including
  `job_rescheduled`.
- A Postgres role `claude_ro` has been granted `SELECT` on every table in this dump, plus
  default privileges for future tables — this is almost certainly what the `postgres` MCP
  server configured for this session (currently failing to connect) is meant to use for live
  read-only DB access, rather than re-dumping.

---

## 9. The wider SoWash ecosystem

Sibling repos checked out under `D:\github\nova\`:
- **`sowash-backend`** — covered above.
- **`sowash-customer-app`** — the residential Expo app this repo's `theme.ts`/`hooks.ts`/
  `api/client.ts` are explicitly ported from (see in-file comments).
- **`sowash-frontend`** — the staff/web console.
  `src/components/ChatVisitCard.tsx` here is the customer-side twin of
  `sowash-frontend/src/pages/CI/ChatJobPreview.js` — both render the identical
  `message.visit` payload.
- **`sowash-fo-app`** — the field-officer mobile app; referenced only in passing (a cautionary
  precedent in `plugins/withFcmNotification.js` about background message handlers).
- **`sowashrobotics`** — present on disk, not referenced by any code read so far.

---

## 10. Changelog — completed tasks

Newest first. Each entry: what changed, in which file(s)/repo, and deploy status (this
backend's deploys are **manual** — WinSCP sync + `pm2 restart` on the VPS, nothing here
auto-deploys, so "fixed" below means "fixed in this working tree," not "live").

### 2026-09-21 — New feature: "Documentation" menu (Site SLD, TBT, Safety Training, Equipment Inspection)

**What was added:** a new "Documentation" entry point (link tile on Overview + row in Account,
`app/documentation/index.tsx`), matching the existing Maintenance pattern — not a 6th bottom tab,
since `app/(tabs)/_layout.tsx` is a hand-built fixed 5-slot layout with a raised centre Support
button that a 6th tab would require reworking. Four destinations:

- **Site SLD** (`app/documentation/site-sld.tsx`) — no new backend. There is no site-scoped SLD
  endpoint this app can reach (the staff-only `GET /api/commercial-sld/diagrams/site/:siteId`
  explicitly 403s any token with a `kind` claim — see `middleware/auth.js` — so this app's portal
  JWT can't use it). This screen instead lists completed visits with `has_sld_walkthrough` (from
  `/history`) and opens the existing `/walkthrough/[id]` route unchanged.
- **TBT** — ⚠️ initially built wrong. First pass assumed TBT had no existing backend (based on
  the user's own description of the ask) and pointed it at a brand-new, empty table. It does not:
  TBT photos have a real, already-populated capture pipeline — the FO app's
  `POST /schedule/:id/tbt-photos/photo` stages them into
  `site_schedules.temp_voltage_photos`, which gets copied into
  `field_service_reports.temp_voltage_photos` at FSR-creation time (see
  `ciFOSchedulesRoutes.js`). A completed job can easily already have TBT photos sitting there.
  Caught only because the user asked "why isn't TBT showing" after deploying — the empty new
  table was never going to have anything in it. **Fixed**: `GET /documentation/tbt`
  (`customerJobHistoryRoutes.js`) now reads `field_service_reports.temp_voltage_photos` directly,
  handling both shapes that column can hold (current FO app: array of
  `{ url, client_photo_id, taken_at }`; staff manual upload or a pre-staging FO build: array of
  bare path strings, no per-photo timestamp — falls back to the FSR's `created_at`). No upload
  endpoint was needed for TBT at all — it already existed.
- **Safety Training** — genuinely new; confirmed via repo-wide grep that no photo-documentation
  equivalent exists anywhere (the only pre-existing "safety training" hit is an unrelated yes/no
  compliance field on `employee_evaluations`).
- **Equipment Inspection** — no new screen; the tile deep-links straight to the existing
  `/maintenance` route. It IS the maintenance feature, just exposed under this second name too.

**Backend (`sowash-backend`):**
- `docs/migrations/2026-09-21-commercial-documentation-photos.sql` — new table
  `commercial_documentation_photos`. **Applied** (user ran it by hand on 2026-09-21). Per the TBT
  correction above, this table is **Safety Training only in practice now** — its `schedule_id`
  column and the `tbt` half of its CHECK constraint are harmless vestigial leftovers (nothing has
  ever inserted `type='tbt'` here, and nothing will); not worth a second ALTER on a table that was
  still empty when this was noticed.
- `routes/ciDocumentationRoutes.js` — `POST /api/ci-admin/documentation`, staff-authenticated,
  multipart upload, **Safety Training only** (the `tbt` type option was removed once the above
  was caught). This is the contract the **not-yet-built** web portal upload UI is expected to
  call — building that UI is separate, future work (per the user: "in frontend we will add it on
  our frontend web"). Mounted in `server.js`.
- `routes/customerJobHistoryRoutes.js`, two new routes: `GET /documentation/tbt` (reads
  `field_service_reports`, see above — gated the same way a job's own photos are,
  `status != 'completed' OR approval_status = 'approved'`, since it's tied to a specific visit)
  and `GET /documentation/safety-training` (reads `commercial_documentation_photos`, no such gate
  — not tied to a schedule row).

**App:** `src/api/types.ts` (`TbtPhoto` — note `id` is a synthetic `${schedule_id}-${index}`
string, not a real row id, since one FSR can hold several TBT photos in one JSON array —
`SafetyTrainingPhoto` + response types), `src/hooks.ts` (`useTbtPhotos`,
`useSafetyTrainingPhotos`), and the four screens under `app/documentation/`.

**Second bug caught after deploy:** the three new screens under `app/documentation/` initially
called `useSiteContext()` for a site filter. That throws (`useSiteContext must be used inside a
SiteProvider`) — `SiteProvider` only wraps `(tabs)/_layout.tsx`
(needs a session; nothing outside the signed-in tab area uses it), and `app/documentation/*` are
root-level stack screens (siblings of `/maintenance`, `/walkthrough/[id]`), same as those already
are. **Fixed** by dropping the site filter entirely, matching `/maintenance`'s own established
convention (also a root-level screen, also has no site switcher) — each row/card just shows its
own site name instead.

**Not done / blocked on the user's team:** the actual Safety Training upload UI on
`sowash-frontend`. Until that exists, that screen shows a normal, correct empty state ("No safety
training photos yet") — not a bug, there is simply nothing uploaded yet. TBT should show real
data as soon as the backend files below are deployed, for any client with a completed job that
already has TBT photos.

**Status:** app-side code typechecks clean (`npm run typecheck` — one pre-existing, unrelated
error remains in `app/(tabs)/_layout.tsx`, not touched by this change). Migration has been
applied to the database. **Backend code (`customerJobHistoryRoutes.js`, `ciDocumentationRoutes.js`,
`server.js`) had not been confirmed deployed to the VPS as of this entry** — until it is, neither
new GET endpoint exists on the live server.

### 2026-09-21 — Investigated: completed job showing as "in progress" in the app (this occurrence — not a code bug)

**Symptom reported:** a specific job that showed as completed in the web portal
(`sowash-frontend`) was showing as "in progress" in this app.

**Two independent, unrelated mechanisms can produce this symptom** — worth checking both before
assuming it's the 2026-09-17 status-vocabulary bug below:

1. **The 2026-09-17 fix itself, if still undeployed.** `site_schedules.status` gets written with
   an invented string instead of `'completed'` — see the entry below. Still true as of this date:
   the fix exists in the backend working tree but has not been uploaded/deployed.
2. **The `approval_status` gate** (separate column, unrelated to `status`).
   `customerJobHistoryRoutes.js`'s `/history` query filters with
   `(ss.status != 'completed' OR ss.approval_status = 'approved')` — a job that is genuinely
   `status = 'completed'` but still `approval_status = 'pending'` is invisible to this app's
   `/history`/`/stats` until a CI admin approves it via the web portal
   (`ciAdminApprovalRoutes.js`, `PUT /job-approvals/:id/approve`). That endpoint itself refuses
   to approve anything where `status != 'completed'` (`"Only completed jobs can be approved"`),
   so **if the Approve option is actually offered/clickable for a job in the web portal, its
   `status` is already correctly `'completed'`** — the vocabulary bug is not in play for that
   job, and mechanism (2), not (1), is the explanation.

**Resolution for this occurrence:** confirmed mechanism (2) — approving the job via the web
portal's CI approval queue immediately fixed the app's display. No code change was needed; this
was purely an un-approved completed visit, working as designed (see §4 "Approval gating"), not a
bug. The 2026-09-17 fix below remains a real, separate, still-undeployed issue — re-check
mechanism (1) if this symptom recurs for a job where Approve is *not* yet available (i.e.
`status` itself looks wrong, not just `approval_status`).

**Status:** no code changed. Diagnostic note only, so the next time this symptom is reported the
approval gate is checked before assuming a redeploy is needed.

### 2026-09-17 — Status vocabulary mismatch: completed jobs showing wrong/unrecognized status

**Symptom reported:** a job that was actually completed was showing as "in progress" (or an
otherwise wrong status) in the app.

**Root cause:** `sowash-backend/routes/schedulingRoutes.js`'s `PUT /edit/:schedule_id`
endpoint (the staff web portal's manual schedule editor) auto-derives `site_schedules.status`
from whichever timestamp columns are set, but used invented strings —
`'after_photos_uploaded'`, `'before_photos_uploaded'`, `'reached_location'` — that don't match
the canonical vocabulary used everywhere else: not the DB's own documented CHECK values
(`scheduled, started, before_photos, after_photos, completed, cancelled, rescheduled`), not
what the FO app's own completion flow writes (`ciFOSchedulesRoutes.js` uses `'before_photos'`/
`'after_photos'`, no suffix), and not what this app's `statusMeta()`/`isInProgress()`
(`src/hooks.ts`) or the backend's own `/stats` `inProgress` filter recognize. A job edited
through that endpoint (e.g. an admin correcting a timestamp after the fact) could land on a
status string none of the readers understand — and if the edit request re-submitted an empty
`completed_at`, the same logic could regress an already-completed job's status entirely.

**Fix (`sowash-backend/routes/schedulingRoutes.js`):**
- Changed the derived values to the real vocabulary: `'after_photos'` (was
  `'after_photos_uploaded'`), `'before_photos'` (was `'before_photos_uploaded'`).
- Removed the `reached_location_at → 'reached_location'` branch entirely — the FO app itself
  never advances status on reaching location (only `/start` does), so a row with only that
  timestamp set correctly stays `'scheduled'`.
- Updated the adjacent FSR-auto-creation check (`fsrMilestoneStatuses`) from
  `['after_photos_uploaded', 'completed']` to `['after_photos', 'completed']` — it would
  otherwise have silently stopped firing once the derivation above stopped producing the old
  string.
- Confirmed via repo-wide grep: no other code (either repo) referenced the old strings.

**Status:** fix was written, then **reverted** on 2026-09-21 (`git restore
routes/schedulingRoutes.js`) — see that date's entry above. The 2026-09-21 investigation traced
that day's actual reported symptom to the `approval_status` gate, not this bug, and it was
decided the fix wasn't needed at that time. **The underlying bug described above is still live
on the deployed server** — this file is back to matching production, invented status strings and
all. Re-apply this fix if a job is ever found with `status` itself holding one of the invented
strings (as opposed to a merely-unapproved `'completed'` row).

### 2026-09-17 — Date off-by-one: jobs scheduled "today" showing as the previous day

**Symptom reported:** a job assigned/scheduled for today was displaying as scheduled for the
previous day.

**Root cause:** `site_schedules.scheduled_date` / `maintenance_schedules.scheduled_date` /
`commercial_clients.contract_start_date` are Postgres `DATE` columns. Selected raw (no cast),
the `pg` driver auto-converts them to a JS `Date` at local midnight **in the server process's
own timezone** (the VPS runs UTC+2). Express's `res.json()` then serializes that via
`.toISOString()`, which for a positive UTC offset always rolls the date backward into the
previous UTC day (e.g. `2026-09-18 00:00 +02:00` → `"2026-09-17T22:00:00.000Z"`). The app reads
the date portion of that string and shows the wrong (earlier) day. This app's own date-parsing
code (`formatDateOnly`/`relativeDay` in `src/hooks.ts`) was already correct — the corruption
happened server-side before the string ever reached the client.

This is a previously-known bug pattern in the same backend: `ciFOSchedulesRoutes.js` (the FO
app's routes) already has this exact fix applied in 9 places, each commented `✅ FIXED: Added
TO_CHAR to scheduled_date`. It had just never been applied to `customerJobHistoryRoutes.js` —
the one file that serves this app's API.

**Fix (`sowash-backend/routes/customerJobHistoryRoutes.js`):** wrapped every raw date-column
SELECT in `TO_CHAR(column, 'YYYY-MM-DD')`, matching the established pattern — 7 spots across
`/history`, `/:schedule_id/detail` (`scheduled_date` and `original_date`), `/today`,
`/maintenance-history`, `/maintenance/:id/detail`, and `/customer/profile`
(`contract_start_date`). Left `commercial_sites.installation_date` alone — same latent bug, but
that field is fetched and never actually rendered anywhere in this app's UI.

**Status:** fix was written, then **reverted** on 2026-09-21 (`git restore
routes/customerJobHistoryRoutes.js`), for the same reason as the status-vocabulary fix above —
not related to that day's actual reported symptom, and decided not needed at that time. **The
date off-by-one bug described above is still live on the deployed server.**

---

## 11. Things NOT covered by this file

This documents application architecture and backend contracts — it deliberately does not
duplicate anything derivable by reading the current code (exact function signatures, current
git history/blame, or line-by-line business logic). Re-derive those from the source directly;
treat any specific detail here (a table column, a route path, a file's existence) as a
snapshot from 2026-09-17 and re-verify before depending on it in anything high-stakes.
