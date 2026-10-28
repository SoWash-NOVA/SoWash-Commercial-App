# CLAUDE.md — SoWash Commercial App

This file is the stable map of this repository and the backend it talks to (first written 2026-09-17).
Keep it updated as the code changes — it will go stale otherwise.

**Size rule:** keep this file well under 150k characters (it is loaded into every session). The history of
completed work lives in **`docs/CHANGELOG.md`** (newest first, ~200k chars) — append new entries THERE, not here,
and read it on demand (grep it by topic) rather than in full. Only update §10 "Current state" here.
**Last full update: 2026-11-02** (changelog split out; §1–§5, §7–§9 last refreshed 2026-10-07; §2, §4 (generation row), §6 and §10 refreshed for the Generation & PR work).

---
## 1. What this app is

**SoWash Commercial** is an Expo / React Native mobile app for the site managers of SoWash's
commercial and industrial (C&I) solar-cleaning clients. It is the **B2B sibling** of the
residential `sowash-customer-app` — same component language, different density (tables over hero
cards), and a structurally different data model: a commercial client has **many sites**, not one
address. Since 2026-10-03/05 the look is the **SoWash logo's own colours** (sky blue `#33B8F0` +
lime `#7EF505`; headers, tab bar, login, Overview) rather than the old teal accent, and there is a
user-selectable **Light / Dark theme** (Account → Appearance) — see §5 and §6.
- **Two identities in one app:** client site managers (`app/(tabs)/*`) and SoWash office staff
  (`app/staff/*`, roles ci_admin / operations / admin / sales / accounts) sign in on the same login screen.

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
  (tabs)/index.tsx            Overview — next-visit hero, coming up, site weather, completion bar + counts, robot
  (tabs)/jobs.tsx             Visits — full history list, scope tabs, search
  (tabs)/sites.tsx            Sites — the client's estate, tap to filter + jump to Visits
  (tabs)/support.tsx          Support — site list → per-site ring history, General = the one chat thread per account
  (tabs)/profile.tsx          Account — identity, contract info, Appearance (light/dark), accent, links, sign out
  job/[id].tsx                One visit's full detail (route wrapper around JobDetailBody)
  maintenance/index.tsx       Maintenance task list (contract-level, not site-level)
  maintenance/[id].tsx        One maintenance task detail
  walkthrough/[id].tsx        Full-screen SLD (single-line diagram) walkthrough viewer
  notifications.tsx           The bell — notification feed
  login.tsx                   Email + password sign-in (brand waves + laptop/phone SVG illustration; fits one screen)
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
app/generation/               Generation & PR: index (client centre), staff (all-clients centre, same component), view (the iNOVAA HTML report in a
                                 WebView), report/[id] (one published report). Shared UI: src/components/GenerationCentre / GenerationDashboard / GenerationParts

index.js                       APP ENTRY (package.json "main") — imports src/themeEngine FIRST, then expo-router/entry

src/ (additions since the first map — see the 2026-10-0x changelog entries)
  brand.ts                     logo colours; HEADER_GRADIENT (horizontal blue→aqua→lime, headers + tab bar);
                               GREEN_STOPS (client ring button, Team FAB)
  themeEngine.ts               light/dark: patches StyleSheet.create (dark twin per stylesheet), tc/ttc/keep/soft, DARK palette
  theme-mode.tsx               ThemeModeProvider (stored choice, SecureStore "appThemeMode"), useThemeMode, ThemeRemount
  chat-attach.ts               one-shot hand-off "attach this visit in chat" → Support tab opens General with it tagged
  dataCache.ts                 in-memory stale-while-revalidate cache behind useAsync (cleared on auth change)
  chat-focus.ts                "a chat is open": hides the tab bars + Android back closes the chat
  useChatScroll.ts             opens chats at the newest message; scroll-up paging for older ones
  top-inset-color.tsx          status-bar strip that matches the page header
  teamChatSocket.ts, staff-context.tsx, photoPicker.ts
  components/                  ChatHeaderBar, PageHeader, ChatBackground, FadeInRow, BubblePhysics (now unused),
                               AppearanceCard (Light/Dark picker), JobActions (long-press visit pop-up + host),
                               FloatingTabBar, PhotoStripList (lazy photo rows/tiles), KeyboardScreen
                               (keeps the composer above the keyboard), ComingSoon

plugins/withFcmNotification.js  Expo config plugin: FCM tray icon/color, works around a
                                 manifest-merger conflict between expo-notifications and
                                 @react-native-firebase/messaging
docs/privacy-policy.html        hosted privacy policy (Play Console links here) — keep in
                                 sync with app/privacy.tsx by hand
docs/backend-patches/           backend changes this app needs, written as patches to apply to the LIVE
                                 backend files (see §7 "Where the backend code is") — 3 pending as of 10-07
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
- **Theme**: the Light/Dark choice is loaded from SecureStore (`appThemeMode`) before the first frame
  and applied to every stylesheet + the live `palette` (§6). Switching remounts everything below
  AuthProvider; the in-memory data cache makes the screens repaint instantly.
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
| `GET /:schedule_id/detail` | one visit + its FSR (field service report); only returns approved visits, or one scheduled today. **No `attendance` / `total_panels_cleaned` yet** (patch pending) |
| `GET /documentation/tbt`, `/documentation/safety-training` | TBT photos per completed visit (also feeds the visit report's TBT strip); safety-training photos |
| `GET /client/sites` | every site under this client — **does not send `latitude`/`longitude` yet** (weather card says "No location on file"; patch pending) |
| `GET /maintenance-history`, `/maintenance-stats`, `/maintenance/:id/detail` | contract-level maintenance tasks — **no site column exists**, so these never take a `site_id` |
| `GET /sld/:schedule_id` | the site's single-line diagram + pins + this visit's before/after photos per pin |
| `GET/POST /notifications*`, `/push/register` | bell feed, unread count, mark-read, FCM registration |
| `GET /generation/{plants,summary,daily,reports,reports/:id,reports/:id/data,calendar,range,view,inverter-picture/:id}` | Generation & PR for a client (published data only, EPC-aware): `calendar` = days that have data, `range` = one period's figures, `view` = the report HTML rebuilt for the period. STAFF equivalents (all clients, `?client_id=`) are `/api/generation/staff/{calendar,range,view}` |
| `GET/POST /chat*` | the one support thread for this account (5s polling as the backup; LIVE via the socket since 2026-10-27, see §6 "Live Support chat"): `/chat`, `/chat/messages` (`limit`/`before_id` paging, `site_id`, `schedule_id` visit tag), `/chat/rings`, `/chat/typing`, `PUT /chat/messages/:mid/reaction`, `/chat/read`. **Reply-to (`reply_to_id`) not on the server yet** (patch + migration pending) |

Staff mode (`app/staff/*`) uses the staff APIs instead — `/api/schedule/{history,stats,clients}`,
`/api/commercial-chat/*` (client support inbox) and `/api/staff-chat/*` (Team DMs/groups + WebSocket) —
all behind the staff `authenticate` gate, which **rejects a client (`kind:'portal'`) token with 403**. A
client screen can therefore never reuse a staff endpoint (e.g. `/schedule/history`'s attendance); the data
has to be added to a `/customer-portal/*` route, scoped to the caller's client.

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
language (cards, tabs, pills, spacing). If a style change here isn't commercial-specific, the
residential app probably wants it too.

- **Brand colours (`src/brand.ts`)** — the logo's sky blue `#33B8F0` and lime `#7EF505` (+ darker
  greens for text on white). They drive, fixed (not the user accent): every page/chat header
  (`ChatHeaderBar`/`PageHeader`: horizontal `HEADER_GRADIENT` `#1C9BE0 → #33B8F0 → #4CC9A0 → #6BD81A`, white
  sheen, frosted white waves on rounded headers; the status-bar strip draws the same gradient), both
  tab bars (selected item = gradient circle + white icon, centre Chats/Support button = gradient,
  labels `#1C9BE0`), the login, and both Overviews (one blue + neutrals, colour only where it means
  something — status pills).
- **User accent** (Account → App colour, `ThemeProvider` in `src/theme-context.tsx`, default teal
  `#0F766E`) still tints pills, chat bubbles, the chat wallpaper and badges.
- **Light / Dark** (Account → Appearance) — see §6's first bullet for how it works and the rules for
  writing colours in new code.

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

- **Chat gotchas (from the changelog):** (1) never use a NATIVE `Animated.event` as a react-native-gesture-handler
  `onGestureEvent` — Fabric throws "Expected `onGestureHandlerEvent` listener to be a function"; use a plain function
  calling `setValue`. (2) Never pass a callback that depends on the message list to `React.memo` bubbles (read the
  list through refs). (3) `useChatScroll`: timers start when `ready` (list has rows), and content-size changes only
  auto-scroll while the reader is near the bottom. (4) Never change layout in response to the keyboard on the login
  screen (Android dismisses the keyboard). (5) Chat message kinds (voice/video/photo) are told apart BY FILE NAME
  (`src/chat-media.ts`); videos older than 30 days show "Video expired".
- **Permissions / native:** a permission plugin passed `false` makes the Android build REMOVE that permission (the
  `microphonePermission: false` bug) — after adding one, check `npx expo config --type introspect`. Any new native
  module needs a new EAS build; JS-only changes reload with `r`. After a `git stash pop`, grep `package.json` for
  `<<<<<<<` if a build fails. EAS builds from the committed snapshot — commit first.
- **Backend deploy rules:** edit the LIVE files (download via WinSCP, never the stale `Desktop/sowash-backend`
  copy), run migrations BEFORE uploading routes that select the new columns, never upload the local
  `package-lock.json`, then `pm2 restart` and check `pm2 logs`. Deploys are manual; "done" in the changelog means
  "in the working tree" unless it says deployed.
- **Live Support chat (2026-10-27):** `services/staffChatSocket.js` (backend, same `/ws/staff-chat` endpoint as Team chat) has
  `notifySupportChat({clientId, threadId, event})` — SIGNAL ONLY (`support_changed`; apps re-fetch over REST). A `kind:'portal'`
  token may connect as a LISTEN-ONLY client socket (client_id read from the DB). Called from `routes/commercialChatRoutes.js` and
  `routes/customerJobHistoryRoutes.js` on message / read / reaction / typing / thread change. App: `subscribeSupportSocket` in
  `src/teamChatSocket.ts` (own listener set — Team subscribers never see it), used by `useChat`, `useStaffChatThread`, both unread
  hooks and the staff inbox; the client socket starts in `app/(tabs)/_layout.tsx`, which also calls `prefetchClientChat()`.
  Never remove the polling underneath.
- **Staff push for client messages** (`services/commercialNotifications.js` `notifyAgentsOfCommercialMessage`): unassigned → every
  `STAFF_ROLES` user, assigned → only the assignee. Notifies on the first message of an unanswered run, on EVERY ring (a message
  tagged with a site, `isRing`) and after 5 quiet minutes; logs a `[commercial-chat push]` line per message (`pm2 logs | grep`).
  Staff tokens live in `user_fcm_tokens` (`POST /api/user/fcm-token`).
- **Client chat shows only the resolution trail of staff system rows** (`CLIENT_VISIBLE_MESSAGE_SQL` / `clientSystemBody` in
  `customerJobHistoryRoutes.js`: "Resolved by X", "Resolved on time", "reopened"; never assignment notes, overdue or "Resolved late").
  The wording is matched to `PATCH /threads/:id` in `commercialChatRoutes.js` — change both together.
- **Client visit report hides field-officer details:** attendance is only a "Team attendance marked" card (no names, times or photos —
  `JobDetailBody.tsx`). The staff job sheet keeps names/photos (tap = zoom viewer, send to Team chat, share outside the app via
  `sharePhotoExternally` in `src/jobShare.ts`). The backend still sends the full attendance rows to the client; strip them in
  `docs/backend-patches/2026-10-07-client-visit-attendance.md` if they must never leave the server.
- **Chat list/scroll:** keep `initialNumToRender 60 / maxToRenderPerBatch 60 / windowSize 31` on the client chat list (fewer rows =
  estimated heights re-measure seconds later and the list drifts up). `useChatScroll` stays pinned to the end until the reader's
  first drag, then follows only when they are at the bottom. Team chat has ONE paperclip menu (camera / gallery / document / shared
  files); a picture picked as a document is refused with a clear message (`pickDocument` in `src/staffFiles.ts`).
- **EPC / parent accounts (2026-10-27):** `commercial_clients.parent_client_id` (migration `2026-10-27-epc-parent-client.sql`, backend
  repo) links a customer to its EPC's client row (e.g. Burj). An EPC login is a normal portal login whose `users.client_id` is the
  EPC's row; `scopedClientIds()` in `customerJobHistoryRoutes.js` widens ONLY the data routes (stats, history, today, sites, maintenance,
  visit detail/photos, SLD, TBT, safety training) to the EPC + its customers, read-only. Chat, notifications, push and rings stay on the
  login's own client. App: `Site.client_name/site_client_id`, `isMultiClient` / `useIsMultiClient()` in `src/site-context.tsx` name the
  customer on the Sites tab and visit cards. An EPC ringing a customer's site is refused by the server (not its site).
  Many customers: `SiteContext` also has `customers`, `selectedClientId` (persisted) and `visibleSites`; the switcher shows a Customer
  section first, the Sites tab has customer chips and groups sites under customer headers, and `useJobs`/`useStats` send
  `?client_id=` which `requestScope()` (backend) honours only if it is one of the login's customers.
  Staff manage it in the web console (`sowash-frontend` `pages/CI/ListCIClients.js`): "Add EPC" (`POST /commercial-clients/epc`, a row
  with placeholder contract numbers and `is_epc = true`) and a "Parent (EPC) account" select in the client edit modal
  (`PATCH /commercial-clients/:id/parent`; one level only, a client with customers cannot get a parent).
- **Generation & PR reports (2026-10-28 -> 11-02):** staff (operations / ci_admin / admin) upload a solar-portal export in the web console
  (`sowash-frontend` `pages/CI/GenerationReports.js`; tabs Analytics / Generate / Reports / Monthly) -> Node `routes/generationRoutes.js` calls the
  Python `generation_service` (NOT the ML `tracker_service`; `engine.py` = the original generator with ONE deliberate change: the Salitex curve
  reader `read_curve`/`describe_curve`/`mark_dips` reads the real blue curve instead of guessing) -> a DRAFT in `generation_reports` /
  `generation_daily` (+ `generation_inverter_daily` with curve + marked picture for Salitex Knox) -> ci_admin/admin publishes. Views
  `generation_daily_effective` / `generation_inverter_effective` / `generation_monthly_summary` take the newest published figure, so republishing
  never double-counts. The service (127.0.0.1:8001, pm2 `generation-service`) has `/generate` and `/render` (rebuilds the same HTML for any
  day / week / month from stored rows; 1 plant single, 2 = original tabs, 3+ = N tabs; Salitex = its stored daily report).
  `services/generationViews.js` is shared by the client routes (`generationPortalRoutes.js`, EPC-aware via `utils/clientScope.js`) and the staff
  routes (`/api/generation/staff/*`). Web Analytics: hero + KPIs, client spotlight, per-plant charts, PR heatmap, inverter cards with the marked
  picture, ONE filter bar (client/plant, period dropdown relative to the newest data day, one bar per day/week/month). KPI maths: '% of
  expected' uses only the days that HAVE an expected figure (plant exports carry none) - never total yield / expected.
  App: the Generation centre (`GenerationCentre`, scope 'client' or 'staff') picks a Day/Week/Month from days that have published data and
  shows an interactive dashboard (tap-a-slice donut, scrub-able bars, PR lines); 'View report' opens `app/generation/view.tsx`, a
  `react-native-webview` (native module: needs a build made after it was added; older builds fall back to the share sheet). The client gets
  a Generation card + header button on Overview; staff get a header button on the staff Overview. The login gate (`app/_layout.tsx`) treats
  `generation` as a shared route - keep it there.
- **iNovaa Ai alerts (2026-10-31/11-01):** `services/generationAlerts.js` runs after a report is published and every morning ~08:00 PKT. Per plant it
  compares the average PR with ITS benchmark (`services/prTargets.js`: Salitex 80, Power Cement 76, Bulleh Shah Packaging 80, PSM 1 MW 80, PSM 2 MW 75;
  `solar_plants.pr_target` overrides) -> below = warning, at/above = 'good performance'; also flags average daily generation >20% below the previous
  30 days. One DM per recipient (superadmin@ + ciadmin@sowash.pk) from the bot user 'iNovaa Ai' (inovaa-ai@sowash.pk, Type 'bot') in the staff chat
  tables + a push through `notifyStaff`; `generation_alerts` (unique key per plant + report + publish time) stops repeats. Web button 'Test iNovaa Ai'
  -> `POST /api/generation/alerts/test`. Offline-day / no-new-data alerts were not chosen (can be added).
- **Chat admin rule:** only `ciadmin@sowash.pk` and `superadmin@sowash.pk` assign/reassign conversations
  (`CHAT_ADMIN_EMAILS` in `routes/commercialChatRoutes.js`, mirrored in `src/chatAdmins.ts` — edit BOTH). Closing an
  assigned conversation needs the assignee or an admin.
- **Package / release:** package is `com.sowash.commercial` (new Play Console app; the old listing is locked to
  another package). Updates use Google Play In-App Updates (`src/appUpdate.tsx`, `expo-in-app-updates`, needs a Play
  install); `app_release_info.min_supported_version` is the emergency block. Release: bump `app.json` version →
  `eas build --platform android --profile production` → upload AAB to Play.

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

**Where the backend code is (2026-10-07):** earlier entries mention `D:\github\nova\sowash-backend` —
that path no longer exists on this PC. The only checkout here is `C:\Users\Emaad\Desktop\sowash-backend`,
and it is **stale**: its `routes/customerJobHistoryRoutes.js` is dated 21 Sep and lacks the whole
October chat work (rings, typing, reactions, paging, site labels). **Never edit that copy and upload it**
— it would remove live features. The VPS's files are the source of truth: download the live file
(WinSCP), patch it, upload, `pm2 restart`. Changes this app needs are written up in
`docs/backend-patches/` for exactly that workflow.

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

Sibling repos (now under `C:\Users\Emaad\Desktop\`; the old `D:\github\nova\` location is gone — and see §7
about the backend checkout being stale):
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


## 10. Current state and changelog

- **Staff Phone Book consent (Google Play User Data policy, 2026-11-02):** contacts are personal data that the Phone Book UPLOADS, so `src/phonebook.ts` never reads them (or even asks Android for the permission) until the staff user tapped 'Agree' on the in-app disclosure (`src/phonebookConsent.tsx`, shown by `app/staff/_layout.tsx` when the staff app opens; versioned per-user choice in SecureStore). Back/home/tap-away is not consent. Changing the disclosure wording materially = bump `DISCLOSURE_VERSION`. Privacy policy (app + docs html) and the Play Data safety / Contacts declaration must keep saying the same. 1.0.2 was rejected for the missing disclosure; 1.0.3 is the compliant version.
- **2026-11-02 snapshot:** Generation & PR is feature-complete and LIVE on the server: all SQL (EPC, reports, inverters, curves, pictures, iNovaa Ai bot + alerts,
  pr_target), `generation_service` with `/render`, and the backend files (generationRoutes / generationPortalRoutes / generationViews / generationAlerts /
  prTargets). The user confirmed the iNovaa Ai DM + push, the web Analytics and the staff Generation screen (dev build). `app.json` is at 1.0.2; the next step is
  `git commit` of app.json then `eas build --platform android --profile production` (or `--profile development` for a dev build) - a build made after
  `react-native-webview` was added is what makes 'View report' open INSIDE the app (the current dev build shows 'Open with the phone'). Play In-App Updates
  prompt Play-installed phones after the Play Console rollout. Not yet done / ideas: 'Needs attention' + heatmap on mobile, offline-day and no-new-data alerts,
  per-plant PR targets in the charts / app / HTML (they still draw 80%), BSP's plant row (created on its first report), `commercialClientsRoutes.js` has its
  auth commented out, the backend logs decoded JWTs and plaintext login passwords.
- **2026-10-28 snapshot (end of day):** Generation & PR reports are DEPLOYED and the user tested the web console end to end
  (SQL `2026-10-28-generation-reports.sql` run; `generation_service` running under pm2 as `generation-service` from
  `/var/www/sowashapp/backend/generation_service` with its own venv; backend files `generationRoutes.js`, `generationPortalRoutes.js`,
  `utils/clientScope.js`, `server.js` uploaded). EPC accounts (Add EPC, Parent dropdown, Create User client link, customer
  filter) are live too. NOT yet done / not tested on a device: the mobile Generation screen (`app/generation/index.tsx`, needs a
  new app build + a published report to see anything), the Salitex form path, EPC-grouped plants in the app. Next ideas: admin
  dashboard exceptions list (PR below 80, offline days, plants with no data), monthly PDF/email, FusionSolar / iSolarCloud API
  ingestion, `commercialClientsRoutes.js` has its auth commented out (open client create/edit/delete + `/epc` + `/parent`).
- **2026-10-27 snapshot:** backend files that must be on the VPS for the new chat behaviour: `services/staffChatSocket.js`,
  `routes/commercialChatRoutes.js`, `routes/customerJobHistoryRoutes.js`, `services/commercialNotifications.js` (the last edits —
  ring push + resolution trail — touched `customerJobHistoryRoutes.js` and `commercialNotifications.js`: re-upload, then
  `pm2 restart all`). `D:/github/nova/sowash-backend` is CURRENT again and is the copy to patch and upload from (§7's "stale copy"
  warning is about `C:/Users/Emaad/Desktop/sowash-backend`). No SQL for these. All of today's app changes are JS-only (no new build)
  and none was seen on a device. Release: bump `app.json` version → commit → `eas build --platform android --profile production`.
  Open: confirm `saad@sowash.pk` (Admin) now gets push for an UNASSIGNED chat after the latest upload; attendance rows are still sent
  to clients by the backend (only hidden in the UI).

Full history: **`docs/CHANGELOG.md`** (append new entries there). Snapshot as of 2026-10-21 — RE-VERIFY, it ages fast:

- **Typecheck** was clean at the last run; most recent UI/chat work was never seen on a device (the changelog says
  per entry).
- **Backend files that may still need upload + `pm2 restart`** (confirm with the user): `services/chatMedia.js`,
  `services/chatDueReminders.js`, `routes/appVersionRoutes.js`, `server.js`,
  `routes/{commercialChatRoutes,staffChatRoutes,customerJobHistoryRoutes}.js`.
- **Migrations that may still need running** (in `docs/migrations/`): `2026-10-08-commercial-chat-delivered.sql`,
  `2026-10-08-commercial-chat-due.sql`, `2026-10-09-app-release-info.sql`. Run BEFORE uploading the routes.
- **UPDATE 2026-10-21 late:** the new dev build is installed; Team chat files (upload, open in the phone's viewer via expo-sharing, dedupe, no %20) are confirmed working by the user; backend `services/staffFiles.js` is deployed. Still untested on a device: Supervisors tab, multi-select contact share, visit photo zoom, one-voice-note-at-a-time.
- **HANDOFF (end of 2026-10-21, now mostly done):** commit `4e2f1e9` is pushed; a NEW dev build (adds `expo-document-picker`) was started on EAS. Nothing from today's work has been run on a device yet. UPDATE: the user then ran all the SQL and uploaded all the backend files to the VPS (phonebookRoutes, staffChatRoutes, staffFiles, chatMedia) and restarted; only the new dev build + device testing remain. (Original list follows.) Still to do by the user: (1) run migrations `2026-10-20-staff-phonebook.sql` (done), `2026-10-21-staff-phonebook-restore-requests.sql` (done earlier), `2026-10-21-staff-files.sql` (NOT confirmed); (2) upload to the VPS `routes/phonebookRoutes.js` (Team view = superadmin only + `/supervisors`), `routes/staffChatRoutes.js`, `services/staffFiles.js` (new), `services/chatMedia.js`, then `pm2 restart all`; (3) install the new build and test: Phone Book (auto-backup, restore approval, Supervisors tab, multi-select share), Team chat files (paperclip, Shared Files, dedupe), visit photo zoom, one-voice-note-at-a-time. The unused `users.employee_id` column exists in the DB (harmless; drop with `ALTER TABLE public.users DROP COLUMN IF EXISTS employee_id;`). Ideas not done: Employee ID for supervisors (no source in the DB), web-console UI for it, attendance thumbnails tappable, Play Store contacts-permission declaration / Data safety form.
- **Staff Phone Book (2026-10-20/21):** backs up AUTOMATICALLY (`autoBackup`, started in `app/staff/_layout.tsx`); Restore needs approval from the superadmin + any ONE `Type='admin'` user (`SUPERADMIN_EMAIL` / `ADMIN_APPROVER_TYPE` in `routes/phonebookRoutes.js`). Deploy: migrations `2026-10-20-staff-phonebook.sql` then `2026-10-21-staff-phonebook-restore-requests.sql`, upload `routes/phonebookRoutes.js` + `server.js`, new EAS build (expo-contacts). Rules in `routes/phonebookRoutes.js` header (admins `ciadmin@`/`superadmin@sowash.pk` get a read-only Team view of everyone's contacts — `PHONEBOOK_ADMIN_EMAILS`, same list as the chat admins); `phoneKey()` is mirrored in `src/phonebook.ts` — keep in step. Play needs a contacts permission declaration.
- **Team chat files / Shared Files (2026-10-21):** migration `2026-10-21-staff-files.sql` FIRST, then upload `routes/staffChatRoutes.js` + `services/staffFiles.js` + `services/chatMedia.js`; new EAS build (`expo-document-picker`). Design (sha256-deduped blobs, per-person library entries, signed download links, access = owner or chat participant): `docs/CHANGELOG.md` 2026-10-21.
- **Weather "No location on file":** needs the site-coordinates change in `customerJobHistoryRoutes.js` uploaded, and
  coordinates entered for the site in the staff site editor.
- **Features built but unverified on a device:** voice notes (hold/lock/waveform/speed), in-app camera + gallery,
  video thumbnails, client chat search/jump-to-newest, conversation info, assignment deadlines, delivery ticks,
  in-app update popup, 30-day video archive, dark theme.
- **Open decisions:** library photos auto-send like camera ones? Unify the user accent with the brand colours?

---
## 11. Things NOT covered by this file

This documents application architecture and backend contracts — it deliberately does not
duplicate anything derivable by reading the current code (exact function signatures, current
git history/blame, or line-by-line business logic). Re-derive those from the source directly;
treat any specific detail here (a table column, a route path, a file's existence) as a
snapshot from 2026-09-17 and re-verify before depending on it in anything high-stakes.
