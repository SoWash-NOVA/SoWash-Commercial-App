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

app/staff/                    OFFICE/STAFF mode (a second identity — see 2026-09-28 entry): Overview, Jobs, Chats
                                 (Support + Team), Clients, Account
app/documentation/            Documentation menu: Site SLD, TBT, Safety Training

src/ (additions since the first map — see the 2026-10-0x changelog entries)
  brand.ts                     logo colours + HEADER_STOPS (green-led header gradient)
  dataCache.ts                 in-memory stale-while-revalidate cache behind useAsync (cleared on auth change)
  chat-focus.ts                "a chat is open": hides the tab bars + Android back closes the chat
  useChatScroll.ts             opens chats at the newest message; scroll-up paging for older ones
  top-inset-color.tsx          status-bar strip that matches the page header
  teamChatSocket.ts, staff-context.tsx, photoPicker.ts
  components/                  ChatHeaderBar, PageHeader, ChatBackground, FadeInRow, BubblePhysics (login),
                               FloatingTabBar, PhotoStripList (lazy photo rows/tiles), KeyboardScreen
                               (keeps the composer above the keyboard), ComingSoon

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

- **Light/dark theme works by PATCHING `StyleSheet.create` (src/themeEngine.ts).** The app entry is now `/index.js` (package.json
  `main`), which imports `src/themeEngine` BEFORE `expo-router/entry`. Every stylesheet created after that returns a Proxy that
  serves a lazily-built dark twin when the mode is dark (light backgrounds/borders darkened, dark text lightened, per style
  PROPERTY; mid tones untouched). Rules for new code: (1) never copy a `palette.*` value into a module-level constant used at render
  — read `palette` at render (it is swapped live by `applyPalette`); (2) a colour written INLINE in JSX (not in a stylesheet)
  must go through `tc()` (background/border/gradient stop) or `ttc()` (text/icon); (3) something that must stay as-is in both
  themes (white on the coloured headers, dark text on yellow) uses `keep('#fff')`; decorative light blobs use `soft()`
  (dropped in dark); (4) themeEngine.ts must not import anything that calls StyleSheet.create. The switch remounts everything
  below AuthProvider (src/theme-mode.tsx) and navigates back to where it was made.

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

### 2026-10-05 (hold a visit → attach in chat) — Client: long-press any visit for a WhatsApp-style pop-up; "Attach in chat" links it to a message

Long-press (300ms) a visit — Visits list (`JobCard`), Overview's next-visit hero and "Coming up" rows — opens
`src/components/JobActions.tsx` (one `<JobActionsHost/>` in `app/(tabs)/_layout.tsx`, opened with `openJobActions(job)`): the screen dims,
the visit is shown lifted as a card (site, status, date, service #, address, team lead) with a menu under it — **Attach in chat**
and **View details**. Attach hands the visit to the Support tab through `src/chat-attach.ts` (one-shot store + sequence counter,
because the tab stays mounted), which opens General with that visit already tagged and the keyboard up; the composer shows a
WhatsApp-reply-style "Linked visit" card (removable with ×) and the placeholder "Write about this visit…". Sending uses the
existing visit-tag path (`schedule_id` on POST /customer-portal/chat/messages), so the message carries the visit card for staff
exactly like a tag picked from the calendar button. No backend change. No haptic on long-press (`expo-haptics` isn't installed and
would need a native build). Rendered in both themes incl. the full hold → popup → attach → chat flow; not seen on a device.

### 2026-10-05 (assigned = yellow) — A support conversation assigned to you stays yellow in the Chats list until you close it

`ThreadList` in `app/staff/chats.tsx`: when a thread is `status === 'open'` and `assigned_user_id` is the signed-in staff user, its row gets a
yellow card (`rowAssignedMine`), an amber edge bar + avatar ring, and an "Assigned to you · close when done" pill instead of
"Assigned to <name>". Closing moves it to the Closed tab (so the yellow goes); reassigning it to someone else clears it for you.
Shown to the ASSIGNEE and to org admins (`users."Type"` admin / ci_admin, `isAdminRole`) — admins see "Assigned to X · still open"; everyone else
still sees the plain "Assigned to X" line. **Inside the thread** (staff `ThreadView`), every non-system message between the system note
"X assigned this conversation to Y" and the next "… closed this conversation" / "… removed the assignment" note is drawn yellow
(`assignedSpanIds` + `Bubble assigned`: theirs = light-yellow card with amber border, mine = amber gradient). This matches the
wording the backend PATCH /threads/:id writes — a string coupling, commented at the function. If the loaded page has no such note
but the thread is open + assigned now, all loaded messages count as inside. A conversation closed BEFORE the close note existed
has no end marker, so its stretch runs to the last message. The client app is unchanged. App-only, uses fields the list already
had (no backend change). Rendered in both themes (the pill uses `keep()` so it stays yellow with dark text in dark). Not seen on a device.

### 2026-10-05 (dark theme) — Light / Dark theme, chosen in Account → Appearance (verified by rendering every page, NOT yet seen on a device)

- **How:** see §6's first bullet. New files: `index.js` (entry), `src/themeEngine.ts` (StyleSheet patch, colour maths,
  `tc/ttc/keep/soft`, the dark palette), `src/theme-mode.tsx` (`ThemeModeProvider`: loads the stored choice — SecureStore key
  `appThemeMode` — before the first frame, applies it, `setMode(mode, returnTo)` persists + remounts; `ThemeRemount`),
  `src/components/AppearanceCard.tsx` (Light/Dark tiles with mini previews; on the client AND staff Account screens).
  `src/theme.ts`'s `palette` is now live (`applyPalette`). `app/_layout.tsx`: providers re-ordered (ThemeModeProvider →
  accent → Auth → ThemeRemount → NavTheme (React Navigation Dark/Default theme with our bg) → …), the default status bar follows
  the mode (and `ChatHeaderBar` restores to it), and `RootNavigator` returns to the Account screen after a switch.
  Inline fixes: Overview tiles/date chips/weather, ring status pills, support avatar, team-avatar badge icon, photo tile
  placeholder, blobs (`soft`), search highlight + staff hero white pill/bar (`keep`). Tab-bar icons sit in a `zIndex:1` layer
  above the gradient fill (the web render painted the fill over them).
- **Verified:** typecheck clean; `expo export --platform android` bundles; every page rendered at 390px in BOTH themes with a mock
  API — login; client Overview (top + bottom), site picker, Visits (completed/upcoming), visit detail (top + bottom), Sites,
  Support list, General chat, ring history, Account (top + bottom), Notifications, Maintenance list + task, Documentation + TBT /
  Safety / Site SLD, Privacy; staff Overview (top + bottom), Jobs → client visits → job sheet popup, Clients, Chats (Support list,
  Support thread, Team list, Team thread), Account — no JS errors; and the in-app switch (light→dark→light) stays on /profile and
  persists. **Not covered:** a real device (native shadows/elevation, status bar icons, the remount on a phone), the SLD
  walkthrough (already dark by design), photo viewer, group info / people picker, keyboard states. The harness lived in the
  session scratchpad only; the temporary `metro.config.js`/`app.config.js` it needed were removed.
- **Needs a new native build?** No — JS only (the `main` entry change is picked up by Metro). Reload with `r`.

### 2026-10-05 — Login redesigned from a reference image (wave shapes + illustration); gesture-handler version mismatch found (written, NOT yet seen on a device)

- **Login (`app/login.tsx`)**, from a "Getting Started" reference the user shared, recoloured to the brand green (leading) + sky blue:
  white page, SVG wave shapes top (green top-left, blue down the right) and in the bottom corners, an SVG illustration in the hero
  (GENERAL on purpose — the user asked for no solar imagery: a laptop showing the desktop dashboard with a phone in front showing the mobile app, a green chat bubble, a check badge, sparkles; slow native-driven float), logo + "SoWash Commercial App", a white card
  with underline inputs (label left; email shows a green check when valid, password has a "Show/Hide" link on the right; the focus
  underline is an absolute gradient layer so focus never changes layout), a blue pill gradient "Sign in" button with the arrow on
  the right, and "Powered By iNOVAA.AI" at the bottom. The reference's second button ("Create an Account") was deliberately left
  out — there is no sign-up, and no support address exists to point a help button at. The draggable physics bubbles and doodles are
  gone from the login, so `src/components/BubblePhysics.tsx` is now imported nowhere (left in place). Auth logic and the keyboard
  rule are unchanged. Typecheck clean.
- **Login fit + keyboard (same day, user: "a slight scroll even with no keyboard; the email/password section should come up above
  the keyboard on its own"):** the hero height is now computed so hero + form + footer = exactly the scroll view's height (body,
  footer and viewport measured with `onLayout` while the keyboard is CLOSED; the viewport value only ever grows), and scrolling
  is disabled (`bounces`/`overScrollMode` off) while it fits. `KeyboardAvoidingView` was removed: on `keyboardDidShow` the
  root is measured in the window, the overlap with the keyboard is appended as an empty spacer at the END of the content, and
  the page scrolls so the whole card (fields + Sign in) sits just above the keys (its top edge if the card is taller than the
  space). Works whether Android overlaps (edge-to-edge) or resizes the window. An error box appearing while the keyboard is open
  doesn't re-size the hero until the keyboard closes. NOT seen on a device.
- **Page headers are now blue + green (user: "the green top header — make it SoWash blue and green, and better if possible"):**
  `HEADER_STOPS` (`src/brand.ts`) is a deep-ocean → sky BLUE gradient (`#07324F → #0B5F92 → #1283C4`); `ChatHeaderBar` adds a
  sky-blue glow top-right (`ORB_A`, shared with the status strip so the seam stays invisible), a lime glow bottom-left, and — on
  ROUNDED headers only (every `PageHeader`, the chat list headers) — two layered GREEN SVG waves along the bottom edge, the same
  wave language as the login; rounded headers get `WAVE_H - 6` extra bottom padding so content clears the wave. Flat chat-thread
  headers get the blue + glows but no wave. The chat buttons that used `HEADER_STOPS` (both tab bars' centre button, the client
  ring button, the Team FAB) now read the new `GREEN_STOPS`, so they stay green. NOT seen on a device.
- **Second pass (user: "the colour isn't SoWash's — it should be like the logo — and the design isn't good"):** the navy was
  dropped. Headers are now the LOGO's own sky blue (`#33B8F0` at the top / status strip → `#1A9BE0` at the bottom), a soft white
  sheen top-right (`ORB_A`), a lime glow bottom-left, and on rounded headers a translucent white wave behind a LOGO-LIME
  (`#7EF505`) wave along the bottom — blue over green like the logo's square mark. `PageHeader` titles/subtitles carry a soft
  dark text shadow because white on `#33B8F0` is only ~2.3:1. `GREEN_STOPS` (chat buttons) moved closer to the logo lime
  (`#4CB800 → #6EDB00`). If it still doesn't read well, the alternative is a WHITE header with the logo colours as shapes and
  dark text (like the login) — a bigger change, every header's children are styled white.
- **Third pass (user: "use a gradient, make it aesthetic"):** `HEADER_STOPS` is replaced by `HEADER_GRADIENT` — a HORIZONTAL
  sweep of the logo's colours, `#1C9BE0 → #33B8F0 → #4CC9A0 (aqua-mint) → #6BD81A` (left, where titles sit, is the deepest blue;
  the right stops short of pure lime so white icons still show). Because it is horizontal, `TopInsetFill` now just draws the same
  gradient (the old vertical `barColorAt`/`headerStops`/`MID_STOP` slicing is gone; `BarSpec` is `{colors, locations,
  headerHeight}`). Inside the header: a darkening layer toward the bottom (transparent at the top edge so the seam stays
  invisible), a white sheen orb top-right (in both header and strip), and on rounded headers two frosted WHITE waves instead
  of the lime one.
- **Client Overview redesigned (`app/(tabs)/index.tsx`, user: "make it more appealing/attractive"):** brand colours only (logo blue
  `#1C9BE0/#33B8F0`, logo green, a teal between them, one amber), fixed — no longer the user accent. Sections, each with a blue→lime
  title bar and cascading in via `FadeInRow`: a full-width gradient **Next visit** hero (glass pills for relative day / service
  number, a white date tile, site + city, team lead, "All visits" link), a new **Coming up** list (the 2nd–4th of the 5 upcoming
  visits already fetched — no new request), a horizontal **weather** strip, a **Visits completed X of Y** gradient progress bar
  (completed/total from `/stats`) over four gradient-icon count tiles, two **Quick access** cards (Maintenance, Documentation) and
  the restyled robot card. Data hooks, weather logic and the KPI links are unchanged.
- **Staff Overview redesigned to match (`app/staff/index.tsx`):** a blue→aqua gradient summary hero holding the period pills (glass,
  white when active), the period total and a white completion bar (completed/total); four gradient-icon tiles (Scheduled blue, In
  progress amber, Completed green, Rescheduled coral — not tappable, as before); Quick access cards for Jobs / Clients / Chats; and
  Recent activity as one card with date tiles and status pills. Same data hooks; no extra polling (the chat unread counts stay on
  the tab bar only).
- **Both Overviews calmed down (user: "too multicolour — make it decent, simple and attractive"):** one brand blue + neutrals. The heroes
  are a single-hue blue gradient (`#1689CC → #2EAEE8`) with white rings, no lime glow; every icon chip (tiles, quick access,
  weather, robot) is a soft blue chip with a blue icon instead of per-metric gradients; no tinted corner circles or background
  blobs; date tiles flat light blue with the month in grey; section bars, progress bar and percentage in blue. Colour is left only
  where it MEANS something: status pills (statusMeta) and the robot's green "Cleaning" state.
- **Quick access removed from both Overviews** (user request; on the client side Maintenance and Documentation are still reached
  from the Account tab). **Both tab bars** (`src/components/FloatingTabBar.tsx` staff, `app/(tabs)/_layout.tsx` client): the SELECTED
  item is now a circle filled with `HEADER_GRADIENT` behind a white icon (with a soft blue shadow), its label in `#1C9BE0`; the raised
  centre Chats/Support button uses the same gradient instead of green. `GREEN_STOPS` is now used only by the client ring button and
  the Team FAB.
- **Red screen "undefined is not a function" at `RNGestureHandlerModule.install()`:** the last commit had
  `react-native-gesture-handler ~3.1.0` (and RN 0.86.2) while the uncommitted working tree (after an `expo install --fix`) has the
  SDK-57 version `~2.32.0` (and RN 0.86.3). EAS builds from the commit, so the APK carried 3.1's native code while Metro served
  2.32's JS. Fix: commit `package.json` + `package-lock.json`, then rebuild.

### 2026-10-03 — SESSION SNAPSHOT: everything done in the 2026-10-01 → 10-03 push, and what is still open (read first)

Confirmed working by the user on a device: chats open on the newest message (also on a first open after a Metro `r` reload), the
composer stays above the keyboard, tab bar hidden inside chats, back returns to the chat list. Everything else below was verified by
typecheck + `expo export --platform android` only, NOT on a device.

**Chat features:** Team: `@all`, filters (All/Unread/Groups), failed-send Retry/Delete, reply + swipe-to-reply, emoji reactions + overlay,
admin-only message delete (org `admin`, `DELETE /api/staff-chat/conversations/:id/messages/:mid`). Support parity (staff ↔ client): photo
zoom, search, typing, optimistic send, reactions; reaction push. Per-site "ring" history on the client Support tab, site label on
messages, close/reopen from mobile (warns about waiting sites), several logins per client no longer look like one person.
**Chat loading:** newest 40 messages on open (`limit`/`before_id`/`has_more` on the three message endpoints), older load on scroll-up;
list laid out in one pass and pinned to the end once it has rows; paging only after the user drags.
**Design:** green-led brand header gradient on every page (`PageHeader`/`ChatHeaderBar`), status-bar strip matches, chat wallpaper, list
redesign, green chat buttons, logo-themed login (draggable physics bubbles, "SoWash Commercial App", "Powered By iNOVAA.AI"), "SC" app
icon, Team own-bubbles in logo blue. **Responsiveness:** verified by rendering at 320/360/768px; header/title fixes.
**Performance:** startup no longer blocks on the profile call; lazy/virtualised photo rows with retry (popups, TBT, Safety, Maintenance);
SLD prefetches only neighbouring points; stale-while-revalidate `useAsync`; FlatList tuning + `React.memo(JobCard)`.

**Backend files changed (all need WinSCP upload + `pm2 restart`; NEVER upload the local package-lock.json):** `routes/staffChatRoutes.js`,
`routes/commercialChatRoutes.js`, `routes/customerJobHistoryRoutes.js` (this batch: paging + delete); earlier in the push also
`routes/schedulingRoutes.js`, `services/{chatTyping,staffPush,staffChatNotifications,staffMentionReminders,commercialNotifications}.js`.
**Migrations to have run BEFORE uploading:** `2026-10-01-commercial-chat-reactions.sql`, `2026-10-01-staff-message-reactions.sql`,
`2026-10-01-staff-message-replies.sql`, `2026-10-02-commercial-chat-message-site.sql` (+ `2026-10-01-staff-mention-all.sql`, already applied).
This batch needs NO migration.

**Build:** `eas build --platform android --profile production-apk` (commit first — EAS builds from the git snapshot). The new build is
required for: the SC icon, `@notifee/react-native` (Mentions channel), `expo-image`, `react-native-gesture-handler` root view. Plain JS
changes (everything in this snapshot except those) reload with `r`.

**Still open / known limits:** nothing is committed in either repo; header/login/list visuals and the lag work were not seen/felt on a
device; no server-side thumbnails (would need `sharp` on the VPS); large Android font sizes untested; the user-selectable teal accent still
drives pills/badges next to the green headers (offered to unify — unanswered); admin delete reaches other participants live only if the
WebSocket works through the proxy; client Support chat has no delete and loads its newest 100 without paging; Safety Training upload UI
(web portal) is the web team's task; if a chat ever stops short of the newest message again, the next step is an inverted FlatList.

### 2026-10-03 (open at newest, 3rd pass) — Real cause of "first open is wrong, second open is right": the settle timers started too early (written, NOT yet seen on a device)

User: after a server restart the first open of a chat stopped short of the newest messages; backing out and reopening was perfect. Cause: `useChatScroll`'s settle window and re-pin timers (250–1700ms) started when the SCREEN mounted. On a first open the screen shows a spinner while the network answers (slow right after a restart), so the timers ran out before the list even existed; the second open hydrates from the in-memory cache, so the list is there immediately and the timers hit it. **Fix:** `useChatScroll(listRef, enabled, paging, ready)` — timers, the settling window and the reveal fallback now start when `ready` flips true (the list has rows: `messages.length > 0`), in the two staff threads and the client chat. Combined with the full first-pass layout from the 2nd pass, a first open now behaves like a cached one. Typecheck clean.

### 2026-10-03 (open at newest, 2nd pass) — Root cause: the list only knew an ESTIMATE of its own length (written, NOT yet seen on a device)

User screenshot after the first fix: still ~4 messages short of the bottom (a photo bubble cut off under the composer). Cause: FlatList's default `initialNumToRender` is 10, so with 40 loaded messages the rest are laid out in later batches and `scrollToEnd` lands on an estimated end. **Fix:** both staff thread lists and the client chat list now lay out the whole loaded page in the first pass (`initialNumToRender 60`, `maxToRenderPerBatch 60`, `windowSize 31`, `removeClippedSubviews` off) — a page is ≤40 messages, so this is cheap, and `scrollToEnd` now has the real height. `useChatScroll` additionally re-pins to the end at 250/600/1100/1700ms after opening unless the reader has dragged. If it STILL stops short on a device, the next step is an inverted FlatList (starts at the newest natively) — a bigger refactor because search/jump/paging indices all assume ascending order.

### 2026-10-03 (open at newest) — Chat now opens with the LAST message in view, no scrolling down (written, NOT yet seen on a device)

User: opening a DM/group, the newest message was still below the fold. Likely causes, both in `src/useChatScroll.ts`: (1) the "scrolled near the top → load older" check could fire from our own programmatic scroll mid-layout (offset still ~0), start a 1.5s hold and thereby SUPPRESS the scroll-to-end, leaving the list near the top; (2) `maintainVisibleContentPosition` was active from the first frame and can fight the initial scroll-to-end while bubbles/photos lay out. **Now:** paging only starts after the reader has actually dragged (`onScrollBeginDrag`); for the first 1.8s after open every content-size change re-scrolls to the end (the list keeps growing as bubbles and photos lay out) and the list is revealed 140ms after the last change; `maintainVisibleContentPosition` is switched on only after the first drag. Wired on both staff thread lists. Typecheck clean.

### 2026-10-03 (keyboard) — Chat composer / send button no longer hidden behind the keyboard (written, NOT yet seen on a device)

User screenshot (Android, Team group chat): typing opened the keyboard and the input + send button were half-covered. Cause: the thread screens used `KeyboardAvoidingView behavior="height"`, which on Android edge-to-edge under-compensates (it reads the keyboard height against a frame that isn't in window coordinates). It had been masked by the old 92px tab-bar padding under the composer, which disappeared when the tab bar was hidden inside chats (previous entry). **Fix:** new `src/components/KeyboardScreen.tsx` replaces `KeyboardAvoidingView` in all four chat screens (Support `ThreadView`, `TeamThreadView`, client `ChatThread`, `SiteRings`): it measures itself in the window (`measureInWindow`), compares its bottom edge with the keyboard's top (`endCoordinates.screenY`, also on `keyboardDidChangeFrame` for emoji/suggestion bar changes) and pads the overlap, clamped to the keyboard height. Not done: the people-picker / sheet screens keep their own handling. Typecheck clean, Android bundle builds; verify on the phone that the composer sits right above the keys in a Team chat, Support chat and the client Support tab.

### 2026-10-03 (chat open/back/delete) — Chats open at the bottom with only recent messages, no tab bar inside a chat, back stays in Chats, admin-only delete, blue own bubbles in Team chat (written, NOT yet deployed/tested)

- **Fast open at the bottom + load older on scroll:** the staff-side message endpoints took the OLDEST 500 messages (`ORDER BY id ASC LIMIT 500`) — slow to open, wrong for long chats, and the list then had to scroll a long way down. **Backend (`routes/staffChatRoutes.js`, `routes/commercialChatRoutes.js`, `routes/customerJobHistoryRoutes.js` `GET /chat/messages`):** new optional `limit` (≤200, only without `after_id`) returns the NEWEST `limit` messages oldest-first plus `has_more`; `before_id` pages older. Without `limit` behaviour is unchanged (the web console depends on it). **App:** `CHAT_PAGE = 40` in `src/hooks.ts`; `useStaffChatThread` and `useTeamConversation` fetch the newest 40 and expose `hasMore/loadingOlder/loadOlder`; `src/useChatScroll.ts` now takes `{hasMore, loadingOlder, loadOlder}`, calls it when scrolled within 80px of the top, and suppresses its own scroll-to-end for 1.5s while older messages are prepended (plus `maintainVisibleContentPosition` so the reader keeps their place). It is "40 messages", not "2 days" — a count is predictable. The client's own Support tab still loads the newest 100 (`GET /chat`) with no paging. In-chat search only sees loaded messages (older ones load by scrolling up).
- **Tab bar hidden inside a chat + back stays in Chats (`src/chat-focus.ts`):** `useChatSurface(active, close)` bumps a module counter (read by both tab bars via `useChatOpen()` → they render `null`) and registers the Android back handler that closes the chat to its list instead of leaving for Overview. Used by `StaffChatsScreen` (Support + Team threads) and the client `SupportScreen` (General chat and a site's ring history). `TAB_BAR_CLEARANCE` is now 0 and the composers sit 10px above the bottom since the bar is gone. Back from Group Info inside a Team chat goes back to the chat list, not just to the thread (not refined).
- **Admin-only delete (Team dm + group):** `DELETE /api/staff-chat/conversations/:id/messages/:mid` — 403 unless `users."Type" = 'admin'` (the same org-level check group creation uses; NOT the per-group admin), hard delete (replies → NULL, reactions cascade), socket event `message_deleted` removes the bubble live for others. App: long-press a message → red "Delete" (only for `user.role === 'admin'`), confirm dialog, `deleteMessage()` in `useTeamConversation`. Not done: the Support (client) chat has no delete; if sockets don't work through the proxy other participants see the deletion only after reopening; the inbox preview still shows a deleted last message.
- **Team chat own bubbles are the logo blue** (`#0E78B5 → #2AA9E3` gradient, via `BubbleGradient brand`), instead of the accent-derived green; Support bubbles are unchanged.
- **Deploy:** upload the three backend route files + `pm2 restart` (no migration). The app side needs the new JS; no new native module. Until the backend is uploaded, the app's `limit` param is simply ignored (it would still open, but not paged).

### 2026-10-03 (lag pass) — Screens reopen instantly, chats open at the bottom, photo lists lazy-load everywhere (written, NOT yet felt on a device)

- **Stale-while-revalidate (`src/dataCache.ts`, `useAsync` in `src/hooks.ts`)**: `useAsync(run, deps, cacheName?)` now shows the last result for the same deps immediately (no spinner) and refetches quietly underneath. Every list/detail hook got a cache name (jobs, job detail, stats, sites, SLD, maintenance, TBT, safety, notifications, staff jobs/clients/threads/conversations…). Cache is in-memory only and is cleared in `setToken`/`clearToken` (`src/api/client.ts`) so one account never sees another's data (sign-in, sign-out, 401).
- **Chats open at the bottom (`src/useChatScroll.ts`)**: the list used to paint the oldest messages and then visibly jump to the newest. It is now hidden (opacity 0) until the first scroll-to-end lands (~90ms, 500ms fallback), then shown. Used by Support `ThreadView`, `TeamThreadView` (`app/staff/chats.tsx`) and the client `ChatThread` (`app/(tabs)/support.tsx`). Auto-scroll on new messages is unchanged; search jumps still suppress it.
- **Photos**: TBT strips are now virtualised horizontal lists of `PhotoThumb` (lazy, spinner, tap-to-retry); safety-training and maintenance-detail thumbs use `PhotoThumb`. SLD walkthrough prefetches only the current point and its neighbours instead of every photo at once.
- **Lists**: `initialNumToRender`/`windowSize`/`removeClippedSubviews` tuned on Visits, staff Jobs, Maintenance, Notifications, TBT, Safety; `JobCard` is `React.memo`.
- Verified: `npm run typecheck` clean, Android bundle exports. Not measured on a device; server-side thumbnails (would need `sharp` on the VPS) still not done.

### 2026-10-03 (photos) — Visit-detail popups: faster, and photos load properly on a weak connection (written, NOT yet felt on a device)

User: completed-job popups sometimes lag; with slow internet the pictures should keep loading/scrolling and the popup should be faster.
**Causes found by reading the code:** (1) every photo in each row (Before / After / TBT, plus attendance clock-in/out shots) was mounted at
once — full-resolution camera originals, the backend has no thumbnailing — so opening the popup started a dozen-plus multi-MB downloads in
parallel (on a weak link they all crawl together, none finishes) and decoding them as they landed made scrolling stutter; (2) the content
mounted while the modal was still sliding in; (3) a `ScrollView` wrapped in a `Pressable` wrapped in a `Pressable` (backdrop-tap pattern)
fights for the gesture, which makes scrolling feel sticky on Android; (4) a failed photo just stayed blank. **New
`src/components/PhotoStripList.tsx`:** `PhotoStripList` (horizontal virtualised `FlatList`: `initialNumToRender 2`, `windowSize 3`,
`removeClippedSubviews`, `nestedScrollEnabled`, `getItemLayout` — only photos on/next to the screen mount and download, so there is no 6-photo cap
or "+N" any more, every photo is reachable by scrolling), `PhotoThumb` (fixed-size tile, spinner while loading, **tap-to-retry on failure**,
expo-image `cachePolicy="memory-disk"`, `priority` high for the first two and low for the rest, `recyclingKey`), `PhotoStripSkeleton`, and
`useAfterOpen()` (true after the first frame + interactions + ~220ms so the popup shows its text instantly and the photo rows mount after the slide-in).
**Applied to:** the staff job sheet in `app/staff/jobs.tsx` (Before/After/TBT rows + attendance thumbnails; counts now shown in the section titles),
the client visit report `JobDetailBody` (used by `/job/[id]` AND the chat visit popup), and both popups' containers were changed from
`Pressable > Pressable > ScrollView` to a backdrop `View` with an absolute-fill `Pressable` SIBLING behind the sheet (`ChatVisitCard.tsx`, `staff/jobs.tsx`).
**Not done / honest limits:** no server-side thumbnails — a photo you scroll to still downloads its full original (the real fix for slow networks
is a resized-thumbnail endpoint, e.g. `sharp` on the VPS: a new native dependency to install there, deliberately NOT done now after the earlier
`npm install` incident); `documentation/tbt.tsx`'s own page strips and the maintenance/SLD screens still use plain strips; there is no tap-to-zoom
viewer in these popups. Lag was not measured on a device — verified: typecheck clean, Android bundle builds.

### 2026-10-03 (pre-APK) — Chat buttons green; responsiveness verified by rendering the app at 320/360/768px; fixes found (written)

- **Chat buttons now brand green:** the centre Chats/Support button on BOTH tab bars (`src/components/FloatingTabBar.tsx` for staff,
  and the client app's own copy in `app/(tabs)/_layout.tsx` — they are separate implementations) is a green gradient
  (`BRAND_GREEN_MID → HEADER_STOPS.mid`); the whole bar's active colour (selected icon pill, labels) is `BRAND_GREEN_DEEP` instead of the
  user accent; the Team list's new-chat FAB and the client's "Ring about <site>" button match. (First pass only changed the staff bar —
  the screenshot at tablet width showed the client bar still teal.) The rest of the accent usage (Overview hero, pills, badges) is
  unchanged.
- **Responsiveness check (user: "make sure it is 100% mobile responsive, then I'll build the APK"):** instead of only reading code, the
  app was rendered. Method (all throwaway, in the session scratchpad, since REMOVED from the repo): `expo export --platform web` with an env-gated
  temporary `metro.config.js` aliasing `expo-secure-store` to a `localStorage` shim; a fake HTTPS API (`mock.js`, deliberately LONG names)
  reached via Chrome's `--host-resolver-rules` + `--ignore-certificate-errors`; a Chrome DevTools-protocol driver (`shoot.js`, using the app's
  own `ws`) emulating real phone viewports, seeding a login, clicking through, and screenshotting every client and staff screen at 320, 360
  and 768 px wide. (Chrome headless has a ~500px minimum window width, so plain `--window-size` screenshots of narrow widths are cropped wide
  pages — use `Emulation.setDeviceMetricsOverride`. The bundled `gstack browse.exe` was broken on this machine.) **Found and fixed:**
  (1) the Support-thread header — back + avatar + "Assign" + "Close" + search left the CLIENT NAME ZERO width at 360dp and pushed search
  off-screen at 320dp. Now chips are icon-only below 600px wide (the assignee moves into the subtitle: "Assigned to X"), and the avatar is
  hidden below 340px; tablets keep the text chips. (2) `PageHeader` titles were cut to "Good afternoon, M…" — now
  `adjustsFontSizeToFit` / `minimumFontScale 0.62` (native only: react-native-web ignores it, so this one is NOT visible in the web
  renders — verify on device). Everything else rendered cleanly at all three sizes (login, Overview, Visits, Sites, Support list, ring
  history, General chat, Account, Notifications, Documentation, Maintenance; staff Overview, Jobs, Clients, Chats lists, Support and Team
  threads).
- **NOT verified (be honest about it):** real-device behaviour (the web renders approximate RN's flex layout, not its fonts, shadows,
  elevation, `renderToHardwareTextureAndroid`, or touch/PanResponder feel — the login bubble physics in particular is untested on a phone);
  **large system font sizes** (Android "Font size" settings) — `Text.defaultProps` can't cap scaling under React 19, so very large fonts
  may clip fixed-height elements (tab-bar labels, chips); landscape (the app is portrait-locked in `app.json`); and `Dimensions.get('screen')`
  based logic (login compact mode) was only checked at 320x640 / 360x800 / 768x1024.
- **Also fixed while there:** the long-standing typecheck error in `app/(tabs)/_layout.tsx` (`NavigationHelpers` vs the tab bar's two-method
  prop) is gone via a documented `as never` cast — `npm run typecheck` now has ZERO errors.

### 2026-10-03 (green leads) — Brand GREEN is now the main colour in headers and the login; headers made vivid (written, NOT yet seen on a device)

User: "the main focus colour is the logo's GREEN — you highlighted blue — and use these colours for the login bubbles; the other
pages' headers look low in opacity". **Headers:** `HEADER_STOPS` in `src/brand.ts` is now a green gradient — deep forest `#0A5A0E` at
the top (what the status strip shows) → `#1F8C0B` → vivid `#3DB800` at the bottom — instead of the navy/blue one; the glow orbs are
much stronger (lime orb `0.16 → 0.42`, sky-blue orb `0.2 → 0.38`; `ORB_A` in `top-inset-color.tsx` is shared with the status strip so
the seam stays invisible) — the "low opacity" the user saw was the muted gradient plus faint orbs — and the white subtitles went
`0.82/0.85 → 0.95` for legibility on green. The brightest stop is capped at `#3DB800` on purpose: white on the logo's pure `#7EF505`
is ~1.3:1; the full lime lives in the glows. **Login:** bubbles are now mostly lime (`#D2FF92 → #7EF505`) with two small sky-blue
ones as the accent; focus border/glow, field-label focus colour, the eyebrow, badge icon, input icons, "Powered By iNOVAA.AI" and
the feature dots lead with green (text/icons use `BRAND_GREEN_DEEP #3E9F00` / `BRAND_GREEN_MID #5BC400` because lime is unreadable
on white); the backdrop gradient leans green and the header band tint is light lime. Sky blue is the secondary accent. **Still
inconsistent on purpose (not asked):** the user-selectable accent (default teal) still drives pills, buttons, bubbles, the chat
wallpaper and badges, so they sit next to green headers — offer to unify them to the brand colours.

### 2026-10-03 (login text) — Login line under the logo is now "SoWash Commercial App"

User asked to replace the tagline "Smart site care, powered by AI" (which I had written, not the user) with **"SoWash Commercial App"**
(`local.tagline` in `app/login.tsx`). The user also asked whether the logo should be removed from the login; recommendation given was to
KEEP it (it is the official mark; the page would otherwise be generic) — the logo stays. The AI-POWERED · LIVE REPORTS · SECURE feature
row is unchanged.

### 2026-10-03 (headers) — Every page header now uses the logo's brand gradient (written, NOT yet seen on a device)

User (liking the login's colours): use this colour scheme in the other pages' headers. **New `src/brand.ts`** (BRAND_BLUE
`#33B8F0`, BRAND_GREEN `#7EF505`, BRAND_INK `#0b2a3a`, and `HEADER_STOPS`). `ChatHeaderBar` — which `PageHeader` and every chat
header sit on — no longer derives its gradient from the user's accent: it is a fixed **deep navy-blue → sky blue**
(`#0B3552 → #136FA6 → #2AA9E3`; dark enough for white text — the logo's own `#33B8F0` is too light for it, so it shows up as the
soft glow instead), with the big top-right orb now a translucent **lime** glow and the lower-left orb a sky-blue one. The status-bar
strip (`TopInsetFill`) reads the same `ORB_A` (now carrying `color`), so the seam stays invisible. **Known inconsistency left on
purpose:** only the headers changed — pills, buttons, bubbles, the chat wallpaper and the unread badges still follow the
user-selectable accent (default teal `#0F766E`), which now sits next to blue headers; the Account tab's accent picker no longer
changes the header. If the user wants it unified, the next step is making the chat wallpaper/bubbles/active pills use the brand
colours too (or changing `ACCENT_DEFAULT` — but sky blue is too light for text on white).

### 2026-10-03 (card) — Login "Welcome back" card made more professional (written, NOT yet seen on a device)

The card in `app/login.tsx` is now two parts inside a clipped rounded container (outer view = shadow, inner `cardClip` =
`overflow:hidden`, because one view can't both clip and cast an iOS shadow): a **header band** (very light blue → white
gradient) with a shield-check badge, a small "SIGN IN" eyebrow, "Welcome back" and the line "Use the email address SoWash set
your account up with.", then a **form body** with **labelled fields** ("Email address", "Password" — the label turns brand
blue on focus), white 1.5px-bordered inputs (the absolute focus glow ring is kept, so focus still never changes layout), the
dark ink Sign-in button, and an "Encrypted connection" line under it (true as written: the API is
`https://app.sowashusa.com`). Deliberately NOT added: a "Forgot password?" link — there is no reset endpoint in this app/backend
flow, and a dead control would be worse than none. `renderField` gained a `label` parameter; the old accent bar was removed.

### 2026-10-03 (perf) — Login bubbles lagged → physics loop now runs only during interaction (written, NOT yet felt on a device)

User: "the movement of the bubbles is lagging". Cause: `BubblePhysics` ran its rAF loop FOREVER (idle drift lived in JS) and
pushed ~12 `setValue`s across the JS→native bridge every frame even with nobody touching anything — too much for a budget
phone. **Rebuilt:** motion is two layers summed natively with `Animated.add`: (1) the idle float is plain native-driven
`Animated.loop`s (zero JS per frame), (2) the physics offset is `setValue`d from the rAF loop, which now **starts on touch and
stops itself when every bubble is at rest** (within ~0.8px and <8px/s, then snaps exactly home), writes only axes that changed
by >0.02px, and writes the HELD bubble straight from the touch event (less latency under the finger). Each bubble has
`renderToHardwareTextureAndroid` so a move transforms a cached bitmap instead of redrawing two gradients. The sim lives in a
non-React `createEngine(...)` (one engine per hook instance, memoised), so re-renders (typing in the form) don't recreate it.
Verified headless: the loop reaches rest and stops (~7s after a hard throw at the old 0.4px threshold; looser now). Not
verified: actual frame rate on the phone — if it still stutters while dragging, the next levers are fewer bubbles, dropping the
shadow views, or skipping collision checks between far-apart pairs.

### 2026-10-03 — Login bubbles: glossy spheres restored + real physics (drag, collide, drift home) (written; physics maths run headless, NOT yet felt on a device)

User: the soap bubbles were too light — bring back the earlier look — and make them draggable with collisions that slowly
return home. **New `src/components/BubblePhysics.tsx`:** `useBubblePhysics(specs, screenW, screenH)` + `PhysicsBubble`.
One `requestAnimationFrame` loop: each bubble springs toward a gently drifting home (idle float replaces the old Animated
loops), circle–circle collisions with mass ∝ r², restitution 0.9 and overlap separation, a grabbed bubble acts immovable
(shoves, isn't shoved) and carries the smoothed finger velocity so a throw transfers momentum, soft screen limits, speed
clamp 1600px/s. Positions go to per-bubble `Animated.Value`s via `setValue` (native transforms). **Constants were tuned with
a headless Node run of the exact maths:** SPRING 5.5/DAMPING 3.0 came home in ~1.4s (too snappy) → **1.8 / 2.2 ≈ 3.2s**,
slightly underdamped. **Touch design:** the bubbles sit BEHIND the form, so they can't take touches themselves; the
login's root `KeyboardAvoidingView` carries a `PanResponder` that claims a touch in the **capture phase only when it lands
on a bubble and not on the form card** (card rect = `cardY − scrollY`, tracked via `onScroll` + `onLayout`), so inputs and
scrolling are untouched everywhere else. Bubbles use the FIRST-pass look (saturated gradient, window-light highlight)
but with a drawn shadow view instead of Android `elevation` — elevation would lift them above the logo/form regardless of
sibling order. Bubble homes use `Dimensions.get('screen')` (not the window, which shrinks with the keyboard). Replaces
`SoapBubble` (deleted). Risks to check on device: responder capture vs ScrollView/TextInput feel, frame rate with 6 bubbles
(14 `setValue`/frame), and bubbles overlapping the logo at rest.

### 2026-10-02 (last) — Login: "childish" feedback → refined, bubbles kept (written, NOT yet seen on a device)

User: better, but childish; likes the bubbles. Kept the floating bubbles and redrew them as delicate **soap bubbles**
(`SoapBubble` in `login.tsx`: clear body, 1.2px+ iridescent blue→lime rim via a padded `LinearGradient`, a crescent
highlight made from a ring with only the top/left borders coloured, slow rise + sway); seven of them, mostly small.
Removed the candy: no glass "sticker" plate under the logo (it sits straight on the backdrop), the chips became a quiet
uppercase text row with dots, the card dropped the rainbow border for a hairline + a 44px brand-gradient bar, the
fields lost the inset lip, and the **Sign-in button is dark ink (`#0b2a3a`) with the lime arrow chip** instead of a
glossy blue toy (press = a 2% scale-in). Entrance is a plain fade-up. Brand blue/lime are now accents. If the user
prefers the brand-blue button back, it is `local.btn`'s gradient only. Edge-to-edge/insets, keyboard rule, auth logic
and "Powered By iNOVAA.AI" are unchanged.

### 2026-10-02 (late night) — Login: depth ("looks 2D") + the design now reaches under the status bar (written, NOT yet seen on a device)

- **Depth pass on `app/login.tsx`:** layered diagonal gradient backdrop (`#F7FBFF → #DFF1FC → #E9F8D8`), faint blue doodles,
  four glossy gradient **spheres** (window-light highlight, tinted shadow) that bob slowly (transform-only
  `Animated.loop`, native driver); the logo sits on a frosted **glass plate** with a diagonal sheen; the form card has a
  blue→lime **gradient edge** (outer `LinearGradient` with 1.5px padding) and a big soft shadow; inputs are **inset** (darker top
  lip, white bottom edge) with an absolute **focus glow ring** (so focus never changes layout — keyboard rule intact); the
  Sign-in button has real **thickness** (a darker base `View`, the face translates 4px down on press) with a gloss band;
  entrance animation (logo springs in, card rises). Auth logic untouched.
- **Status-bar area (user: "the design should also be on the top side where date and signal show"):** the root shell was
  painting its pale background (SafeAreaView top padding) plus `TopInsetFill` over that area. Now `app/_layout.tsx` has a
  `Shell` that reads `useSegments()` and uses `edges={[]}` on the **login route only** (every other route keeps
  `['top','bottom']`), `TopInsetFill` returns `null` on login, and `login.tsx` adds `insets.top`/`insets.bottom` back as
  padding on its CONTENT — so the gradient and spheres run edge to edge, under the clock/signal and the nav bar. Icons stay
  dark (the backdrop is light). Risk to check: segments are empty on the very first frame, so the shell briefly has top
  padding before `/login` resolves.

### 2026-10-02 (night) — Login rebranded around the SoWash logo (trial) + "SC" app icon (written, NOT yet seen on a device; icon needs a new native build)

- **Login (trial, login page only — the user wants to see it before rolling the look out):** `app/login.tsx` rewritten
  around the real logo file (`assets/sowash-logo.png`, 1004×248 RGBA; colours sampled from it: blue `#33B8F0`, green
  `#7EF505`). Light page on `palette.bg`, faint blue doodles (`ChatBackground tone="plain" color=…` — third tone added),
  soft blue/green blobs, the logo large at the top with the tagline + three chips, a white card with the logo's two-colour
  square as a mark over "Welcome back", brand-blue gradient Sign-in button with a LIME arrow chip (white-on-lime would
  not read), and **"Powered By iNOVAA.AI" as the last line** (user request; "iNOVAA.AI" bold in brand blue). Uses the
  fixed BRAND colours, not the user accent (nobody is signed in). Keeps every rule from the earlier keyboard fix: no
  layout change on keyboard, size depends only on `Dimensions.get('screen')`, focus scrolls. Auth logic untouched.
  A first write of this file was rejected ("modified since read") and a typecheck/bundle ran against the OLD file —
  re-done properly afterwards.
- **App icon "SC" (user request: "seeing the logo make the app icon SC"):** generated with PIL from Windows' Segoe UI
  Black (script was a scratchpad one-off): lime **S** + sky-blue **C** on a NAVY (`#0B2A3A`) tile with a two-tone bar
  under the letters. Navy rather than white because lime-on-white is ~1.3:1 contrast and illegible at launcher size; a
  white variant like the logo itself is saved as `assets/icon-alt-white.png` (NOT wired in — delete if unwanted).
  Written: `icon.png` (1024), `android-icon-foreground.png` (512, lettering kept inside the 66% safe zone),
  `android-icon-background.png` (solid navy), `android-icon-monochrome.png` (black, for themed icons),
  `notification-icon.png` (white silhouette — Android tints it), `favicon.png`; `app.json` `adaptiveIcon.backgroundColor`
  → `#0B2A3A`. The previous files were backed up to the session scratchpad only (not in git — git history has them).
  **Splash was deliberately not changed.** Icons are baked into the native build: **a new EAS build is required to see
  any of it** (and a Metro reload alone will show the old icon).

### 2026-10-02 (later still) — Redesign pass 2: "wow" polish + a status-bar bug fix (written, NOT yet seen on a device)

- **Bug I introduced in pass 1, fixed:** the user's screenshot showed a pale strip above the coloured header with
  near-invisible white status icons — the `marginTop: -insets.top` trick in `ChatHeaderBar` did not survive Android
  clipping. Replaced with `src/top-inset-color.tsx`: the root layout renders `<TopInsetFill/>` (an absolute strip the
  height of the top inset, painted AFTER the navigator) and a focused `ChatHeaderBar` sets its colour via context
  (`useFocusEffect`, restored to `palette.bg` on blur — tab screens stay mounted). `app/_layout.tsx` now wraps in
  `TopInsetProvider`. Light status icons are still tied to focus.
- **Flicker fix (user-reported: status area flashed when switching Support ⇄ Team):** switching sections unmounts one
  header and mounts another, and each used to reset the strip/icons on unmount then set them again on mount, so the
  status area flashed pale/dark for a frame. `ChatHeaderBar` now registers in a module-level `activeHeaders` counter,
  sets the strip colour + `setStatusBarStyle('light')` imperatively on focus, and its "restore normal" step on blur is
  deferred 80ms and skipped if another header has registered meanwhile. (The declarative `<StatusBar>` in the header
  was removed for this; the root layout's `<StatusBar style="dark">` is still the default.)
- **Status area now matches the header (user request):** the strip behind the clock/signal was a flat colour next to a
  gradient header. `top-inset-color.tsx` now carries a `BarSpec` (gradient stops + the header's measured height) instead
  of a single colour; `TopInsetFill` draws the slice of the SAME vertical gradient that sits above the header
  (`barColorAt`) plus the part of the header's top-right orb (`ORB_A`, shared constant) that overlaps it, and the
  header's own gradient starts where the strip's ends (`headerStops`). Consequences: the gradient is now strictly
  VERTICAL (a diagonal one couldn't be continued across the seam), and `ChatHeaderBar` measures itself with `onLayout`
  and republishes its height. If the strip ever looks mismatched, the suspect is a stale/unmeasured `headerHeight`.
- **List body redesign (user: "the chat message area where all the chats show"):** both inbox lists (`ThreadList`,
  `TeamList` in `chats.tsx`) now sit on the same `ChatBackground` wallpaper as the threads; conversations are grouped
  under TODAY / YESTERDAY / THIS WEEK / EARLIER headings (`withHeadings` + `dayBucket`; the Team list's @-mentioned
  conversations get their own "Mentioned you" heading because the server pins them first, otherwise a pinned old
  chat would split a heading in two); `ChatAvatar` draws an accent (or red, for a mention) ring when unread and a small
  people badge on groups; a footer tip card on the Support list (replying/closing). **The Team list's gradient "Start a new conversation" footer
  card was removed at the user's request — the floating new-chat button is the only way to start one now** (`s.promoCard`
  styles are left unused). FlatList data is now a mixed header/row array (`DayRow<T>`), keyed by `entry.key`.

- **Gradient header rolled out to every page (user: "implement on all the other pages"):** new
  `src/components/PageHeader.tsx` = `ChatHeaderBar` (rounded) + title / optional subtitle / optional back chevron /
  optional right widget / optional children underneath. Applied to: client tabs Overview (greeting + client name, the
  white bell on the right, `SiteSwitcher` underneath), Visits (title + `SiteSwitcher`), Sites, Account; staff tabs
  Overview, Jobs (client list AND the per-client drill-down, which has a back button), Clients, Account; and the nine
  stack pages that all used the same `styles.stubHeader`/`stubBackBtn`/`stubTitle` block (documentation ×4, job detail,
  maintenance ×2, notifications, privacy) — replaced mechanically by regex. Chat sub-screens `GroupInfoView` and
  `PeoplePickerView` (new chat / add members; its "Done" is now the `right` slot, white) use it too. Titles that used to
  scroll away inside the page (Overview greeting, Visits/Sites titles, staff greeting) now sit in the fixed header above
  the scroll area. **Login was redesigned right after** (see next bullet). **Deliberately left alone:** `walkthrough/[id].tsx` (a diagram
  overlay with its own floating close button), `MediaViewerView` (black full-screen viewer). The old `s.header`/`s.title`/
  `stubHeader` styles are now unused but left in place. Because every tab now has a header, `activeHeaders` rarely hits
  zero, so the status strip stays continuous across tab switches.
- **Login redesign (user: "very basic"):** `app/login.tsx` is now a tall gradient hero (`ChatHeaderBar` with `rounded
  radius={40}` — new `radius` prop — so the status strip matches here too, plus `<ChatBackground tone="onDark"/>`, a new
  prop that draws the doodles in white with no wash) holding a glass logo ring, "SoWash Commercial", the tagline "Smart
  site care, powered by AI" and three chips (AI-powered / Live reports / Secure), with the form on a white card that
  overlaps the hero's curved edge (`marginTop: -34`): "Welcome back", filled inputs that gain an accent border + glow on
  focus (tracked in `focus` state), and a gradient Sign in button. **Auth logic is untouched** (same `signIn`, same
  error text from the backend, same redirect-by-`_layout`). The brand tagline wording is mine, not from the user.
  **Fix after the user's screenshot ("not responsive"):** the hero was drawn OVER the card (hero shadow wrapper
  zIndex 5 / elevation 8 vs the card's 8), hiding the top of "Welcome back" — the card now has zIndex 10 / elevation 12.
  **Second fix ("tapping email flickers and the keyboard closes"):** the responsive version above shrank the hero from
  `Keyboard` events — that layout change made Android dismiss the keyboard right after it opened. Removed all keyboard
  listeners; compact mode now depends only on `Dimensions.get('screen').height < 700` (does NOT change with the
  keyboard), the focus style is border + fill only (no elevation/shadow churn), and focusing a field scrolls the form up
  (`scrollTo(cardY - 12)` after 180ms) instead of re-laying anything out. Lesson: never change layout in response to the
  keyboard on this screen. Responsive behaviour that remains: on short screens (<700px) the hero is smaller (chips hidden), the card is `min(width-40, 460)` wide
  (tablet-safe), brand text drops to 24 below 360px wide, and the footnote moved out of the card to the bottom of the
  screen behind a flex spacer so tall phones don't end in a blank area.
- **Header:** `ChatHeaderBar` is now an `expo-linear-gradient` (`LinearGradient` was already used by `MeshBlob`, so no new
  native module) from a darker shade of the accent through the accent to an indigo blend, with two translucent
  "orbs" for depth; the shadow lives on an outer view so the gradient can clip its orbs. Colour maths in
  `src/utils/color.ts` (`shade`, `mix`).
- **Lists:** live stat chips in the header ("● N unread" / "✓ All caught up", "@ N mentions"), gradient `ChatAvatar`,
  unread rows get an accent edge bar + bold name + accent time + brighter preview, rows cascade in with
  `src/components/FadeInRow.tsx` (native-driven, once per mount, delay capped), Team filter chips show counts, search
  bar is a shadowed pill, "new chat" is a floating action button (the tiny header icon is gone), amber chip for
  "N sites waiting".
- **Bubbles:** my own bubbles get a soft light→deep gradient of the accent (`BubbleGradient` in `chats.tsx`, the same
  inline in `support.tsx`); it is an absolutely-filled rounded layer under the content because `overflow:hidden`
  on the bubble would clip the reaction chips that straddle its bottom edge.
- **Still not done:** dark theme; client site-list row polish; Group Info / people picker / photo viewer headers.

### 2026-10-02 (later) — Chat UI redesign: accent-coloured header bars, wallpaper, rounder bubbles/composer (written, NOT yet seen on a device)

Reference: the user shared a "Flutter Chat App" mock (green title bar with avatar + "Active 3m ago", pill bubbles,
floating composer, a chat list with round avatars). Applied to every chat surface, JS-only (no backend, no rebuild).
- **New shared components:** `src/components/ChatHeaderBar.tsx` (coloured bar in the user's accent, white content;
  pulls itself up under the status bar with `marginTop: -insets.top` because the root `SafeAreaView` is pale, and
  renders `<StatusBar style="light">` only WHILE FOCUSED via `useFocusEffect` — tab screens stay mounted, so an
  unconditional light status bar would leave white-on-white icons on the next tab) and
  `src/components/ChatBackground.tsx` (the wallpaper: an accent→indigo gradient wash + a tiled doodle pattern drawn with
  `react-native-svg` `<Pattern>` at ~12% opacity, so it follows the chosen accent and ships no image. **The motifs
  were widened after the user said the company's scope isn't just solar/water:** AI (sparkle, neural network, chip,
  robot), drones/robotics, gear, sun/panel/droplet, chat, map pin, shield, check badge, report, wifi, bolt, leaf. Each
  motif is drawn around (0,0) in the `MOTIFS` map and placed via the `LAYOUT` list — edit those to change it).
- **Applied to:** staff Support thread + Team thread headers (white back/search icons, round bordered avatar, online
  dot on a DM, translucent Assign/Close chips that turn white when active, search header recoloured), the Chats list
  header (title + segmented Support/Team switch, rounded bottom), and the client Support tab (site list header,
  `SiteRings`, General `ChatThread` with the ring button restyled). Both thread views also get `<ChatBackground/>`.
- **Style changes:** bubbles radius 22 / soft shadow / 14.5px text, composer pill fully rounded with a shadow and a
  50px round send button, round 48px list avatars, system notes as white pills so they read over the wallpaper.
- **Not done / for later:** a dark theme (the sample shows light AND dark — `palette` is a static light theme used app-wide,
  so dark is a separate app-wide change, not a chat-only one); the unused `s.threadHeader`/`s.header`/`s.wash` styles are
  left in place. `GroupInfoView`/`PeoplePickerView`/`MediaViewerView` keep their own (light) headers on purpose.
- **Risks to check on device:** the status-bar overlap trick (header should run edge-to-edge under the status bar, no pale
  strip), header chips fitting on a narrow phone (Assign + Close + search), and wallpaper contrast with the accent chosen.
  `expo export --platform android` bundles cleanly; typecheck clean.

### 2026-10-02 — Site label on client chat messages; several client logins no longer look like one person (written, NOT yet deployed/tested)

Context: confirmed with the user that the client Support tab's per-site rows were NOT separate chats — the
backend has exactly one `commercial_chat_threads` row per client (unique `client_id`) and every site row opened
that same thread. Decision (recommended by me, agreed by the user): keep ONE shared thread (staff inbox,
assignment, unread, web console `CommercialChat.js` all assume it) and label messages with their site instead
of splitting threads. Per-site threads were considered and rejected for now.

- **Site label:** `docs/migrations/2026-10-02-commercial-chat-message-site.sql` adds
  `commercial_chat_messages.site_id` (nullable FK → `commercial_sites`, `ON DELETE SET NULL`; NULL = General).
  **NOT applied.** `POST /customer-portal/chat/messages` accepts `site_id` (validated to belong to the caller's
  client — otherwise it'd be a lookup oracle for other clients' site ids); both message SELECTs
  (`customerJobHistoryRoutes.js` + `commercialChatRoutes.js`) return `site_id` and `site_name` (a correlated
  subquery on `commercial_sites`, no join-alias collisions with `CHAT_VISIT_JOINS`). App: `SendChatArgs.siteId/
  siteName`, ring + normal sends from a site row pass it, optimistic bubble carries it, and BOTH the client
  `Bubble` (`support.tsx`) and the staff `Bubble` (`chats.tsx`) render a small map-pin site chip. Client UI
  wording changed from "Shared account conversation" to "Message SoWash about this site".
- **Several logins per client:** the client app used `sender_kind === 'customer'` as "mine", so every colleague at
  the same client saw each other's messages as their own (right side, no name). `customerJobHistoryRoutes.js`'s
  `CCHAT_MESSAGE_SELECT`/`shapeChatMessage` now returns `sender_user_id` (the staff side already did), and
  `support.tsx`'s `isMine()` compares it to the viewer's id (falls back to the old behaviour if the server
  doesn't send it). A colleague's message now sits on the left with their name and avatar, like a group chat.
  Staff already saw the individual's name (`sender_name` comes from the sender's `users` row).
- **Known limitation (not fixed):** the customer's read mark is per THREAD (`customer_last_read_at`), so one
  colleague opening the chat clears the unread badge for everyone at that client; customer typing is also
  keyed by `client_id`, so staff just see "typing…" without which colleague. Fixing read state properly needs a
  per-user read table for customers (the staff side already has `commercial_chat_thread_reads`).
- **Close / Reopen from the mobile app:** until now a thread could only be closed from the web console
  (`CommercialChat.js`'s Close/Reopen button, menu entry `commercial-chat` is **ci_admin-only** in
  `menu-items.jsx`) — so operations/admin/sales/accounts users, who the API now allows, had no way to close one
  anywhere. `useStaffChatThreadMeta` gained `setStatus('open'|'closed')` (existing `PATCH /threads/:id`
  `{status}`); `ThreadView` has a Close/Reopen chip beside Assign, a "closed — sending a message reopens it"
  note above the composer when closed. Status lifecycle (unchanged): a client message OR an agent reply sets
  `status='open'`; closing is only ever explicit. **Backend (`commercialChatRoutes.js` PATCH):** now drops a
  `sender_kind='system'` note "X closed / reopened this conversation" ONLY when the status actually changes
  (reads the previous status first), and the note never touches `status`. This also applies to the web
  console's Close button — same endpoint.
- **Waiting sites + warn-on-close (final design, SIMPLIFIED after the user found per-site tapping too
  complicated):** a client can ring for several sites in the one thread and Close closes the WHOLE conversation,
  so a still-waiting site could vanish behind a Closed thread. Staff do nothing extra now: a site is WAITING
  when the client has a message tagged with it (`commercial_chat_messages.site_id`) newer than the LAST AGENT
  REPLY in the thread (`loadWaitingSites()` in `commercialChatRoutes.js`; no extra table). So replying to the
  client clears everything before the reply, and a new ring makes a site waiting again. `GET /threads/:id` and
  the `PATCH` response carry `waiting_sites: [{site_id, site_name, last_at}]`; the inbox `GET /threads` carries
  `waiting_sites` as a COUNT. App: one amber line under the thread header ("Waiting: Site B, Site C"),
  **Close warns "N sites still waiting … Close anyway?"** (`Alert`), inbox rows show "N sites waiting", and
  `useStaffChatThreadMeta` re-reads when the message count changes (it doesn't poll). Known gap by design: if
  staff reply about site A only and then close, sites B/C are not warned about (a reply counts as attention for
  everything before it). The web console's Close button doesn't warn. **An earlier version of this work used a
  `commercial_chat_site_status` table + tap-to-mark chips — it was replaced; if that table was already created
  it is unused and can be dropped (`DROP TABLE IF EXISTS commercial_chat_site_status;`).**
- **Client Support tab restructured: a site is a RING HISTORY, General is the conversation (2026-10-02):** the
  user found it confusing that opening a site showed the General messages. Now `SupportScreen` opens
  `ChatThread` ONLY for General (the full conversation, composer, photos, visit tags, everything), and a site
  opens the new `SiteRings` screen: that site's past rings (newest first) with a status pill, an optional note
  field, and a "Ring about <site>" button (60s cooldown, same as before) plus a link to General. A ring is just
  a customer message tagged with `site_id`, so it ALSO appears in General (with the site chip) and on the staff
  side exactly as before — nothing about the single shared thread changed. Status is derived, never stored:
  `GET /customer-portal/chat/rings?site_id=` (`customerJobHistoryRoutes.js`; site validated to the caller's
  client) returns `waiting` (no agent reply since), `answered` (an agent replied after it), `completed` (staff
  CLOSED the conversation after it). **"Completed" is detected by matching the system note
  `'% closed this conversation'` that `PATCH /threads/:id` writes — a deliberate string coupling, commented at
  both ends; change one, change the other.** Because closing is whole-thread, closing completes every earlier
  ring at once (the warn-on-close above exists for exactly that). `useSiteRings(siteId)` polls with the chat
  poll interval (status changes with no action by the client). Old site-row messages sent before 2026-10-02 are
  untagged, so they don't appear as rings. No migration beyond the `site_id` one.
- **Client no longer sees internal system notes:** `customerJobHistoryRoutes.js` `GET /chat` and
  `GET /chat/messages` now filter `m.sender_kind <> 'system'`. Before this, "Fatima assigned this conversation
  to Ahmed" (added 2026-09-29) rendered in the client app as a normal bubble from that staff member — an
  internal-workflow leak. Customer unread counts already only counted `sender_kind='agent'`, so unaffected.
- **Deploy order:** run the migration BEFORE uploading `routes/customerJobHistoryRoutes.js` and
  `routes/commercialChatRoutes.js` — both SELECT `m.site_id` on every message fetch, so a missing column breaks
  chat for the app AND the web console. Then `pm2 restart`. App side is JS-only (reload).

### 2026-10-01 (end of day) — Reply/swipe/reactions on Team chat (live), then Support-chat parity, reaction push, and the non-chat items (backend files uploaded same day; app side and new native build NOT yet device-tested)

**Team chat, confirmed working by the user before this batch:** reply-to-message
(`staff_messages.reply_to_id`, long-press/swipe → quote block, tap quote jumps), swipe-right-to-reply
(RNGH `PanGestureHandler` + native-driven `Animated.event`; also made `TeamBubble`'s handlers stable so the
`React.memo` actually holds — keystrokes were re-rendering every bubble), emoji reactions
(`staff_message_reactions`, one per user per message, socket `reaction` event + riding on
`GET /conversations/:id` for the poll fallback), WhatsApp-style floating-message overlay
(`MessageActionsOverlay` in `app/staff/chats.tsx`) with a "+" picker of 48 emojis and restyled chips.

**Support-chat parity (staff ↔ CLIENT, `commercial-chat` + `customer-portal/chat`) — written, untested:**
- Staff `ThreadView` (`app/staff/chats.tsx`) now has: photo tap → `MediaViewerView` with pinch-zoom, search in
  chat, optimistic send + Retry/Delete (`useStaffChatThread` split into `post`/`retry`/`discard`, takes
  `myUserId`), reactions (long-press overlay, `react()`), typing indicator (header "typing…").
  `MessageActionsOverlay` was made generic (`renderMessage`, `mine`, optional `onReply`) so Team and
  Support share it; Support passes no `onReply` (no reply-to for support).
- Client Support tab (`app/(tabs)/support.tsx` + `useChat(myUserId)`): optimistic send + Retry/Delete,
  reactions (compact `ReactionOverlay`, no "+" picker), typing both ways. **Deliberately NOT ported to the
  client tab:** photo zoom and search-in-chat (the viewer lives in the staff file; extracting it is a
  separate refactor).
- Backend: `docs/migrations/2026-10-01-commercial-chat-reactions.sql` (**NOT applied**),
  `services/chatTyping.js` (new, in-memory, keyed by client_id, 5s TTL — no socket on this path, both apps
  poll `GET .../typing` every 2s), `routes/commercialChatRoutes.js` (reactions ride on
  `GET /threads/:id/messages`; `PUT /threads/:id/messages/:mid/reaction`; `POST/GET /threads/:id/typing`),
  `routes/customerJobHistoryRoutes.js` (`loadChatReactions`; `PUT /chat/messages/:mid/reaction`;
  `POST/GET /chat/typing`). `reactions` is a flat `{message_id,user_id,emoji}[]` for the whole thread on
  every response, because a reaction can land on an old message the `after_id` delta never returns.
- **Reaction push:** `notifyReaction()` in `services/staffChatNotifications.js`, called from
  `staffChatRoutes.js` (Team: author of the message, never self, never on removal) and both support PUT
  routes (an agent's message reacted to by a colleague or by the client → that agent). A staff reaction to
  a CLIENT's message sends no push (no client push channel for it; `commercial_notifications`' type CHECK
  has no room) — known gap.

**Non-chat items:**
- **Startup speed:** `AuthProvider` now sets `signedIn` immediately for a client session with a cached
  identity and validates the token in the background (only a real 401/403 still bounces to `/login`).
  Also fixed a latent bug while there: the app's `OFFICE_ROLES` mirror only had 3 of the 5 staff roles
  (`sales`/`accounts` would have been routed into the CLIENT UI) — now matches `config/staffRoles.js`.
- **Removed `react-native-reanimated` + `react-native-worklets` from `package.json`** (grep-confirmed
  imported nowhere in app code) — **but this did NOT actually remove them**: `npm ls` shows both are still
  installed as auto-installed peers of `expo-router` (and `worklets` via `expo-modules-core`), so they are
  still in `node_modules` and still autolinked into native builds. The edit is harmless but gained
  nothing; the real startup cost can't be cut this way. (Found 2026-10-02 while debugging a red-screen
  `Property 'MessageQueue' doesn't exist` — NOT caused by this; a fresh-cache `expo export --platform
  android` bundles cleanly.)
- **Re-applied the two backend fixes reverted on 2026-09-21** (same code as the 2026-09-17 entries):
  `routes/schedulingRoutes.js` status vocabulary (`after_photos`/`before_photos`, no `reached_location`
  branch; `fsrMilestoneStatuses` also keeps the old `after_photos_uploaded` so already-written rows still
  get an FSR) and `routes/customerJobHistoryRoutes.js` `TO_CHAR(...,'YYYY-MM-DD')` on 7 date columns.
  **These change live API output (dates become plain `YYYY-MM-DD`) — worth a quick check of Visits/Overview
  dates after deploy.**
- **Dedicated Android "Mentions" channel:** added `@notifee/react-native` (used ONLY to
  `createChannel`, lazy-required in try/catch in `src/push.ts`'s `ensureAndroidChannels()`, so an APK
  without it degrades to the default channel). Backend `notifyStaff` takes `channelId`; mention / `@all` /
  mention-reminder / support-mention pushes send `channelId:'mentions'`. Notifee's own gradle adds its
  maven repo, so no config plugin was needed. **Needs a new EAS build — never built, so the one real risk
  is a native build/compat failure with RN 0.86 + new arch; if the build fails, `npm uninstall
  @notifee/react-native` and revert `ensureAndroidChannels()` (backend `channelId` is harmless either way).**
- **Not done:** Safety Training upload UI (lives in `sowash-frontend`, the web team's task).

**Deploy status (updated end of 2026-10-01):** the user reported uploading the 9 backend files
(`services/chatTyping.js` new; `routes/{commercialChatRoutes,customerJobHistoryRoutes,staffChatRoutes,
schedulingRoutes}.js`; `services/{staffPush,staffChatNotifications,staffMentionReminders,
commercialNotifications}.js`). **Not confirmed in-session:** that `2026-10-01-commercial-chat-reactions.sql`
was run, that `pm2 restart` came up clean, or any post-restart check — re-verify with `pm2 logs` and a support
chat on both sides before trusting any of the above is live. The EAS dev build (notifee + reanimated removal)
was being started; its result is unknown.

**Impact check done before upload (user asked specifically about the web portal and FO app):**
`sowash-fo-app` contains no references to `customer-portal` or `commercial-chat` — unaffected. The web
portal's `CustomerDashboard.js` calls only `profile/stats/history/maintenance-history/today/:id/detail/sld`
(never `/chat*`); the only thing it sees from this batch is `scheduled_date`/`original_date`/
`contract_start_date` now being plain `YYYY-MM-DD` instead of an ISO timestamp. Its `fmtDate`, month filters
and daily chart all go through `new Date(...)` and there is no code compensating for the old off-by-one, so
the displayed day is the same as before (Pakistan browsers) or no worse (UTC− browsers — `YYYY-MM-DD` parses
as UTC midnight, an existing page quirk). Web console `CommercialChat.js` ignores the added `reactions`
field and already merges `PATCH /threads/:id` as `{...prev, ...data.thread}`. The Mideast portal uses
`/mideast/customer-portal/*` (different route) — unaffected. Nothing in the other repos reads the old
invented status strings (`after_photos_uploaded` etc.), confirmed by grep. `.claude-backups/*pre-support-
parity-and-date-fix.bak` and `*pre-status-vocab-fix.bak` were taken AFTER the reaction edits, so they are not
a clean pre-session snapshot — the VPS's own copies were the real rollback.

**Deploy checklist:** (1) run `2026-10-01-commercial-chat-reactions.sql` BEFORE uploading the backend
(`commercialChatRoutes.js`/`customerJobHistoryRoutes.js` query that table on every messages fetch — a
missing table breaks support chat for both sides); (2) upload `routes/{commercialChatRoutes,
customerJobHistoryRoutes,staffChatRoutes,schedulingRoutes}.js` and `services/{chatTyping,staffPush,
staffChatNotifications,staffMentionReminders,commercialNotifications}.js`, `pm2 restart`; never upload the
local `package-lock.json`; (3) new EAS dev build for notifee + the reanimated removal; (4) device-test
everything above — none of the Support-parity, typing, push, or channel work has run on a device.

### 2026-10-01 (latest) — Team inbox filters (All / Unread / Groups) and failed-send Retry/Delete

Both confirmed working on-device by the user. Pure app-side, JS-only, no backend change.

- **Filters (`TeamList`, `app/staff/chats.tsx`):** three pills under the search bar, filtering
  the already-loaded list client-side (`unread > 0` / `kind === 'group'`), server order kept.
  Loading/error states key off the unfiltered list so an empty filter never looks like a failed
  load. Support list untouched — it has Open/Closed already and no groups.
- **Failed-send recovery (`useTeamConversation`, `src/hooks.ts`):** `send()` is now
  fire-and-return — it appends the optimistic bubble and returns `true` immediately, so the
  composer clears at once. The network half moved to `post()`; on failure the bubble is kept with
  `failed: true` (client-only field on `TeamMessage`) instead of being dropped, and its args are
  held in `failedSendsRef` (a `Map` keyed by the negative local id). New `retry(localId)`
  re-posts in place, `discard(localId)` removes it; `TeamBubble` renders "Not sent · Retry ·
  Delete". **Behaviour change:** previously a failed send left the draft in the composer; now the
  bubble owns the content. Failed bubbles live only while the thread is mounted — not persisted
  across leaving the thread or an app restart.
- **Still open on chat:** reply-to-message (needs a column + migration), delete/edit message,
  mute/leave group, Support chat parity (photo zoom, search, typing, optimistic send), dedicated
  Android notification channel (`notifee` + native build), WebSocket-through-proxy still
  unconfirmed.

### 2026-10-01 (later) — `@all` in group chats; photo-viewer crash fix; expo-image needed a native rebuild

**`@all` (Team groups only, confirmed working by the user after deploy):**
- Backend: `docs/migrations/2026-10-01-staff-mention-all.sql` adds `staff_messages.mention_all
  boolean NOT NULL DEFAULT false` (applied). `routes/staffChatRoutes.js` — `POST
  .../messages` accepts `mention_all` (honoured only when `conversation.kind === 'group'`, wins
  over a single `mentioned_user_id`), `MESSAGE_SELECT`/`shapeMessage` return it, and
  `GET /conversations`'s `has_unread_mention` also fires for another member's `@all`.
  `services/staffChatNotifications.js` sends every recipient one "X mentioned everyone in
  <group>" push instead of the plain one.
- App: `TeamThreadView` (`app/staff/chats.tsx`) shows an "all — notify everyone" row at the top
  of the `@` picker in groups; `mentionAll` is derived from the draft text at send time (deleting
  the text un-mentions); `MessageBody` highlights `@all` when `message.mention_all`. Plumbed
  through `StaffSendTeamArgs`/`useTeamConversation.send` and `TeamMessage.mention_all?`.
- Deliberately not done: the 20-minute repeating mention reminder still covers single
  `@mentions` only, not `@all` (WhatsApp doesn't repeat it either).

**Photo viewer crash — "TapGestureHandler must be used as a descendant of
GestureHandlerRootView":** `ZoomableImage` uses RNGH handlers but nothing mounted a root view.
Fixed by wrapping `app/_layout.tsx`'s `RootLayout` in `GestureHandlerRootView`. JS-only.

**"Cannot find native module 'ExpoImage'":** not a code bug — the installed dev-client APK
predated the `expo-image` dependency. Needed a fresh `eas build --platform android --profile
development` AND a clean uninstall/reinstall of the old APK (the first install of the new build
silently left the old one in place). Lesson: any new native dependency means a new dev build;
a JS reload can't fix it.

### 2026-10-01 — User confirmed the pending Team-chat work is working on-device

The user reported (2026-10-01) that they checked the outstanding items from the 2026-09-30
snapshot below and everything works. Taken as: the second `staffChatRoutes.js` upload
(delivered-tick fix) is deployed and the on-device checklist (three-state ticks, photo zoom,
search-in-chat and the other recent Team-chat features) passed. The user didn't itemize which
checks they ran, so that mapping is inferred. **Still open:** nothing in either repo is
committed; the two reverted 2026-09-17 backend fixes, the startup-speed audit, and the
Documentation-feature backend deploy (see 2026-09-22 entry) are unchanged.

### 2026-09-30 — Session status snapshot (read this before assuming anything below is live)

A lot shipped in rapid succession today, each with its own deploy note — this snapshot exists
so "what's actually live right now" doesn't require reconstructing it from a dozen entries.
Re-verify before trusting it; it's accurate as of the moment it was written, not a permanent fact.

**Confirmed live on the VPS** (user confirmed migrations run + files uploaded + `pm2 restart`,
and for the push-token fix, confirmed with a real notification arriving):
- The `user_fcm_tokens` unique-constraint fix (`routes/userRoutes.js`) — root cause of the
  months-long "push notifications don't work" mystery. Confirmed working end-to-end.
- `staffMentionReminders.js` scheduler + `staffChatRoutes.js`'s `has_unread_mention`/pinned-to-
  top mention handling + `server.js` wiring.
- `users.last_seen_at` (presence) — column added, `staffChatSocket.js`'s `isUserOnline`/write-on-
  disconnect, and the FIRST round of `staffChatRoutes.js` changes (participants now carry
  `online`/`last_seen_at`, plus the original `last_delivered_at` plumbing) — all uploaded and
  restarted.

**NOT yet confirmed deployed — the one real gap right now:** `staffChatRoutes.js` was edited
AGAIN after that last upload, to fix the "delivered never shows" bug (moved the
`last_delivered_at` bump from `GET .../messages` to `GET /conversations` — see that entry
below). **This second round of changes to `staffChatRoutes.js` has not been confirmed uploaded.**
Until it is, delivered-vs-seen will keep behaving like the bug describes (jumps straight from
sent to blue), even though the column and the rest of the presence/ticks work is live. No new
migration needed for this one — just the file.

**Pure app-side, no backend dependency, reload-only to test** (not yet confirmed
tested/reloaded on-device as of this snapshot): push-registration retry/self-heal (`src/push.ts`),
pinch-to-zoom photo viewer, search-in-chat. None of these need anything from the list above except
whatever's already live.

**Next session should start by:** confirming the second `staffChatRoutes.js` upload happened, then
working through the still-open on-device checklists in the entries below (three-state ticks,
photo zoom, search-in-chat) in one pass rather than one at a time.

### 2026-09-30 (truly latest) — Search in chat, Team dm/group threads

WhatsApp's header search icon — client-side, over whatever the thread already has loaded (up to
500 messages, same scope `photoMedia`'s in-thread photo viewer already uses), not a new backend
search endpoint: internal staff chat doesn't have years of history the way WhatsApp does, so
searching what's already in memory covers the real case.

- `MessageBody` (shared by Support's `Bubble` and Team's `TeamBubble`) gained an optional
  `searchQuery` prop — highlights every case-insensitive occurrence (yellow background), composed
  against the existing single mention-tag highlight in one pass rather than two separate split
  passes, so a search match landing inside an `@mention` doesn't fight it.
- `TeamThreadView` — new search header (search icon in the normal header swaps the whole header
  row for a text input + match count + up/down chevrons, closable via the icon or Android back).
  `searchMatches` is a list of positions in the full `messages` array; opening a query or new
  messages arriving while searching jumps to the newest match first (WhatsApp's own default),
  up/down steps to older/newer ones, each via `scrollToIndex` with the standard
  `onScrollToIndexFailed` fallback (bubbles are variable height, no `getItemLayout`). The
  FlatList's own scroll-to-newest-on-new-message is suppressed while search is open, so an
  incoming message can't yank the view away from the match you're looking at.
- Scoped to Team chat (dm/group) per the request's own wording — Support chat doesn't have this
  yet, same "small, contained follow-up if wanted" note as the photo-zoom entry above.

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains). Pure app-side, no backend dependency — reload-only.

### 2026-09-30 (latest of all) — Fixed: "delivered" never actually showed

Bug found immediately after deploying the entry below, from the user's own testing: the grey
(un-colored) double-tick never appeared — a message went straight from single-tick to blue.
Root cause: `last_delivered_at` was only ever bumped by `GET .../messages`, which only fires
once the recipient opens THAT SPECIFIC conversation — and opening it also calls `markRead()` in
the same breath, so `last_delivered_at` and `last_read_at` landed at the same instant every
time. The two states could never actually be observed apart.

**Fix (`routes/staffChatRoutes.js`):** `GET /conversations` (the inbox list) now bumps
`last_delivered_at` for **every** one of the caller's conversations on every poll — not just
whichever one they happen to have open. `TeamList` already polls this every ~5s while the Team
tab is focused, so simply having the app open and the list polling (regardless of which thread,
if any, is open) is now what "delivered" means — the honest equivalent of WhatsApp's own
"phone's on and has it," distinct from "they actually opened this chat." The original
`GET .../messages` bump is left in place too (harmless, redundant once a thread is opened).

**Verification:** `node -c` clean. **Not yet deployed** — needs the usual upload + `pm2 restart`
before delivered can actually show up as its own distinct state.

### 2026-09-30 (even later) — Three-state read receipts (blue tick), push registration self-heals instead of needing a manual sign-out/in, pinch-to-zoom photo viewer

Three more asks in the same session as the presence/draft-persistence entry below.

**Three-state ticks — sent (grey single) → delivered (grey double) → seen (blue double),
the actual WhatsApp semantics, not the sent/seen-only version this had before:**
- `docs/migrations/2026-09-30-staff-delivered-receipts.sql` (new, **not yet applied**) — adds
  `staff_conversation_participants.last_delivered_at`, the same "high water mark" pattern
  `last_read_at` already uses, just for a different moment: bumped by `GET
  .../messages` (`routes/staffChatRoutes.js`) on EVERY successful fetch — full load or a delta
  poll, doesn't matter, either one proves that participant's client now has everything up to
  that moment, whether or not they've actually looked at it. `loadConversationDetail` now
  selects it alongside `last_read_at`.
- App: `TeamParticipant` gained `last_delivered_at`. `messageSeenStatus()` (`app/staff/chats.tsx`)
  now returns `'sent' | 'delivered' | 'seen' | null` — `'seen'` when every other participant's
  `last_read_at` is past the message, else `'delivered'` when every other participant's
  `last_delivered_at` is, else `'sent'`. `TeamBubble` renders single grey check / double grey
  check / double check in `#4fc3f7` (WhatsApp's own blue) for the three states respectively.

**Push registration now retries itself instead of silently staying broken for days:** prompted
by a real incident mid-session — a transient "Network Error" on one registration attempt, which
only got fixed because the user happened to sign out and back in. For a session that stays open
for days without a cold restart, nothing would have ever retried. Deliberately NOT an
auto-sign-out (would be a disruptive fix for what's usually a one-second blip, and the app
keeps working fine on polling regardless) — `src/push.ts` now:
- `registerWithRetry()` — up to 3 retries with backoff (5s/20s/60s) on the initial registration
  and on `onTokenRefresh`. Every exit path is a `return`, never a `throw`, so its promise can
  never reject — load-bearing, since every call site fires it without awaiting.
- A new `AppState` 'active' listener re-registers on every foreground, cheap and idempotent
  (the backend upserts on the token either way) — the actual fix for the "days-long session"
  case, since foregrounding happens naturally and often, unlike a cold restart.
- A `cancelled` flag threaded through all of the above, flipped in `initPush`'s own teardown, so
  a retry loop from an ENDED session (signed out mid-backoff) can't fire a stale request under a
  new one.

**Tap a photo to view it full-screen with pinch-to-zoom — WhatsApp's own photo viewer:**
- `react-native-gesture-handler` added as an explicit dependency (`package.json`) — **not a new
  native dependency in practice**: already resolved in `node_modules` at 3.1.0 as a transitive
  peer of `expo-router`/`@react-navigation` (their own screen-transition gestures depend on it),
  so it's already compiled into the existing dev-client build. This is a declare-what's-actually-
  used correctness change, not something that needs a new EAS build.
- New `ZoomableImage` (`app/staff/chats.tsx`) — pinch-to-zoom (clamped 1x–4x), pan-when-zoomed,
  double-tap to toggle 1x/2x. Hand-rolled on RNGH's classic ref API + plain `react-native`
  `Animated.Value`s (manual `.setValue()` calls in the gesture callbacks, not
  `Animated.event`'s offset-extraction pattern, and not the newer Gesture/GestureDetector API)
  — deliberately, since that newer API wants Reanimated's worklets to perform well, and this
  project's Reanimated install has no babel plugin wired up for it (CLAUDE.md §6). The pan
  handler is only `enabled` once actually zoomed in, so at the default 1x a horizontal drag
  falls through to the surrounding page-swipe `FlatList` instead of being claimed here; the
  `FlatList`'s own paging is disabled for as long as any page reports itself zoomed.
- `MediaViewerView` (already built for `GroupInfoView`'s shared-media grid) now renders each
  page through `ZoomableImage` instead of a static `contentFit="contain"` image — one change,
  both call sites get zoom.
- `TeamThreadView` gained `photoMedia` (every photo message in the thread, chronological order)
  and `openPhoto(messageId)`; `TeamBubble`'s photo now opens in `MediaViewerView` positioned on
  the tapped message, and swiping from there moves through the conversation's own photo history
  in reading order — reusing the exact viewer Group Info's gallery already has, not a second
  one. Scoped to Team chat (dm/group) per the request's own wording — Support chat's photo
  bubbles don't have this yet, a small, contained follow-up if wanted later.

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains); `node -c` clean on the touched backend file.
**Not yet deployed** — the delivered-receipts migration hasn't been applied, and
`staffChatRoutes.js` hasn't been uploaded. The push-retry and photo-zoom pieces are app-side
only, no backend dependency, reload-only once JS ships.

### 2026-09-30 (latest) — DM "Online / last seen …" presence, and draft text now survives navigating away

Two asks in one message: (1) show a WhatsApp-style presence line in a dm's header, (2) fix a
real bug — typing a draft, opening a different chat, then coming back lost whatever you'd typed.

**Presence (`Online` / `last seen …`), dm-only — matches WhatsApp's own convention of never
showing this for a group:**
- `docs/migrations/2026-09-30-users-last-seen.sql` (new, **not yet applied**) —
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamp`. Deliberately on `users`,
  not per-conversation — presence belongs to the person, not any one chat they're in.
- `services/staffChatSocket.js` — new `isUserOnline(userId)` export (true while
  `socketsByUser` has at least one open socket for them — live process state, not a DB read).
  `removeSocket()` now writes `last_seen_at = NOW()` for a user, but **only at the exact moment
  their LAST remaining socket closes** — not on every disconnect, so someone with two devices
  open doesn't get marked "last seen" just because they closed one of them. Fire-and-forget, own
  `.catch`, never blocks the disconnect.
- `routes/staffChatRoutes.js`'s `loadConversationDetail` — each participant now carries `online`
  (computed via `isUserOnline()`, never stale the way a written value could be) and
  `last_seen_at`. No new endpoint — this rides along on `GET /conversations/:id`, which the app
  already polls every 5s while a thread is open, so presence updates on the same cadence
  everything else does (a few seconds of staleness at worst, not instant like WhatsApp's own,
  and deliberately not worth a dedicated socket event just for this).
- App: `TeamParticipant` (`src/api/types.ts`) gained `online`/`last_seen_at`. `TeamThreadView`'s
  header subtitle (`app/staff/chats.tsx`) — already showing the typing indicator or a group's
  member count — now also shows "Online" (green) or a new `lastSeenLabel()` helper's output
  ("last seen just now" / "…Xm ago" / "…today at …" / "…yesterday at …" / "…<date>") for a dm,
  same priority order as before (typing beats everything).

**Draft persistence — applied to BOTH chat surfaces (Support's `ThreadView` and Team's
`TeamThreadView`) for consistency, not just the one that was reported:**
- Root cause: `ThreadView`/`TeamThreadView` fully unmount when you back out to the inbox list
  (the full-screen-replace pattern this whole file uses), so the composer's `draft` — plain local
  `useState` — was lost with them. Reopening even the SAME conversation created a fresh component
  instance with empty state.
- Fix: two new module-level, in-memory `Map`s (`supportDraftCache`, `teamDraftCache`, keyed by
  thread/conversation id, right next to `INBOX_POLL_MS`) that survive the unmount. Each
  `ThreadView`/`TeamThreadView` now lazy-initializes its `draft` state FROM the cache
  (`useState(() => cache.get(id) ?? '')`), writes to the cache on every keystroke and on a
  picked @-mention, and clears its own entry once a send actually succeeds. Never persisted to
  disk — an app restart losing an unsent draft is an accepted, same-as-everywhere-else-in-this-
  file trade-off (see `teamConversationCache` in `src/hooks.ts` for the identical pattern already
  used for message data).

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains); `node -c` clean on both touched backend files.
**Not yet deployed** — migration not applied, `staffChatSocket.js`/`staffChatRoutes.js` not
uploaded. Once deployed: open a dm, confirm the header shows "Online" while the other person's
app is open and flips to a "last seen …" line within a few seconds of them closing it; type a
draft in any chat, back out to the list, reopen it, confirm the text is still there.

### 2026-09-30 (continued furthest) — ROOT CAUSE FOUND for the "push notifications never appear" mystery: `user_fcm_tokens` has been silently rejecting every registration for months

This resolves the open item at the end of the Phase 5 entry below (and, in hindsight,
`routes/portalAuthRoutes.js`'s original staff-push work too) — it was never a notification-
*display* problem. Push tokens were never successfully reaching the database in the first
place, on **either** platform, so there was nothing valid for Firebase to deliver to.

**How it surfaced:** while chasing why the new mention-reminder push (previous entry) wasn't
showing up on 3 separate test devices, added temporary `[push]` logging to `src/push.ts`
(kept, not temporary — see below) and found `POST /user/fcm-token` returning `500`. `pm2 logs`
showed the real Postgres error: `there is no unique or exclusion constraint matching the ON
CONFLICT specification`. A live `pg_constraint` query confirmed `user_fcm_tokens` has **only**
its `user_id` foreign key — no unique constraint on anything, ever — while
`routes/userRoutes.js`'s `POST /fcm-token` has been upserting with `ON CONFLICT (user_id)`
since at least whenever this checkout's history starts. Every single call has been throwing,
silently swallowed by `.catch(() => {})` on **both** callers of this endpoint:
`src/push.ts` here, and `sowash-frontend/src/pages/AuthLogin.js` — **the staff web portal's own
push has almost certainly been broken by this too**, this whole time, not just the mobile app.
A stray still-registered token from 2026-08-05 (the last time this apparently worked) is what
led to chasing this at all — every "sent:1, failed:0" Firebase confirmation throughout Phase 4
and Phase 5's own push investigations was real, honest delivery **to that one stale token**,
never anything from a currently-running install.

**Fix, deliberately `UNIQUE(token)` not `UNIQUE(user_id)`:** matches the pattern this codebase
already gets right elsewhere — `routes/customerJobHistoryRoutes.js`'s own `/push/register` (a
different table, `commercial_fcm_tokens`) already upserts `ON CONFLICT (token)`, with a comment
explaining why: a device gets reused across accounts (resold, a shared test phone), and the
token is the physical identity that should be unique, not the user. `services/staffPush.js` has
its own comment that already anticipated this exact fix ("until the 2026-08-05 migration's
unique index is in place") — that migration evidently never actually landed. Confirmed safe to
apply directly with no dedupe step: a live query found zero duplicate `user_id` rows and zero
duplicate `token` rows in the table as of this entry.
- `docs/migrations/2026-09-30-user-fcm-tokens-unique-constraint.sql` (new, **not yet applied**)
  — `ALTER TABLE user_fcm_tokens ADD CONSTRAINT user_fcm_tokens_token_key UNIQUE (token)`, plus
  a plain index on `user_id` (Postgres does not auto-index the referencing side of a foreign
  key, and every push send filters `WHERE user_id = ANY(...)`).
- `routes/userRoutes.js`'s `POST /fcm-token` — `ON CONFLICT (user_id)` → `ON CONFLICT (token) DO
  UPDATE SET user_id = EXCLUDED.user_id, ...`. Request/response shape of the endpoint is
  completely unchanged, so this needs zero changes on either the web portal or this app to pick
  up — both already call it the same way they always have.
- `src/push.ts` — the three previously-silent failure points (`ensurePermission()` returning
  false, the registration POST's own `.catch(() => {})`, and the outer `try/catch`) now all
  `console.warn`/`console.error` with real detail, prefixed `[push]`. **Kept permanently, not
  reverted** — this is exactly the kind of failure (a 500 with zero visible trace, on both
  platforms, for months) that justifies the small ongoing log noise; the API side has an
  equivalent server-side `console.error` already, this just gives the client side the same.

**Status: DEPLOYED AND CONFIRMED WORKING END-TO-END, 2026-09-30.** Migration applied,
`userRoutes.js` uploaded, server restarted. Re-verified from scratch in this order: (1)
`[push] initPush: token registered with backend` in the device logs, no more 500 — confirmed;
(2) re-ran the token-listing query, confirmed `updated_at` moved to today for the account that
just reopened the app; (3) mentioned that account from another device while it sat backgrounded
— **a real tray notification appeared.** The Phase 5 "open mystery" (Firebase confirms delivery,
nothing visually appears) was never a notification-display bug at all — it was this exact
`ON CONFLICT` constraint mismatch the entire time, on every platform, since at least early
August.

Scope of what this actually fixes: everything that resolves a recipient through
`user_fcm_tokens`/`services/staffPush.js` — internal staff chat (mentions, mention reminders,
plain messages, group-add notices) and client-support chat's staff-facing pushes
(`notifyMentionedAgent`/`notifyAssignedAgent`-style, and `notifyAgentsOfCustomerMessage`/the
Operations "notify-operations" broadcast). **Does NOT touch, and was never affected by,**
residential/commercial CLIENT-facing push — `customer_fcm_tokens` and `commercial_fcm_tokens`
are separate tables that already correctly conflict on `token`, confirmed via direct code read
during this investigation; those were never broken by this bug. Worth a spot-check across the
staff-facing notification types above next time one is touched, since this was a shared,
load-bearing bug across all of them, not one scoped to internal staff chat specifically.

### 2026-09-30 (continued further still) — @-mentions in internal staff chat are now "top priority": repeating reminders + pinned-to-top in-app highlight

Explicit ask: when someone is @-mentioned (DM or group, internal staff chat), that should be
hard to miss — a repeating reminder, not a single push, until they actually open the
conversation. User picked the full option (repeating push via a new backend scheduler) over the
lighter one-shot-alert-only option, with the trade-off flagged up front: push notification
DISPLAY is still an open, unresolved item from the Phase 5 entry (Firebase confirms delivery,
nothing visually appears on the two test devices) — the repeat mechanism is built and correct,
but its value is capped until that separate mystery is solved.

**Backend (`sowash-backend`):**
- `docs/migrations/2026-09-30-staff-mention-reminders.sql` (new, **not yet applied** — needs a
  manual psql run same as every other migration in this repo) — two columns on `staff_messages`:
  `mention_reminder_sent_at` (timestamp, null until the first reminder), `mention_reminder_count`
  (int, default 0). Plus a partial index (`WHERE mentioned_user_id IS NOT NULL`) so the
  scheduler's sweep stays cheap as the table grows.
- `services/staffMentionReminders.js` (new) — a plain `setInterval` sweep, not a new cron
  dependency (this backend has none, and adding one for a single periodic query would be out of
  proportion). Every 5 minutes, finds every unread @-mention where at least ~20 minutes have
  passed since it was created (or since its last reminder), re-sends the "X mentioned you" push,
  broadcasts a `mention_reminder` socket event, and bumps the two new columns. Capped at 50
  repeats per mention (~16.7 hours) so a mention to someone on leave doesn't nag forever. Started
  once from `server.js` (`startMentionReminderScheduler()`, right next to
  `initStaffChatSocket(server)`).
- `routes/staffChatRoutes.js`'s `GET /conversations` — added `has_unread_mention` (an `EXISTS`
  subquery, true while an unread message in that conversation has `mentioned_user_id` = the
  caller) to the response, and changed the sort to `ORDER BY has_unread_mention DESC,
  last_message_at DESC` — a mentioned conversation sorts to the top of the Team list regardless
  of how recently it was active, which is the actual "top priority" part of this: the reminder
  push is a courtesy, this ordering is what genuinely can't be missed once the app is open.
- **Deliberately not built: a distinct high-priority Android notification channel** (its own
  sound/vibration, bypassing a muted default channel). Investigated and ruled out for now:
  there is no JS API to register an Android notification channel without adding `notifee` or
  `expo-notifications` as a dependency — and `plugins/withFcmNotification.js`'s own header
  already documents why `expo-notifications` specifically was ruled out during Phase 5 (it
  registers a second `FirebaseMessagingService`, which silently breaks the RNFirebase background
  handler this app's push already depends on). Every staff push, mention reminders included,
  already sends with `android.priority:'high'` (`services/staffPush.js`) — the strongest urgency
  FCM offers without a dedicated channel. A real distinct channel is a separate, bigger step: a
  new native dependency (most likely `notifee`, which is generally compatible with RNFirebase
  messaging unlike `expo-notifications`, but unverified in this project) plus a fresh EAS dev
  build to test it. Flagged for the user to decide whether it's worth pursuing, not started.

**App (`SoWash-Commercial-App`):**
- `src/api/types.ts` — `TeamConversation.has_unread_mention: boolean` (new field, server-sorted
  already — no client-side re-sort needed).
- `src/teamChatSocket.ts` — `TeamSocketEvent` gained a `'mention_reminder'` variant.
- `src/hooks.ts`'s `useTeamConversation` — explicit (no-op) handling for `mention_reminder` in
  the socket listener, for type-safety/exhaustiveness; the real reaction to this event happens in
  `TeamList` (see below), not inside an already-open thread — a reminder should never actually
  fire for a conversation the mentioned person currently has open, since `markRead()` already
  moved their `last_read_at` past the mention by the time the next sweep runs.
- `app/staff/chats.tsx`'s `TeamList` — a mentioned row now renders with a red border/tint
  (`s.rowMentioned`) and an "@ You were mentioned" pill (`s.mentionPill`) in place of the normal
  last-message preview, with the unread count badge itself turning red to match. `TeamList`
  already refetches on ANY socket event (including the new `mention_reminder`), so the pinned
  position and badge update live without a separate handler.

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains); `node -c` clean on all three touched/added backend
files. **Status as of this entry: the user has applied both migration statements, uploaded
`staffMentionReminders.js`/`staffChatRoutes.js`/`server.js` via WinSCP, and restarted the
server** — the scheduler should now exist on the VPS. **Not yet independently confirmed
working** (no server log / pm2 output was checked in this session, and no on-device test has
been run yet). Next-session checklist:
- `pm2 logs`/`pm2 status` — confirm the process came back up clean (no crash-loop) after the
  restart, same "verify before trusting" habit this file's other deploy entries already use.
- Mention someone in a DM or group from a second account; on the mentioned user's device, confirm
  the Team list pins that conversation to the top with the red border + "@ You were mentioned"
  pill immediately — this part needs no waiting, it's driven by `has_unread_mention` on the very
  next `GET /conversations`, not by the reminder scheduler.
- Open that conversation and confirm the highlight clears (`markRead()` firing correctly).
- To confirm the 20-minute repeat sweep itself is actually running, without waiting on a push
  that may not visually appear anyway (see the still-open Phase 5 push-display mystery): leave a
  mention unread for 20+ minutes, then check `staff_messages.mention_reminder_sent_at` /
  `mention_reminder_count` directly via psql for that row — those two columns advancing is proof
  the scheduler fired, independent of whether anything showed up on a phone screen.

### 2026-09-30 (continued further) — Team chat perceived-speed pass: optimistic sending, instant reopen, fewer re-renders

Follow-up to being asked why Team chat doesn't feel as smooth as WhatsApp. Diagnosis (given
inline first, before touching code): (1) messages didn't appear until the full server round
trip finished, (2) reopening a thread always re-fetched from network with a blank spinner —
no local cache at all, (3) polling + typing pings could re-render every visible message row on
every keystroke, and (4) the underlying structural gap — a cross-platform RN/Expo app vs.
WhatsApp's fully native, years-tuned client — which no app-level change fully closes. Tackled
1–3 here, all client-side, `app/staff/chats.tsx` + `src/hooks.ts` + `src/api/types.ts` only, no
backend changes, no deploy needed beyond a reload:

- **Optimistic sending** (`useTeamConversation`'s `send()`, `src/hooks.ts`) — the biggest single
  win. A message now appears in the list the instant you hit send, with a negative placeholder
  id, `pending: true`, and (for a photo) a local `file://` URI (`TeamMessage.localPhotoUri`, a
  client-only field never sent to or returned by the API — added in `src/api/types.ts`) so the
  photo preview renders before `attachment_url` exists. `TeamBubble` fades the bubble to 60%
  opacity and shows a small clock icon in place of the read-receipt tick while pending. On a
  successful response the placeholder is swapped for the real row in one update (deduped against
  anything the socket/poll already delivered); on failure it's simply removed — the composer's
  own draft/photo were already left untouched on a failed send (pre-existing behavior), so
  retrying is just hitting send again, no separate "failed bubble, tap to retry" UI was built.
- **Instant reopen** — a new module-level, in-memory-only `teamConversationCache` (`Map` keyed by
  conversation id, in `src/hooks.ts`) holds the last known-good `{conversation, messages}` for
  every conversation opened this app session. `open()` now hydrates from it synchronously before
  the network call, so backing out to the Team list and reopening the same thread renders
  instantly instead of a blank spinner; the real fetch still runs underneath and overwrites it
  with current data. `poll()` also keeps the cache warm. **Explicitly not** a real persistence
  layer (nothing written to disk, cleared on app restart, cold-launch still shows a spinner) —
  that's the bigger, separate undertaking already flagged in the 2026-09-22 performance-audit
  entry below; this is the contained version of the same idea for the one screen it mattered most
  on.
- **Fewer re-renders** — `TeamBubble` and `TeamSystemLine` wrapped in `React.memo`. Typing in the
  composer now calls `notifyTyping()` on every keystroke (yesterday's feature), which previously
  re-rendered every visible message bubble on every keystroke along with it; memoizing means a
  bubble only re-renders when its own props actually change. Poll-driven `conversation` updates
  (read receipts) still invalidate every bubble's memo every ~5s either way — reducing that
  further would need restructuring how ticks are computed, not attempted here.

**Deliberately not done, and why:**
- **Polling frequency wasn't reduced even though the socket already delivers most of this
  live.** CLAUDE.md's Phase 5 entry documents that WebSocket connectivity through the VPS's
  reverse proxy is **still unconfirmed** in production — slowing or dropping the 5s poll based on
  "the socket is connected" would risk silently degrading message delivery to worse than today's
  baseline if sockets don't actually work there. Revisit once that's confirmed one way or the
  other.
- **No real on-device persistence (SQLite/AsyncStorage-backed cache).** The in-memory cache above
  gets most of the same user-facing win for the common "switch tabs and come back" case at a
  fraction of the effort; a real persistence layer is a separate, larger piece of work (schema,
  migration-on-schema-change, cold-launch hydration) that hasn't been started.

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains, as always). **Not yet verified on-device** — folded into
the same on-device pass as the last few Team-chat entries: send a text message and a photo
message and confirm each appears immediately (not after a visible delay), confirm a pending
bubble's clock icon flips to the normal tick once it lands, back out of a thread and reopen it to
confirm it renders without a spinner flash.

### 2026-09-30 (continued) — WhatsApp-style "typing…" indicator, internal staff chat only (DMs + groups)

Scoped deliberately to the Team side of `app/staff/chats.tsx` (confirmed with the user first) —
**not** the client-support chat (`Support` section here, or the client app's own Support tab),
which has no real-time layer at all today and would need one built from scratch, a much bigger
lift than this. Team chat already has a WebSocket (`services/staffChatSocket.js` /
`src/teamChatSocket.ts`, from the Phase 5 build), so this piggybacks on it.

- **`services/staffChatSocket.js`** — the socket was receive-only from the client's point of
  view until now (server → client broadcast, nothing the other way). Added one `ws.on('message',
  ...)` handler: the ONLY thing a client may send over this socket is `{type: 'typing'|
  'stop_typing', conversation_id, recipient_ids}`, relayed via the existing `broadcastToUsers()`
  to `recipient_ids` (with the sender's own id stripped, and the sender's real `userId` — from
  the JWT-verified connection, never trusted from the message body — attached as `user_id`).
  Deliberately does **no DB query** to look up participants: the client already has this
  conversation's own participant list (from `GET /conversations/:id`, which it fetched to render
  the thread) and sends it right back as `recipient_ids`, keeping this consistent with the
  module's existing no-DB-in-the-hot-path design for everything except the one per-connection
  role check. Trusting that list is a deliberate, low-stakes call — worst case is a stray
  "typing…" bubble shown to another already-authenticated staff account; nothing is written
  anywhere.
- **`src/teamChatSocket.ts`** — `TeamSocketEvent` union gained `'typing'`/`'stop_typing'`
  variants; new `sendTyping(conversationId, recipientIds, isTyping)` export, a fire-and-forget
  no-op when the socket isn't connected (there's no polling fallback for "is someone typing
  right now" — the indicator just doesn't show, the correct degrade for a nice-to-have).
- **`src/hooks.ts`'s `useTeamConversation`** — now takes a second argument, `myUserId`
  (`TeamThreadView` passes `user?.id`), needed to exclude yourself from the recipient list and
  from your own incoming-typing state. Added: `typingUserIds` (auto-expires any id after 6s in
  case a `stop_typing` ping is ever lost — app backgrounded, socket hiccup — rather than trusting
  the network to always deliver the "stopped" half), `notifyTyping()` (call on every keystroke;
  sends `typing` at most once per pause, schedules `stop_typing` after 3s of silence — same
  debounce shape WhatsApp's own client uses), and `stopTyping()` (call when the draft is cleared
  or a message is actually sent, so the other side isn't left staring at a stale typing bubble
  waiting out the 3s decay). A `staff_message` socket event also clears that sender's typing
  state immediately — you can't still be "typing" once the message has actually landed.
- **`app/staff/chats.tsx`'s `TeamThreadView`** — `onDraftChange` calls `notifyTyping()`/
  `stopTyping()` based on whether the draft is empty; the header subtitle (previously "N members"
  for a group, nothing for a dm) now shows "X is typing…" / "X and Y are typing…" / "N people are
  typing…" in the accent color whenever `typingUserIds` is non-empty, falling back to the old
  member-count line otherwise.

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains, as always); `node -c` clean on both touched backend
files. **Not yet verified on-device or deployed** — `services/staffChatSocket.js` needs the
usual WinSCP upload + `pm2 restart` before this works for real (the client-side half is
harmless without it — `sendTyping` just silently no-ops against a server that doesn't yet relay
it). Folding this into the same on-device pass as the last two Team-chat entries: type in one
device's open thread and confirm the other device (already sitting in that same thread) shows
"typing…" within a keystroke or two, and confirm it clears within ~3s of stopping and
immediately on send.

### 2026-09-30 — Group Info screen gained a WhatsApp-style shared-media grid

Follow-up to yesterday's Group Info redesign, same file (`app/staff/chats.tsx`), still no
backend changes — the media grid is derived entirely client-side from messages the thread has
already loaded, not a new endpoint.

- **`GroupInfoView`** now takes a `messages: TeamMessage[]` prop (passed straight from
  `TeamThreadView`'s own `useTeamConversation` state) and derives a `media` list — every message
  with a non-null `attachment_url`, resolved through the shared `photoUrl()` helper, newest
  first (matching WhatsApp's own group-media ordering). This reuses whatever
  `useTeamConversation` already fetched (`GET /conversations/:id/messages` with no `after_id`
  returns up to the 500 oldest messages, per `staffChatRoutes.js`) — no new request, no new
  route.
- New section between "Add members" and the member list: a "N MEDIA" label + a 3-column square
  thumbnail grid (`s.mediaGrid`/`s.mediaThumbWrap`/`s.mediaThumb`), capped at 9 thumbnails with a
  "+N more shared in this group" line beyond that — same capped-strip-with-overflow-note
  convention `PhotoStrip` elsewhere in the app already uses, just as a grid instead of a
  horizontal scroll since that's the shape WhatsApp's own version uses.
- **`MediaViewerView`** (new) — full-screen, swipe-through viewer opened by tapping a thumbnail:
  black background, header shows the sender's name + `formatDateTime` timestamp for whichever
  photo is currently centered plus an "N / total" counter, a horizontal paging `FlatList`
  (`initialScrollIndex` set to the tapped thumbnail, `contentFit="contain"` so nothing crops).
  Same full-screen-replace convention as everything else in this file — `GroupInfoView`
  early-returns to it when a thumbnail is tapped, same pattern as its own early-return to
  `PeoplePickerView` for "Add members."
- No existing lightbox/full-screen image viewer existed anywhere in this app to reuse (checked —
  every other photo strip, e.g. `JobDetailBody.tsx`'s `PhotoStrip`, is scroll-only, no tap-to-
  enlarge) — `MediaViewerView` is genuinely new, not a port of something else.

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains, as always). **Not yet verified on-device** — bundled
into the same tomorrow-morning on-device pass as yesterday's Group Info work (see that entry's
own checklist, now extended to include: tap a thumbnail in a group with photo messages, confirm
the viewer opens on the right photo and swipes correctly between others, confirm the "+N more"
line appears once a group has more than 9 shared photos). Pure JS/TS change, no new native
dependency — same reload-only deploy story as yesterday's entry.

### 2026-09-29 (continued further) — Group management UI rebuilt to match WhatsApp: tap-the-header Group Info screen + a reusable full-screen contact picker

Follow-up to the Phase 5 internal staff chat entry directly below. The user asked, with two
WhatsApp screenshots as reference: replace the "Manage" button (which opened
`ManageGroupSheet`, a bottom sheet) with WhatsApp's own pattern — tapping the group name/avatar
in the thread header opens a full-screen Group Info page, and adding members opens a
full-screen contact picker (search bar at the top of a normal screen), not a sheet. Pure
app-side UI change, entirely inside `app/staff/chats.tsx` — no backend changes, no migration:
every action here (`renameTeamGroup`, `updateTeamGroupMembers`, `startTeamDm`,
`createTeamGroup`) already existed against `/api/staff-chat/*` from the Phase 5 build, this
only changes how the UI reaches them.

- **`ManageGroupSheet` removed entirely**, replaced by two new components:
  - **`PeoplePickerView`** — a reusable full-screen contact picker: back button + title, an
    optional right-side "Done (N)" confirm action, an optional `headerExtra` render slot, a
    search box, then a plain `FlatList`. Two interaction modes: `multi=false` fires
    `onPickSingle` immediately on tap (used for starting a DM), `multi=true` toggles a checkbox
    via `onToggle` and waits for the confirm action (used for picking group members). No
    keyboard-positioning logic of any kind — the search box lives at the top of an ordinary
    screen, so the class of keyboard-overlap bug that took many rounds to fix in the old bottom
    sheets (see the Phase 5 entry below) structurally cannot happen here.
  - **`GroupInfoView`** — full-screen: large avatar, tap-to-rename name (admins only, inline
    text field + checkmark), "Group · N members" subtitle, an "Add members" row (admins only),
    and a scrollable member list with a per-row remove action (admins only, not shown for your
    own row). Early-returns into `PeoplePickerView` (multi-select, filtered to exclude current
    members) when "Add members" is tapped — same full-screen-replace convention already used
    elsewhere in this file (`StaffChatsScreen` ↔ list/thread, `TeamThreadView` ↔ this).
- **`TeamThreadView`** — the header's avatar+title is now one `TouchableOpacity`
  (`onPress={() => setShowInfo(true)}`), enabled only for `kind === 'group'` conversations (a
  DM has nothing to show), and early-returns to `GroupInfoView` when `showInfo` is true. The
  old "Manage" chip `TouchableOpacity` is gone.
- **`NewConversationSheet`** — rewritten as a thin wrapper around `PeoplePickerView`: the
  dm/group mode toggle and (in group mode) the group-name field are passed through
  `headerExtra`, everything else (search, list, selection) is `PeoplePickerView`'s. Also
  switched from a bottom-sheet overlay to a full screen — `TeamList` now early-returns to it
  (`if (newOpen) return <NewConversationSheet .../>`) instead of rendering it as an
  absolute-positioned overlay on top of the list.
- Incidental cleanup: the `Users` lucide icon import became unused once the old "Manage" chip
  was removed and was deleted; `Pencil` was added for the rename affordance in `GroupInfoView`.
- `AssignPicker` (the Support/client-chat side's assignee picker) is now the **only** remaining
  bottom sheet in this file — it wasn't touched, since the request was specifically about group
  management, not client-support chat.

**Verification:** `npm run typecheck` clean (only the pre-existing, unrelated
`app/(tabs)/_layout.tsx` error remains, as always). **Not yet verified on-device** — the user
is continuing this tomorrow. Since this is a pure JS/TS change with no new native dependency or
permission, it only needs a reload of the existing dev-client build, not a new EAS build.

**Next step (tomorrow):** on-device check of the new flow — tap a group's name/avatar in
`TeamThreadView` and confirm `GroupInfoView` opens; rename a group inline; tap "Add members" and
confirm the full-screen picker excludes current members and adds correctly; confirm per-row
remove works and hides for your own row and for non-admins; confirm `NewConversationSheet`'s
full-screen DM tap-to-start and group create-with-name-and-multi-select both still work now that
they're not a bottom sheet. The push-notification-display mystery from the Phase 5 entry below
is still open and unrelated to this change — re-test it separately once the fresh dev-client
build mentioned there is installed.

### 2026-09-29 (continued) — Internal staff chat (Phase 5) built and live-tested end to end; performance/camera/responsiveness pass; one open mystery (push notifications not visually appearing on device)

The feature designed-but-not-built at the end of the 2026-09-28 entry — DMs + groups between
office users — is now built, deployed, and live-tested on both repos, driven by real two-device
testing (Samsung Galaxy A71 = `ci_admin`, Samsung A10s = `ops`).

**Backend (`sowash-backend`), all uploaded and live:**
- `config/staffRoles.js` (new) — the single `STAFF_ROLES` list (`ci_admin, operations, admin,
  sales, accounts`), now the one source both `officePortalAuth.js`'s `OFFICE_ROLES` (the mobile
  login gate) and `commercialChatRoutes.js`'s `SUPPORT_ROLES` import from. **Fixed a real, live
  bug found while building this**: those two had drifted — `OFFICE_ROLES` only had 3 of the 5
  roles, meaning `sales`/`accounts` staff could never actually get past the mobile app's own
  login screen at all, regardless of what `SUPPORT_ROLES` claimed to support. Since
  `routes/portalAuthRoutes.js`'s office-login branch reads `OFFICE_ROLES` directly, this one
  shared source immediately widened who can use the mobile staff app, not just internal chat.
- `docs/migrations/2026-09-29-staff-internal-chat.sql` — three tables (`staff_conversations`,
  `staff_conversation_participants`, `staff_messages`), applied by hand, verified against a live
  schema dump. Simpler than the original design sketch: one `mentioned_user_id` column per
  message (no separate mentions table — matches what the app's mention picker can actually
  express), and `last_read_at` lives directly on `staff_conversation_participants` (no separate
  reads table — there's already exactly one row per (conversation, user)).
- `services/staffChatNotifications.js` (new) — push-only, mirrors `commercialNotifications.js`'s
  `notifyMentionedAgent`/`notifyAssignedAgent` contract (never throws, no feed-table row).
- `services/staffChatSocket.js` (new) — WebSocket layer, attached to the same `http.Server`
  `server.js` already listens on (no second port). Deliberately does no DB queries in the
  message-broadcast path (only one live role check per new connection) to keep the shared,
  non-pooled `pg.Client` out of the way.
- `routes/staffChatRoutes.js` (new) — `/api/staff-chat/*`: directory, conversations (get-or-create
  dm, admin-only group creation), messages, read receipts, unread count, group rename/membership
  (gated on per-conversation admin role, distinct from the org-level admin check group *creation*
  uses).
- `server.js` — bottom `app.listen(...)` replaced with `http.createServer(app)` +
  `server.listen(...)` (functionally identical, just gives the WebSocket server something to
  attach to) + the new route mount. Every other line untouched. A pre-change backup was taken
  first (`.claude-backups/server.js.<timestamp>-pre-websocket.bak`), per this repo's existing
  convention.
- **Bug found and fixed post-deploy**: `POST /conversations`'s dm get-or-create used
  `ON CONFLICT (dm_key) DO NOTHING` against `uq_staff_conversations_dm_key`, a **partial** unique
  index (`WHERE dm_key IS NOT NULL` — groups have a null `dm_key` and shouldn't collide on it).
  Postgres only infers a partial index as an `ON CONFLICT` arbiter when the clause's own `WHERE`
  matches the index's predicate exactly; without it, every dm-creation attempt threw "no unique
  or exclusion constraint matching," surfaced to the app as "failed to create conversation."
  Fixed by adding `WHERE dm_key IS NOT NULL` to the `ON CONFLICT` clause — a one-line SQL fix, no
  new migration needed.
- New dependency: `ws`. **Deploying it surfaced two unrelated, pre-existing problems, not caused
  by this feature** — worth remembering:
  - The user's own local `package-lock.json` (never regenerated in this session, since
    `npm install` was deliberately never run locally against files meant for the live VPS) got
    uploaded alongside the code changes. `npm install ws --save` on the VPS then used that
    mismatched lockfile as its resolution baseline, causing a much bigger reconciliation than
    intended (33 added, 41 removed, 15 changed) — which silently dropped `axios`, an undeclared
    dependency `routes/attendanceRoutes.js` requires directly but that was never listed in
    `package.json` (a pre-existing gap, probably hand-installed on the VPS once and never synced
    back). That crashed the entire backend on the next `pm2 restart` (`MODULE_NOT_FOUND`) until
    `npm install axios --save` fixed it live and `axios` was added to `package.json` here too.
    **Standing rule now: never upload `package-lock.json` from this local checkout to the VPS** —
    it doesn't reflect what's actually installed there, and forcing them to match risks exactly
    this kind of surprise. The VPS's own lockfile is authoritative, not this one.
  - `routes/middleware/notificationRoutes.js` has its own, unrelated, currently-broken push call
    (`FirebaseMessagingError: MulticastMessage must be a non-null object`) — found only because
    it happened to log around the same time as this feature's testing. Not investigated further;
    flagging for whenever that code path is next touched.

**App (`SoWash-Commercial-App`):**
- `src/api/types.ts` — `TeamMessage`, `TeamConversation`/`TeamConversationDetail`,
  `StaffDirectoryUser` + response types. `NotificationType` deliberately does **not** include
  `'team_message'` — that push is push-only (never writes a `commercial_notifications` row), so
  it can never actually appear on `AppNotification.type`; `notificationTarget()`'s own param type
  is intentionally looser than this union for exactly this reason.
- `src/teamChatSocket.ts` (new) — thin client using RN's built-in `WebSocket` global (no new
  app-side dependency), reconnects with backoff, started/stopped from `app/staff/_layout.tsx`
  (staff-only scope). Whether it ever actually connects depends on the VPS's reverse proxy
  passing the WS upgrade through — **still unconfirmed either way**, which is why every hook
  built on it keeps polling underneath regardless of socket state.
- `src/hooks.ts` — `useStaffDirectory`, `useTeamConversations`, `useTeamUnread`,
  `useTeamConversation` (mirrors `useStaffChatThread`'s open/poll/send shape), plus
  `startTeamDm`/`createTeamGroup`/`renameTeamGroup`/`updateTeamGroupMembers`.
- `src/photoPicker.ts` (new) — shared "take photo or choose from library" flow (see below).
- `app/staff/chats.tsx` — a "Support"/"Team" segmented switch at the top of the existing Chats
  tab (not a new tab, not a new route — matches this file's own header comment, which already
  anticipated this). New: `TeamList`, `TeamThreadView`, `TeamBubble`, `NewConversationSheet` (dm,
  or admin-only group creation), `ManageGroupSheet` (rename + add/remove members, gated on
  per-conversation admin role).
- `app/staff/_layout.tsx` — centre tab badge now sums `useStaffChatUnread()` (client-support) +
  `useTeamUnread()` (Team).
- **Bug found and fixed**: neither inbox list (`ThreadList` nor the new `TeamList`) had any
  auto-refresh at all — `useStaffChatThreads`/`useTeamConversations` are one-shot `useAsync`
  loads, unlike an open thread which already polls every 5s. A new message's preview/unread
  badge never updated on the LIST screen without a manual pull-to-refresh, for **both** Support
  and Team (a pre-existing gap for Support, never previously noticed). Fixed: both lists now poll
  every 5s while focused, and the Team list also refreshes instantly on any WebSocket delivery.

**Second pass, same day — performance + camera + responsiveness, ahead of a fresh EAS
dev-client build:**
- New dependency: `expo-image` (installed locally this time without concern, since this is the
  app repo talking to production, not a live server process to protect the way the backend is).
  Swapped in for every real photo-heavy screen: `app/staff/jobs.tsx`'s job-detail photo strip +
  attendance photos, the shared `JobDetailBody`/`PhotoStrip` (job route + chat popup),
  `ChatVisitCard.tsx`, both documentation screens (TBT, Safety Training),
  `app/maintenance/[id].tsx`, and both chat message photo bubbles (Support + Team). **Deliberately
  left `SldWalkthrough.tsx` untouched** — its before/after point-photo viewer uses a hand-built
  `Animated.Image` cross-fade that isn't a drop-in swap; converting it is its own future pass.
- `app.json` — `expo-image-picker`'s `cameraPermission` flipped from `false` to a real permission
  string (was explicitly disabled). New `src/photoPicker.ts` gives all three chat composers
  (Support + Team in `chats.tsx`, plus the client app's own Support tab) a "Take Photo or Choose
  from Library" prompt instead of library-only — one shared helper instead of tripling the logic,
  since all three composers' `pickPhoto` were already byte-for-byte identical.
- Responsiveness: `ChatVisitCard.tsx`'s card width and both chat photo-bubble sizes were
  fixed-pixel (238 / 200×150) — could force a bubble wider than its own 78%-of-screen cap on a
  narrow phone (confirmed on the Samsung A10s specifically). Now derived from
  `useWindowDimensions` with min/max clamps. The three search/picker bottom sheets in
  `chats.tsx` (`AssignPicker`, `NewConversationSheet`, `ManageGroupSheet`) had **no keyboard
  handling at all** — confirmed via a repo-wide check that this is the *only* place in the app
  combining a `Modal` with a `TextInput`, and none of them wrapped in `KeyboardAvoidingView` (a
  `Modal` renders in its own native root, so the screen's own outer `KeyboardAvoidingView` never
  reached inside it). All three now wrap their sheet content in their own `KeyboardAvoidingView`.
- Both repos' `npm run typecheck` clean throughout (only the pre-existing, unrelated
  `app/(tabs)/_layout.tsx` error remains, as always).

**Open, unresolved — the one real mystery from this session: push notifications for internal
chat.** Extensively live-tested across both directions (admin↔ops) and both message shapes
(plain message, `@mention`), using the real two-device setup. **The backend is conclusively
proven correct** — temporary debug logging added directly into `insertStaffMessage` showed the
exact recipient list and token lookup, and Firebase's own `sendEachForMulticast` API reported
`sent: 1, failed: 0` on every one of four separate tests, to both devices, in both directions.
Despite that, **no OS-level notification (banner, lock screen, status bar) ever appeared on
either device for anything, the entire session** — including the client-support chat
mention/assign notifications initially believed to already be working; that belief turned out to
be based on watching the message appear *inside* the app (which the list-polling fix above
addresses), not an actual tray notification. So this was never a "team chat vs. client chat"
discrepancy — nothing in this app produced a real push banner on these two test devices during
this whole investigation, despite Firebase confirming delivery every time.

Two hypotheses, neither yet confirmed:
1. The Android 13+ gotcha `src/push.ts` itself already warns about — a token can register
   successfully (and receive data) even when the OS never granted the *real* notification-
   permission prompt, which a user can't always tell apart from "permission granted" in Settings.
2. The APK/dev-client installed on both test phones may predate or not correctly include the
   native notification-channel/icon config (`plugins/withFcmNotification.js`) needed for Firebase
   to draw a tray notification at all — a **native** config, unlike almost everything else fixed
   this session, so it only takes effect through a real rebuild, not a JS reload.

**Next step, in progress as of this entry**: the user is running
`eas build --platform android --profile development` — a genuinely fresh install, going through
the notification-permission prompt from zero, is the cleanest way to rule either hypothesis in or
out. **Re-test push notifications specifically once that build is installed, on both devices,
with the app fully closed before sending** — not just the chat feature itself, which is already
confirmed working via polling either way.

**Status:** internal staff chat (Phase 5) is fully built, deployed, and functionally working via
polling (WebSocket connectivity through the VPS's reverse proxy still unconfirmed either way,
same open question as when this was designed). Push notification *delivery* is proven
server-side; push notification *display* is the one open item, with the fresh dev-client build
as the next diagnostic step. The performance/camera/responsiveness pass is done and typechecks
clean, but **not yet verified on-device** — the same new build covers all of it, so verify photo
loading speed, camera capture, and the sheet-keyboard fixes at the same time as re-testing push.

### 2026-09-28 — Office/staff mode: login, app shell, cross-client Jobs/Clients, client-support chat

The big one: this app now has a second, parallel identity. A `users` row with `Type` one of
`ci_admin` / `operations` / `admin` / `sales` / `accounts` can sign in through the **same** login
screen and land in an entirely different experience — `app/staff/*` — instead of the client
tab tree. Built in four phases plus a large fifth round of chat polish driven by live two-device
testing. Internal staff-to-staff DMs/groups (the original "Phase 5") were **designed but not
built** — see "Not built: internal staff chat" near the end of this entry.

**Phase 1 — office session (`sowash-backend`):**
- `middleware/officePortalAuth.js` (new) — mirrors `middleware/portalAuth.js`'s shape exactly:
  a third token kind, `kind:'office_portal'`, 30-day TTL, `signOfficeToken()` /
  `authenticateOffice()` / `requireOfficeRole()`. `middleware/portalAuth.js` itself was **not**
  touched, deliberately, to keep zero risk to the live client app.
- `routes/middleware/auth.js` — the STAFF gate 28 route files depend on — got one additive line:
  `office_portal` is now allowlisted alongside the pre-existing "no kind at all" rule. Verified
  with an isolated 4-scenario test (legacy kind-less token, `portal`, `customer`, `office_portal`)
  that nothing else changed.
- `routes/portalAuthRoutes.js` — `POST /auth/login` now branches: `Type === 'customer'` path is
  byte-for-byte the original code; `Type` in the office role list gets a new `office_portal`
  token instead of a 403.
- **Live-tested and confirmed working**: office login, and a regression check that client login
  still works unchanged.

**Phase 2 — role-aware app shell:**
- `src/auth/AuthContext.tsx` — `appRole: 'client' | 'staff'`, derived from login's `role` field.
  Staff sessions skip `GET /customer/profile` entirely (client-only endpoint, would 403 for a
  staff session) both on restore and on sign-in.
- `app/_layout.tsx` — redirects a staff session to `/staff` (a **real path segment**, not a route
  group — `app/(tabs)/` already claims `/`), with a same defence-in-depth redirect the other way.
- `app/staff/_layout.tsx` + `src/components/FloatingTabBar.tsx` (new, shared component) — the
  same floating-pill tab bar visual as the client app, extracted so `app/(tabs)/_layout.tsx`
  itself was never touched. 5 tabs: Overview, Jobs, **Chats** (raised centre slot, mirroring
  Support's role for the client), Clients, Account.
- `src/staff-context.tsx` (new) — `StaffScopeProvider`, the office equivalent of
  `site-context.tsx`: "which CLIENT am I looking at," not persisted across restarts.

**Phase 3 — Jobs & Clients tabs (read-only, per the architecture decision):**
- `routes/schedulingRoutes.js` — `GET /history` gained an optional `office_client_id` filter
  (deliberately **not** named `client_id` — three existing `sowash-frontend` pages already send a
  vestigial, previously-ignored `client_id` param to this endpoint on every request; reusing that
  name would have turned a dormant bug into three broken pages) plus `approval_status`/
  `approved_at` columns, TBT photos (parsed server-side from `temp_voltage_photos`'s two possible
  shapes), and per-job `attendance` (json_agg from the `attendance` table, joined on `job_id`).
  New `GET /clients` endpoint, sorted by most-recent-activity (`last_job_date`) rather than
  alphabetically. `GET /stats` gained an opt-in `period` param (`month`/`last_month`/`year`) —
  calendar-aligned, defaults to all-time (unchanged) when omitted, so the one existing caller
  (`CI/JobHistory.js`) is untouched.
- `app/staff/jobs.tsx` — a **two-level drill-down**, not a flat list: client index by default,
  tap a client to see only their visits (search, status badges, "Pending approval" flag for
  completed-but-unapproved work). Detail popup has a connected-dot progress timeline (reusing
  `STAGES`/`stageIndex()` from `src/hooks.ts`, the same visual `JobDetailBody.tsx` uses for
  clients), capped photo strips (Before/After/TBT, six visible + tap for more — uncapped photo
  strips were the direct cause of a reported scroll lag), and an Attendance section. Wrapped in a
  `DetailErrorBoundary` so a render crash shows the actual error text instead of Metro's opaque
  red screen — added specifically because a crash was reported with no visible error message; the
  eventual real cause (see "bugs found" below) was unrelated to any of this screen's own code.
- `app/staff/clients.tsx` — the client picker; tapping one sets the shared scope and jumps to Jobs
  already filtered, mirroring `app/(tabs)/sites.tsx`'s own site-tap pattern.
- `app/staff/index.tsx` — KPI tiles (This month / Last month / This year / All time pills) +
  recent-activity feed.

**Phase 4 — client-support chat (`app/staff/chats.tsx`, new):**
- Talks to the **already-existing** `/api/commercial-chat/*` (`routes/commercialChatRoutes.js`) —
  no new backend needed for the base inbox/thread/reply flow, since Phase 1's `authenticate`
  change already made it reachable with an office token.
- `SUPPORT_ROLES` in `commercialChatRoutes.js` widened from `['ci_admin']` to
  `['ci_admin','operations','admin','sales','accounts']` at the user's explicit request, after
  confirming via a live-data check of `users."Type"` (7 distinct values exist; `FO` and
  `customer` deliberately excluded) that this is the real, complete staff role set. This one
  constant gates commercial-chat access, the Assign picker's contents, and who can be
  `@`-mentioned, all at once.
- **Assign** — `PATCH /threads/:id` now also drops a `sender_kind='system'` message into the
  thread ("Fatima assigned this conversation to Ahmed" — the `system` value the schema's CHECK
  constraint always allowed but nothing had used), pushes the newly-assigned agent, and returns
  the same fully-joined shape `GET /threads/:id` does (a bare `RETURNING *` was leaving the app
  with no `assigned_name`, so a *successful* assign looked identical to a failed one). Picker has
  type-to-filter search (by name or email).
- **`@`-mention** — new column `commercial_chat_messages.mentioned_user_id`
  (`docs/migrations/2026-09-28-commercial-chat-mentions.sql`, **applied**), composer detects `@`
  at the end of the draft and shows a live-filtered inline picker, mentioned agent gets pushed,
  their name renders bold in the sent bubble. Both this and the Assign picker's lists are wrapped
  in `ScrollView` with `keyboardShouldPersistTaps="handled"` — the first version used a plain
  `View` with `overflow:'hidden'`, which silently clipped and made untappable any names past the
  visible height, reported as "not responsive."
- **Staff push notifications** — root-caused and fixed a bug that meant staff push had *never*
  worked at all: `src/push.ts` was registering every session's FCM token against
  `/customer-portal/push/register`, which `authenticatePortal` rejects outright for an
  `office_portal` token. The real staff endpoint (`POST /api/user/fcm-token`,
  `routes/userRoutes.js`, already existed, already accepted staff tokens, already wrote to the
  table `services/staffPush.js` reads from) needed zero backend changes — `initPush()` just never
  called it. Now role-aware (`src/push.ts`, `src/hooks.ts`'s new `registerStaffPushToken`,
  `app/_layout.tsx` passes `appRole` through).
- **Unread badge** — `AGENT_UNREAD_EXPR` only ever counted unanswered *customer* messages
  (inherited from the web console); a colleague `@`-mentioning you never incremented anything.
  Now also counts messages where `mentioned_user_id` = the viewing agent, independent of whether
  someone else replied after (a colleague answering doesn't "un-mention" you).
- **Inbox "You:" prefix** — was `last_sender_kind === 'agent' ? 'You:' : ''`, i.e. *any* agent's
  message showed as "You:" once more than one role could reply to the same thread. Backend now
  looks up the actual last sender via a correlated subquery (`commercial_chat_threads` itself has
  no `last_sender_user_id` column) and the app compares against the viewer's own id.
- **Message bubble left/right alignment — reported broken, root cause found, fix NOT yet
  applied anywhere (not in this repo, not on the server).** Same class of bug as the two above:
  `Bubble`'s `mine` check in `app/staff/chats.tsx` was `sender_kind === 'agent'` alone, so every
  staff-sent message rendered on the right for every viewer regardless of who actually sent it —
  indistinguishable once more than one role could reply to a thread. The app-side half of the fix
  **is** applied (`ChatMessage` gained an optional `sender_user_id`; `Bubble` now takes a
  `myUserId` prop and checks `sender_kind === 'agent' && sender_user_id === myUserId`). The
  backend half — `sender_user_id` needing to be added to `CHAT_MESSAGE_SELECT` and `shapeMessage`
  in `routes/commercialChatRoutes.js` — could not be saved last session: a Claude Code
  infrastructure outage (the safety-check step that must approve every file edit stopped
  returning a verdict) blocked every retry for the rest of the session, across many attempts and
  several separate turns. **Applied 2026-09-29** (see that date's entry below) — the fix is now
  in the `sowash-backend` working tree, syntax-checked, but **not yet deployed**.

**Bugs found along the way, unrelated to any single phase above:**
- `field_service_reports.schedule_id` has a foreign key but **no unique constraint** — "one FSR
  per visit" was a documented design convention, never actually enforced. A visit with two FSR
  rows made `/schedule/history`'s plain `LEFT JOIN` fan out into two result rows for one
  `schedule_id`, which the app's `FlatList` surfaced as a "two children with the same key" React
  warning — eventually traced there after several rounds of chasing a red herring (the newly-added
  TBT/attendance fields, which were in fact fine). Fixed by joining against a
  `DISTINCT ON (schedule_id) ... ORDER BY schedule_id, id DESC` subquery instead of the raw table.
- The 7 backend files documented in §7.1 as missing were recovered mid-session by the user
  downloading them from the VPS — but the download tool twice silently overwrote files already
  edited this session (once dropping the entire `routes/mideast/*` set into `routes/middleware/`,
  clobbering the just-edited staff auth gate; once reverting `services/commercialNotifications.js`
  to pre-session HEAD, losing the mention-notification function). Both caught via `git diff
  --stat` against HEAD before trusting anything the download touched, and restored from
  `.claude-backups/` snapshots taken specifically for this. Worth remembering: **any future
  "download missing files" pass needs to be checked against `git status` before trusting it**,
  since it doesn't distinguish "genuinely missing" from "already here and being worked on."

**Not built: internal staff chat (direct messages + groups between office users).** Asked about
directly; designed in conversation, zero code written. The plan, for whenever this is picked up:

- Genuinely new backend surface — nothing existing to lean on the way Phase 4 leaned on
  `commercial-chat`. New tables mirroring the proven `commercial_chat_*` shapes (get-or-create
  via `ON CONFLICT`, one row per message never bumped in place, per-participant read marks):
  `staff_conversations` (`kind: 'dm'|'group'`, name/avatar null for a dm), `staff_conversation_
  participants` (`role: 'admin'|'member'`), `staff_messages`, `staff_message_mentions`.
- Access: any office user (the same `SUPPORT_ROLES`-equivalent set, or possibly the broader
  `OFFICE_ROLES` from Phase 1 — undecided) can start a DM with any other office user. **Group
  creation is admin-role only**, per the user's explicit instruction when this was discussed —
  members can post once added, only an admin manages membership.
- `@`-mention here would work exactly like Phase 4's, once `mentioned_user_id` exists on
  `staff_messages` too — same directory endpoint doubles as the group-member picker and the
  mention picker.
- Real-time: the rest of this app polls (5s while a screen is focused, matching `useChat()`).
  WebSockets were discussed as the "more real" option for internal chat specifically, but nothing
  in this backend has a socket layer today (no `socket.io`/`ws` dependency, no nginx upgrade
  config) — that is real new infrastructure, not a small addition, and was left as an open
  decision rather than started.
- Where it surfaces in the app: a second section on the existing `app/staff/chats.tsx` screen
  (client-support inbox + a "Team" section), not a new tab — the Chats tab was already designed
  with this in mind.

**Status:** app-side work (Phases 1–4, all the UI) is committed to the working tree and
typechecks clean (only the pre-existing, unrelated `app/(tabs)/_layout.tsx` error remains).
Backend files have been iteratively uploaded and live-tested throughout — `middleware/
officePortalAuth.js`, `routes/middleware/auth.js`, `routes/portalAuthRoutes.js`,
`routes/schedulingRoutes.js`, `routes/commercialChatRoutes.js`, `services/
commercialNotifications.js` — but the **most recent** `commercialChatRoutes.js` change
(`sender_user_id`, see above) was, as of this entry, only written in the local working tree, not
yet uploaded/deployed. **As of 2026-09-29 the fix has been applied to the local working tree**
(see that date's entry below) but still needs a WinSCP upload + `pm2 restart` before the
message-bubble alignment bug is actually fixed for real users. Re-verify current deploy state
against `.claude-backups/*.bak` timestamps before assuming anything past the unread-badge/
last-sender-name fix is live.

### 2026-09-29 — Applied the `sender_user_id` fix left pending from 2026-09-28

Picked up the one explicit to-do left at the end of the 2026-09-28 entry: `sowash-backend/
routes/commercialChatRoutes.js`'s `CHAT_MESSAGE_SELECT` now selects `m.sender_user_id` (right
after `m.sender_kind`) and `shapeMessage` now returns `sender_user_id: row.sender_user_id ||
null` (right after `sender_kind`) — exactly the two lines specified in that entry. Verified with
`node -c` that the file still parses. Confirmed via grep that the app side
(`src/api/types.ts`'s `ChatMessage.sender_user_id`, `app/staff/chats.tsx`'s `Bubble`/`myUserId`)
was already wired and waiting, unchanged since 2026-09-28.

**Status:** change exists only in the local `sowash-backend` working tree — not committed (no
commit was requested), not uploaded via WinSCP, not `pm2 restart`ed. The message-bubble
left/right alignment bug this fixes is **still live in production** until that deploy happens.
This repo's own working tree (`SoWash-Commercial-App`) was not touched this session — the
app-side field was already correct.

### 2026-09-22 — Login screen keyboard fix, EAS APK build profile, session status

**Login screen fix (`app/login.tsx`):** reported as "make the login page responsive when
typing." Root cause: `KeyboardAvoidingView`'s `behavior` prop was
`Platform.OS === 'ios' ? 'padding' : undefined` — on Android this is a complete no-op, so nothing
shrank or shifted the layout when the keyboard opened. Combined with the screen's content being
vertically centered (`justifyContent: 'center'` on the `ScrollView`'s `contentContainerStyle`,
with no scroll-to-focused-input wiring), the keyboard could cover the password field / Sign In
button on Android with no way to see it short of manually scrolling. **Fixed**: behavior is now
`'height'` on Android (`'padding'` stays on iOS), plus a small `keyboardVerticalOffset`. Committed
as part of `b6d6f9f`.

**EAS build — APK profile (`eas.json`):** the user wanted to build a plain installable `.apk`
rather than the Play-Store-oriented `.aab` that the existing `production` profile's default
Android `buildType` produces. Added a new `production-apk` profile
(`{ "extends": "production", "android": { "buildType": "apk" } }`) rather than changing
`production` itself, so Play Store submission (`eas.json`'s `submit.production`) still gets an
AAB when that's actually wanted. Build with:
```
eas build --platform android --profile production-apk
```

**Started, not finished — performance audit:** the user asked for a general "is the app loading
very slow" check. Before this was interrupted by the TBT bug report above, initial findings (not
yet acted on, worth returning to):
- `AuthProvider` (`src/auth/AuthContext.tsx`) blocks the ENTIRE app behind a network round trip on
  every cold start — `status` stays `'loading'` (full-screen spinner, nothing else renders) until
  `GET /customer-portal/customer/profile` resolves, even on the happy path where the stored token
  is still valid. A common fix: set `status: 'signedIn'` optimistically as soon as a stored token
  + cached user exist, and run the profile-validation call in the background, only bouncing to
  `/login` if it later comes back 401/403. Would remove a full network round trip from first
  paint on every launch.
- `react-native-reanimated` + `react-native-worklets` are installed but genuinely unused anywhere
  in the JS (confirmed already in §6) — as native modules they still autolink into the native
  binary and pay Android/iOS startup registration cost even though nothing imports them. Removing
  both from `package.json` (and running `npx expo prebuild --clean` / a fresh EAS build after)
  would trim native binary size and startup work with no behavior change.
- No `expo-image` anywhere — every photo (job before/after, SLD point photos, the new
  Documentation screens) uses plain React Native `<Image>`, which caches less reliably than
  `expo-image` (memory+disk cache, faster decode). Would matter most for photo-heavy screens
  (Visits list, job detail's `PhotoStrip`, the new TBT strip) on a slow connection or when
  scrolling back through history. A real fix, but touches many files — worth doing as its own
  pass rather than folding into an unrelated change.
- Did not get to: checking `useChat`'s poll interval, `SiteProvider`'s refetch-on-every-tab-mount
  behavior, or the Overview tab's own fetch waterfall (`useJobs` + `useStats` + `useUnreadCount` +
  live weather, all on one screen). Flagging as unexamined, not as "fine."

**What's actually remaining right now, across both repos:**
1. **Deploy to the VPS** — `sowash-backend`'s `routes/customerJobHistoryRoutes.js`,
   `routes/ciDocumentationRoutes.js`, and `server.js` are still sitting uncommitted in the local
   working tree (`git status` in that repo shows all three, plus the untracked
   `docs/migrations/2026-09-21-commercial-documentation-photos.sql` and this repo's own
   `.claude-backups/server.js.20260921-151226.bak`). None of this has been confirmed uploaded via
   WinSCP or `pm2 restart`ed. Until it is: TBT and Safety Training's GET endpoints do not exist on
   the live server, and neither the TBT grouping fix nor the Safety Training upload endpoint are
   live either.
2. **Commit the backend changes** — `sowash-backend` has no commit for any of this session's work
   (the table migration, `ciDocumentationRoutes.js`, or the `customerJobHistoryRoutes.js` changes).
   `git status` there is still dirty. (`attendanceReviewRoutes.js`'s modification is unrelated,
   pre-existing, and explicitly left alone per the user's instruction — not part of this feature.)
3. **Safety Training upload UI** on `sowash-frontend` (the web portal) — not started. This is the
   user's team's own separate task; the backend contract (`POST /api/ci-admin/documentation`) is
   ready and waiting for it.
4. **The two 2026-09-17 backend fixes** (status-vocabulary mismatch, date off-by-one) remain
   **reverted, not applied** — see those entries below. Both bugs are still live on the deployed
   server; re-apply only if/when they actually cause a reported symptom (the one symptom reported
   so far turned out to be the approval gate, not either of these).
5. **Performance audit** — not delivered yet; see the findings above. Nothing has been changed
   for this.
6. **Pre-existing, unrelated typecheck error** in `app/(tabs)/_layout.tsx` (a `NavigationHelpers`
   type mismatch on the custom tab bar) — present before this session, still present, out of scope
   for everything done so far.
7. **`eas build --platform android --profile production-apk`** — command handed to the user;
   not yet run/confirmed as of this entry.

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

**Third bug caught after that:** the user tested with real data (confirmed via a direct SQL check
that several of their own client's completed jobs had `field_service_reports.temp_voltage_photos`
populated) and found the TBT screen still showed only one photo overall. Root cause was neither
of the two things checked first (approval gate was fine; the array-flattening logic was already
correct) — it was a UI/response-shape choice: `GET /documentation/tbt` and `TbtScreen` originally
modeled TBT as ONE FLAT LIST OF PHOTOS (one row per photo, `{ photos: TbtPhoto[] }`), so a job
with 3 TBT photos rendered as 3 separate rows scattered through the list by `captured_at`, not
as "3 photos, one visit." **Fixed**: reshaped the response to `{ jobs: TbtJob[] }` — one entry per
completed visit, each carrying its own `photos: TbtPhotoEntry[]` array — and rewrote
`app/documentation/tbt.tsx` to render one card per job with a horizontal photo strip (mirrors
`JobDetailBody.tsx`'s `PhotoStrip` component). `TbtPhoto`/`TbtPhotosResponse` in `src/api/types.ts`
were replaced by `TbtJob`/`TbtPhotoEntry`/`TbtPhotosResponse` accordingly.

**Not done / blocked on the user's team:** the actual Safety Training upload UI on
`sowash-frontend`. Until that exists, that screen shows a normal, correct empty state ("No safety
training photos yet") — not a bug, there is simply nothing uploaded yet. TBT should show real
data (grouped correctly, per the fix above) as soon as the backend files are deployed, for any
client with a completed job that already has TBT photos.

**Status:** app-side code committed (`b6d6f9f`, "Documentation Section added and Tbt is showing
now") and typechecks clean (`npm run typecheck` — one pre-existing, unrelated error remains in
`app/(tabs)/_layout.tsx`, not touched by this change). Migration has been applied to the database.
**Backend code (`customerJobHistoryRoutes.js`, `ciDocumentationRoutes.js`, `server.js`) is still
uncommitted in the `sowash-backend` working tree and had not been confirmed uploaded/deployed to
the VPS as of this entry** — until it is, neither new GET endpoint exists on the live server, and
TBT will keep showing nothing in production regardless of how correct the code now is.

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
