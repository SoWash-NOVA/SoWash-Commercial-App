// src/api/types.ts
//
// Response shapes for /api/customer-portal/*, transcribed from the SELECT lists
// in routes/customerJobHistoryRoutes.js rather than guessed.
//
// Two things to keep in mind when extending it:
//   • Money and sizes are VARCHAR in this schema, not numeric. They come back
//     as strings like "1,250,000" or "300 kW" and must be parsed, not summed.
//   • site_schedules.status is free-text. Compare case-insensitively.

/**
 * The `users` row behind a portal session, as returned by the login route.
 *
 * Two shapes share this type since Phase 1 (sowash-backend
 * routes/portalAuthRoutes.js): a commercial CUSTOMER ("Type" = 'customer',
 * always has client_id) and an OFFICE/STAFF user ("Type" one of
 * ci_admin/operations/admin, client_id always null — see
 * src/auth/AuthContext.tsx's appRoleOf()). Screens that assume client_id is
 * non-null are client-only screens and must be reached only from
 * app/(tabs)/*, never app/staff/*.
 */
export interface PortalUser {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** users."Type" — 'customer', or an office role. See the interface comment. */
  role: string | null;
  /** FK to commercial_clients. Null for an office/staff user. */
  client_id: number | null;
}

export interface LoginResponse {
  token: string;
  user: PortalUser;
}

/**
 * GET /customer-portal/customer/profile → { success, customer }
 * A commercial_clients row.
 */
export interface ClientProfile {
  id: number;
  client_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  sales_agent: string | null;
  contract_type: string | null;
  /** VARCHAR — parse before doing arithmetic. */
  sales_price_before_tax: string | null;
  /** VARCHAR — e.g. "300 kW". */
  total_system_size: string | null;
  contract_start_date: string | null;
  billing_type: string | null;
  contractual_services_count: number | null;
  notes: string | null;
  is_active: boolean | null;
  total_panel_count: number | null;
  created_at: string | null;
}

export interface ProfileResponse {
  success: boolean;
  customer: ClientProfile;
}

/**
 * GET /customer-portal/stats
 *
 * Counts only what the customer can actually see — completed jobs awaiting CI
 * approval are excluded, matching /history. Before that fix these cards
 * contradicted the list below them (219 completed vs 30 listed).
 */
export interface PortalStats {
  success: boolean;
  total: number;
  completed: number;
  inProgress: number;
  scheduled: number;
}

/** GET /customer-portal/client/sites → { success, sites } — commercial_sites. */
export interface Site {
  id: number;
  site_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  /** VARCHAR in commercial_sites. */
  system_size: string | number | null;
  system_type: string | null;
  installation_status: string | null;
  installation_date: string | null;
  /**
   * commercial_sites.latitude / longitude — Postgres numeric, so node-postgres sends STRINGS
   * ("31.52040000"). Used by the Overview weather card (extractCoords in app/(tabs)/index.tsx).
   * Only sent once docs/backend-patches/2026-10-07-client-sites-coordinates.md is deployed.
   */
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface SitesResponse {
  success: boolean;
  sites: Site[];
}

/**
 * One row from GET /customer-portal/history.
 *
 * before_photos / after_photos are `text` columns holding a JSON array — run
 * them through photoUrls() in src/api/client.ts, never straight into <Image>.
 */
export interface JobSummary {
  schedule_id: number;
  site_id: number | null;
  client_id: number;
  site_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  system_size: string | number | null;
  system_type: string | null;
  client_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  scheduled_date: string | null;
  service_number: string | number | null;
  status: string | null;
  approval_status: string | null;
  priority: string | null;
  started_at: string | null;
  before_photos_at: string | null;
  after_photos_at: string | null;
  completed_at: string | null;
  before_photos: string | null;
  after_photos: string | null;
  notes: string | null;
  team_lead_name: string | null;
  /**
   * Whether the SLD walkthrough has anything to show for this job.
   *
   * ⚠ This is computed by an EXISTS in /history ONLY. It is NOT in the SELECT
   * list of /:schedule_id/detail — see the Omit on JobDetail below.
   */
  has_sld_walkthrough: boolean;
}

export interface HistoryResponse {
  success: boolean;
  jobs: JobSummary[];
  count: number;
  /** Added with the pagination params — distinguishes a full page from the end. */
  hasMore?: boolean;
}

/** Which slice of history to ask for. Maps to the `scope` query param. */
export type JobScope = 'all' | 'past' | 'upcoming';

/**
 * GET /customer-portal/:schedule_id/detail → { success, job }
 *
 * Everything in JobSummary plus the field service report. Note the endpoint
 * only returns approved jobs, or one scheduled for today.
 *
 * ⚠ has_sld_walkthrough is Omit-ted deliberately. The flag exists only in
 * /history's SELECT; /detail never computes it, so on this shape it would
 * always be `undefined` — and `undefined` reads as "no walkthrough", silently
 * hiding the feature on the one screen that launches it. Omitting it turns
 * that into a compile error instead. The detail screen asks /sld/:schedule_id
 * directly (useSldWalkthrough) and decides from the real data.
 */
export interface JobDetail extends Omit<JobSummary, 'has_sld_walkthrough'> {
  /**
   * Crew clock-in/out for this visit — the same shape the staff Jobs sheet gets. OPTIONAL: only
   * a backend with docs/backend-patches/2026-10-07-client-visit-attendance.md applied sends it;
   * without it the client report simply has no Attendance section.
   */
  attendance?: StaffAttendanceRecord[];
  /** Toolbox-talk photos, if the backend ever sends them here; the app otherwise reads /documentation/tbt. */
  tbt_photos?: StaffTbtPhoto[];
  /** field_service_reports.total_panels_cleaned (same patch). */
  total_panels_cleaned?: string | number | null;
  email: string | null;
  installation_status: string | null;
  approved_at: string | null;
  original_date: string | null;
  reschedule_reason: string | null;
  reschedule_count: number | null;
  estimated_duration: string | number | null;
  created_at: string | null;
  updated_at: string | null;
  // ── field_service_reports, LEFT JOINed: all null when no FSR was filed ──
  cable_condition: string | null;
  cable_quantity: string | number | null;
  panel_damage: string | null;
  panel_brand: string | null;
  inverter_alarm: string | null;
  alarm_code: string | null;
  potential_shading: string | null;
  shading_details: string | null;
  rusting: string | null;
  bird_dropping: string | null;
  mos_and_debris: string | null;
  earthing: string | null;
  cash_collected: string | number | null;
  customer_signature: string | null;
  additional_notes: string | null;
}

export interface JobDetailResponse {
  success: boolean;
  job: JobDetail;
}

/* ── SLD walkthrough ─────────────────────────────────────────────────────
 *
 * GET /customer-portal/sld/:schedule_id → the site's single-line diagram, its
 * pins, and the before/after photos captured at each pin during THIS visit.
 * Scoped to the caller's client_id by the endpoint.
 *
 * The endpoint picks the site's LATEST diagram. If a site's diagram was
 * re-uploaded, the point ids changed, so an older visit's photos no longer
 * match any pin and every before_url/after_url comes back null. That is a
 * known, accepted edge case — the schema has no schedule→diagram link — and
 * the app must treat it as "no walkthrough" and fall back to the flat grid.
 */
export interface SldDiagram {
  id: number;
  /** Stored path — run through photoUrl(), never concatenated by hand. */
  diagram_url: string | null;
  title: string | null;
}

export interface SldPoint {
  id: number;
  /** 1-based position, assigned by the endpoint over order_index NULLS LAST. */
  index: number;
  label: string | null;
  /**
   * Pin position as a percentage of the diagram's own width/height.
   *
   * ⚠ Typed loosely on purpose. commercial_sld_points is not in
   * docs/db/main_schema.sql (that dump is behind), and the insert in
   * routes/commercial-sld/diagrams.js passes req.body straight through with no
   * cast — so the column may well be `numeric`, which node-postgres hands back
   * as a STRING. The web viewer never noticed because it interpolates straight
   * into a CSS `%`. React Native needs a real number for layout, so callers
   * must coerce. Use pointXY() in the walkthrough component.
   */
  x_percent: number | string | null;
  y_percent: number | string | null;
  order_index: number | null;
  /** Latest 'before' photo at this pin for this schedule, if any. */
  before_url: string | null;
  /** Latest 'after' photo at this pin for this schedule, if any. */
  after_url: string | null;
}

export interface SldWalkthroughResponse {
  success: boolean;
  /** False when the site has no diagram at all — diagram is null, points []. */
  hasDiagram: boolean;
  diagram: SldDiagram | null;
  points: SldPoint[];
}

/* ── maintenance ─────────────────────────────────────────────────────────
 *
 * A separate work stream from cleaning visits, on its own table.
 *
 * ⚠ maintenance_schedules has NO site column — it is scoped to the CLIENT and
 * a task template, nothing else. The endpoints still return site_name/address,
 * but they come from
 *
 *     LEFT JOIN LATERAL (SELECT * FROM commercial_sites
 *                        WHERE client_id = ms.client_id
 *                        ORDER BY site_name ASC LIMIT 1)
 *
 * which is "the client's alphabetically first site", not the site the work
 * happened at. For a multi-site client every row carries the SAME wrong
 * address. Those fields are deliberately omitted from this interface so no
 * screen can render them by accident, and maintenance is never filtered by the
 * site switcher — there is nothing to filter on.
 *
 * Photos here are singular text columns (before_photo_url), not the JSON
 * arrays site_schedules uses. Different shape, same photoUrl() treatment.
 */
export interface MaintenanceJob {
  id: number;
  client_id: number;
  task_template_id: number | null;
  team_id: number | null;
  scheduled_date: string | null;
  service_number: number | null;
  /** CHECK-constrained: scheduled | in_progress | completed | cancelled. */
  status: string | null;
  completed: boolean | null;
  completed_at: string | null;
  started_at: string | null;
  before_photo_url: string | null;
  before_photo_at: string | null;
  after_photo_url: string | null;
  after_photo_at: string | null;
  remarks: string | null;
  created_at: string | null;
  client_name: string | null;
  team_lead_name: string | null;
  /** maintenance_task_templates.task_name */
  task_name: string | null;
  /** maintenance_task_templates.check_points — the checklist for this task. */
  task_description: string | null;
}

export interface MaintenanceResponse {
  success: boolean;
  jobs: MaintenanceJob[];
  count: number;
}

export interface MaintenanceStats {
  success: boolean;
  total: number;
  completed: number;
  inProgress: number;
  scheduled: number;
}

export interface MaintenanceDetailResponse {
  success: boolean;
  job: MaintenanceJob & {
    completed_by: number | null;
    started_by: number | null;
    updated_at: string | null;
    contact_person: string | null;
    contact_number: string | null;
    email: string | null;
  };
}

// ─────────────────────────── documentation ───────────────────────────
//
// The "Documentation" menu: Site SLD (reuses the existing per-visit
// walkthrough — see SldWalkthroughResponse above, no new type needed), TBT,
// Safety Training, and Equipment Inspection (reuses MaintenanceJob above).
//
// Backend: routes/customerJobHistoryRoutes.js
// (GET /customer-portal/documentation/tbt, /safety-training). captured_at is
// a real timestamp — render with formatDateTime()/formatTime(), never
// formatDateOnly()/relativeDay() (those are for DATE columns).
//
// TBT reads from field_service_reports.temp_voltage_photos (a JSON array —
// TBT already had a real capture pipeline before this feature existed; see
// the backend route's comment). Grouped ONE ENTRY PER JOB, not one per photo
// — a visit's several TBT photos belong together as that visit's toolbox
// talk, not as separate list rows. `photos[].id` is a synthetic
// `${schedule_id}-${index}` string, not a real row id.

export interface TbtPhotoEntry {
  id: string;
  photo_url: string;
  captured_at: string;
}

export interface TbtJob {
  schedule_id: number;
  site_id: number | null;
  site_name: string;
  /** DATE column, already TO_CHAR'd server-side — a plain 'YYYY-MM-DD' string. */
  scheduled_date: string | null;
  service_number: number | null;
  photos: TbtPhotoEntry[];
}

export interface TbtPhotosResponse {
  success: boolean;
  jobs: TbtJob[];
}

export interface SafetyTrainingPhoto {
  id: number;
  site_id: number | null;
  photo_url: string;
  captured_at: string;
  site_name: string;
}

export interface SafetyTrainingPhotosResponse {
  success: boolean;
  photos: SafetyTrainingPhoto[];
}

// ─────────────────────────── notifications ───────────────────────────
//
// Written by sowash-backend/services/commercialNotifications.js, read through
// /api/customer-portal/notifications. Backed by the commercial_notifications
// table (migration 2026-08-13).

/**
 * The two events a commercial customer is told about.
 *
 * Kept as a union rather than a bare string so adding a type without also
 * teaching notificationTarget() where it should navigate is a compile error.
 * It mirrors the CHECK constraint on commercial_notifications.type exactly.
 *
 * There is deliberately no 'visit_completed'. The portal hides completed
 * visits until CI admin approves them, so approval is the first moment one
 * exists for the customer — see the migration header.
 *
 * 'chat_reply' was added in Phase 6. Those rows carry thread_id instead of
 * schedule_id and route to the Support tab rather than to a visit.
 *
 * Deliberately does NOT include 'team_message' (internal staff chat,
 * app/staff/chats.tsx's Team section): that push is push-only, same as
 * commercial-chat's own mention/assign pushes — it never writes a
 * commercial_notifications row, so this feed-backed type can never actually
 * hold that value. notificationTarget() in src/hooks.ts still routes it
 * (its `type` param is intentionally looser than this union, precisely so a
 * push-only type can be routed without belonging here).
 */
export type NotificationType = 'crew_started' | 'visit_approved' | 'chat_reply';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  /** site_schedules.id. Null only if the visit was deleted after the fact. */
  schedule_id: number | null;
  /** commercial_chat_threads.id. Set on chat_reply, null on visit events. */
  thread_id: number | null;
  /** Null means unread. A timestamp, not a boolean — see the migration. */
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  success: boolean;
  notifications: AppNotification[];
  unread: number;
  hasMore: boolean;
}

export interface UnreadResponse {
  success: boolean;
  unread: number;
}

// ─────────────────────────────── chat ───────────────────────────────
//
// One thread per CLIENT: every site manager on the account shares the
// conversation, and each message records who sent it. Backed by
// commercial_chat_* (migration 2026-08-13_commercial_chat.sql), read and
// written through /api/customer-portal/chat.

export type ChatSenderKind = 'customer' | 'agent' | 'system';

/**
 * The optional "about this visit" tag on a message.
 *
 * Rendered as a preview card, not a line of text: site, date, crew, and up to
 * four photos of the actual work, opening the full visit on tap. Everything
 * here is built server-side by utils/commercialChatVisit.js and rides along on
 * the message, so the card costs no extra request.
 *
 * ⚠ can_open is the one field to respect. The detail endpoint,
 * GET /customer-portal/:id/detail, admits a visit only when
 * `approval_status = 'approved' OR scheduled_date = CURRENT_DATE` — so a
 * completed visit CI admin has not approved yet is tagged, listed, and
 * genuinely un-openable. When can_open is false the backend also withholds
 * photos, team_lead_name and the address: the card must explain itself rather
 * than offer a tap that 404s. Same expiry that makes a `crew_started` push
 * deep-link go stale overnight.
 */
export interface ChatVisitTag {
  id: number;
  site_name: string | null;
  scheduled_date: string | null;
  status: string | null;
  approval_status: string | null;

  /** Withheld (null) when can_open is false. */
  address: string | null;
  city: string | null;
  team_lead_name: string | null;

  /**
   * Up to four thumbnails, after-photos first, already normalised to
   * "/uploads/…" — still run them through photoUrl(), never concatenate.
   * Empty when can_open is false.
   */
  photos: string[];
  /** Total across before + after, which may exceed photos.length. */
  photo_count: number;

  /** Whether GET /customer-portal/:id/detail will return this visit. */
  can_open: boolean;

  /** Always false on this side — a staff-console badge. */
  pending_approval: boolean;
}

export interface ChatMessage {
  id: number;
  /**
   * Reply-to (WhatsApp-style quote). Only present once the backend patch
   * docs/backend-patches/2026-10-07-support-chat-replies.md is deployed; an older server simply
   * never sends it (and ignores reply_to_id on send), so the message goes out without the quote.
   */
  reply_to_id?: number | null;
  reply_to?: TeamReplyRef | null;
  sender_kind: ChatSenderKind;
  /**
   * Staff-only (routes/commercialChatRoutes.js's shapeMessage only —
   * customerJobHistoryRoutes.js's shapeChatMessage never selects it):
   * WHICH agent sent this, needed to tell "an agent sent this"
   * (sender_kind) apart from "I sent this" (sender_user_id === the
   * viewing agent's own id) now that more than one office role can reply
   * in the same thread. Optional, like mentioned_user_id below, for the
   * same reason — an older response shape may not carry it.
   */
  sender_user_id?: number | null;
  body: string | null;
  /** Server path like "/uploads/commercial-chat/…". Needs SERVER_BASE. */
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  /** Staff name on an agent message; the sender's name on a customer one. */
  sender_name: string | null;
  visit: ChatVisitTag | null;
  /** Which of the client's sites this message is about (null = General). Optional: absent on an older server. */
  site_id?: number | null;
  site_name?: string | null;
  /**
   * Staff-only @-mention on this one message (docs/migrations/2026-09-28-
   * commercial-chat-mentions.sql) — always null on the customer side, which
   * never selects this column at all (see the migration's own header).
   * Optional rather than just nullable: a client-app build made before this
   * migration existed never sent the field either shape.
   */
  mentioned_user_id?: number | null;
  mentioned_name?: string | null;
  /** Client-only (optimistic send, see useStaffChatThread): not on the server yet. */
  pending?: boolean;
  /** Client-only: the send failed — kept on screen with Retry / Delete. */
  failed?: boolean;
  /** Client-only: local file:// URI to render before attachment_url exists. */
  localPhotoUri?: string;
}

export interface ChatThread {
  id: number;
  status: string;
  last_message_at: string | null;
}

export interface ChatResponse {
  success: boolean;
  thread: ChatThread;
  messages: ChatMessage[];
  unread: number;
  /** Every reaction in the thread (flat). Optional: absent on an older server. */
  reactions?: TeamReaction[];
}

export interface ChatDeltaResponse {
  success: boolean;
  messages: ChatMessage[];
  count: number;
  reactions?: TeamReaction[];
}

/** One ring a client made for a site, with how far staff got. Status is derived from the shared thread. */
export interface ChatRing {
  id: number;
  site_id: number;
  body: string | null;
  created_at: string;
  answered_at: string | null;
  completed_at: string | null;
  status: 'waiting' | 'answered' | 'completed';
}

export interface ChatRingsResponse {
  success: boolean;
  rings: ChatRing[];
}

/** GET /customer-portal/chat/typing — is an agent typing to this client right now. */
export interface ChatTypingResponse {
  success: boolean;
  agent_typing: boolean;
  agent_name: string | null;
}

// ─────────────────────────── office/staff (Phase 3) ───────────────────────────
//
// Everything below talks to /api/schedule/*, NOT /api/customer-portal/* — the
// staff-authenticated surface (sowash-backend routes/schedulingRoutes.js),
// reached with an office_portal token via the staff `authenticate` gate
// (routes/middleware/auth.js). No approval gate, no client scoping: an office
// session sees every client's jobs, which is the entire point of these types.
// Transcribed from GET /history and the new GET /clients added in Phase 3 —
// a DIFFERENT SELECT list from JobSummary above, not a re-export of it.

/** One row from GET /api/schedule/history. */
export interface StaffJob {
  schedule_id: number;
  site_id: number | null;
  client_id: number;
  site_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  system_size: string | number | null;
  system_type: string | null;
  client_name: string | null;
  scheduled_date: string | null;
  service_number: string | number | null;
  status: string | null;
  approval_status: string | null;
  approved_at: string | null;
  priority: string | null;
  shift: string | null;
  previous_shift: string | null;
  reached_location_at: string | null;
  started_at: string | null;
  before_photos_at: string | null;
  after_photos_at: string | null;
  completed_at: string | null;
  before_photos: string | null;
  after_photos: string | null;
  notes: string | null;
  team_lead_name: string | null;
  // ── field_service_reports, LEFT JOINed: all null when no FSR was filed ──
  fsr_id: number | null;
  cable_condition: string | null;
  cable_quantity: string | number | null;
  panel_damage: string | null;
  panel_brand: string | null;
  inverter_alarm: string | null;
  alarm_code: string | null;
  potential_shading: string | null;
  shading_details: string | null;
  rusting: string | null;
  bird_dropping: string | null;
  mos_and_debris: string | null;
  earthing: string | null;
  cash_collected: string | null;
  customer_signature: string | null;
  additional_notes: string | null;
  temp_voltage_photos: string | null;
  total_panels_cleaned: string | number | null;
  /**
   * Pre-shaped server-side from the raw temp_voltage_photos column above —
   * see the matching comment in sowash-backend routes/schedulingRoutes.js.
   * Optional, not just possibly-empty: a backend that hasn't been redeployed
   * with the change that adds this field yet simply won't send it at all, so
   * callers must `?? []` rather than assume the array is always present.
   */
  tbt_photos?: StaffTbtPhoto[];
  /** Who clocked in/out for THIS job specifically (attendance.job_id). Optional — see tbt_photos. */
  attendance?: StaffAttendanceRecord[];
}

export interface StaffTbtPhoto {
  photo_url: string;
  captured_at: string | null;
}

export interface StaffAttendanceRecord {
  fo_name: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  status: string;
  clock_in_image_url: string | null;
  clock_out_image_url: string | null;
}

export interface StaffJobsResponse {
  success: boolean;
  jobs: StaffJob[];
}

export interface StaffStats {
  total: number;
  completed: number;
  inProgress: number;
  scheduled: number;
  rescheduled: number;
}

/** One row from GET /api/schedule/clients. */
export interface StaffClient {
  client_id: number;
  client_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  completed_jobs: number;
  total_sites: number;
  /** MAX(scheduled_date) across every visit for this client. Null = never scheduled one. Drives the "most recent first" ordering /schedule/clients now returns. */
  last_job_date: string | null;
}

export interface StaffClientsResponse {
  success: boolean;
  clients: StaffClient[];
}

// ─────────────────────── office staff chat (Phase 4) ───────────────────────
//
// Talks to /api/commercial-chat/* (sowash-backend routes/commercialChatRoutes.js)
// — the STAFF side of the same client-support conversations ChatThread in
// app/(tabs)/support.tsx reads from the CUSTOMER side
// (/api/customer-portal/chat*). Same underlying tables, two different APIs
// with two different visibility rules (see commercialChatVisit.js's shapeVisit
// `staff` flag) — never point this screen at the customer-portal endpoints or
// vice versa.
//
// Messages reuse ChatMessage/ChatVisitTag as-is: routes/commercialChatRoutes.js's
// shapeMessage() and customerJobHistoryRoutes.js's shapeChatMessage() both
// build the exact same {id, sender_kind, body, attachment_url, attachment_name,
// created_at, sender_name, visit} shape from utils/commercialChatVisit.js — the
// only difference is the VALUES inside `visit` (staff sees more), never the
// shape itself.
//
// Gated to ci_admin only, not the full OFFICE_ROLES set — see SUPPORT_ROLES in
// commercialChatRoutes.js. An operations/admin office session will 403 here
// even though it can use the rest of app/staff/*.

/** One row from GET /api/commercial-chat/threads — the inbox list. */
export interface StaffChatThread {
  id: number;
  /** How many sites the client wrote about that nobody has replied to yet (inbox only). */
  waiting_sites?: number;
  client_id: number;
  status: 'open' | 'closed';
  assigned_user_id: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_kind: ChatSenderKind | null;
  client_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  assigned_name: string | null;
  /**
   * Who sent last_message_preview — looked up from the message row itself,
   * since commercial_chat_threads has no last_sender_user_id column, only
   * last_sender_kind (a type, not a person). Only meaningful when
   * last_sender_kind === 'agent'; null for a customer- or system-sent
   * preview (system messages already name who did what in their own text).
   */
  last_sender_user_id: number | null;
  last_sender_name: string | null;
  /** Unread FOR THE CALLING AGENT — see AGENT_UNREAD_EXPR's header comment. */
  unread: number;
}

export interface StaffChatThreadsResponse {
  success: boolean;
  threads: StaffChatThread[];
  count: number;
}

/** GET /api/commercial-chat/unread → threads needing attention, not a message count. */
export interface StaffChatUnreadResponse {
  success: boolean;
  threads: number;
}

export interface StaffChatMessagesResponse {
  success: boolean;
  messages: ChatMessage[];
  count: number;
  reactions?: TeamReaction[];
  has_more?: boolean;
}

/** GET /commercial-chat/threads/:id/typing */
export interface StaffChatTypingResponse {
  success: boolean;
  customer_typing: boolean;
  /** A colleague typing in the same thread (never me), or null. */
  agent_typing_name: string | null;
}

export interface StaffChatSendResponse {
  success: boolean;
  message: ChatMessage;
}

/** GET /api/commercial-chat/agents — the assignee picker's own list. */
export interface StaffChatAgent {
  id: number;
  name: string | null;
  email: string | null;
  type: string;
}

export interface StaffChatAgentsResponse {
  success: boolean;
  agents: StaffChatAgent[];
  count: number;
}

/**
 * GET /api/commercial-chat/threads/:id and the PATCH response — the ONE
 * thread's own metadata, distinct from StaffChatThread above (that's the
 * inbox LIST row's shape; this adds fields the list doesn't select, like
 * email and created_at).
 */
export interface StaffChatThreadDetail {
  id: number;
  /** Sites the client wrote about that nobody has replied to yet (automatic — a reply clears them). */
  waiting_sites?: StaffChatWaitingSite[];
  client_id: number;
  status: 'open' | 'closed';
  assigned_user_id: number | null;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_kind: ChatSenderKind | null;
  client_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  assigned_name: string | null;
  unread: number;
}

/** A site the client wrote about that no agent has replied to yet. */
export interface StaffChatWaitingSite {
  site_id: number;
  site_name: string | null;
  last_at: string;
}

export interface StaffChatThreadDetailResponse {
  success: boolean;
  thread: StaffChatThreadDetail;
}

// ─────────────────────── internal staff chat (Phase 5) ───────────────────────
//
// Talks to /api/staff-chat/* (sowash-backend routes/staffChatRoutes.js) —
// staff TALKING TO EACH OTHER (DMs + groups), not to a client. Distinct
// tables (staff_conversations/staff_conversation_participants/staff_messages)
// from commercial-chat's client-support threads above; distinct role gate
// (any STAFF_ROLES member, not ci_admin-only). Surfaces as a second "Team"
// section on the same app/staff/chats.tsx screen, not a new tab.
//
// TeamMessage is its own type rather than reusing ChatMessage: same rough
// shape (id/body/attachment/sender/mentioned fields) but sender_kind's
// possible values differ ('staff'|'system', never 'customer'/'agent'), and
// there is no visit tag here at all.

export type TeamSenderKind = 'staff' | 'system';

/** The slice of a replied-to message the quote block needs — never the full original. */
export interface TeamReplyRef {
  id: number;
  sender_name: string | null;
  body: string | null;
  has_photo: boolean;
}

export interface TeamMessage {
  id: number;
  conversation_id: number;
  sender_kind: TeamSenderKind;
  sender_user_id: number | null;
  body: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  sender_name: string | null;
  mentioned_user_id: number | null;
  mentioned_name: string | null;
  /** @all in a group — notifies every member. Optional: absent on rows from before the column existed. */
  mention_all?: boolean;
  /** Reply-to-message: the message this one quotes. Optional: absent on rows from before the column existed. */
  reply_to_id?: number | null;
  reply_to?: TeamReplyRef | null;
  /**
   * Client-only — never present on anything the API returns. Set by
   * useTeamConversation's optimistic send (src/hooks.ts) on the local copy
   * of a message shown immediately, before the server round-trip confirms
   * it. `id` is a negative placeholder while pending; the real row (and
   * real id) replaces it on success, or it's removed on failure.
   */
  pending?: boolean;
  /** Client-only: the send failed — the bubble stays with Retry / Delete instead of vanishing (see useTeamConversation). */
  failed?: boolean;
  /** Client-only: a local `file://` URI to render before attachment_url exists (see `pending`). */
  localPhotoUri?: string;
}

/** One row from GET /api/staff-chat/conversations — the Team inbox list. */
export interface TeamConversation {
  id: number;
  kind: 'dm' | 'group';
  /** Group name, or the OTHER participant's name for a dm — resolved server-side. */
  name: string | null;
  /** Set only for a dm (who the "name" above refers to). Null for a group. */
  other_participant_id: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_user_id: number | null;
  /** Who last_message_preview is from — a direct users join on the FK, not a lookup, so always present when last_sender_user_id is. */
  last_sender_name: string | null;
  unread: number;
  /** True while an @-mention of me in this conversation is still unread — drives the "pinned to top + highlighted" treatment (a plain unread message doesn't get this). GET /conversations also sorts on this server-side, so the list is already in this order without any client-side re-sort. */
  has_unread_mention: boolean;
}

export interface TeamConversationsResponse {
  success: boolean;
  conversations: TeamConversation[];
}

export interface TeamParticipant {
  id: number;
  name: string | null;
  role: 'admin' | 'member';
  /** Drives the "seen" (blue double-tick) state on a message this participant didn't send — see messageSeenStatus() in app/staff/chats.tsx. */
  last_read_at: string | null;
  /** Drives the "delivered" (grey double-tick) state — bumped whenever this participant's client actually fetches the conversation's messages, whether or not they've read them. */
  last_delivered_at: string | null;
  /** True while this participant has at least one staff-chat socket open right now — live process state, not a DB column (see services/staffChatSocket.js's isUserOnline()). */
  online: boolean;
  /** The last moment `online` went from true to false — null if never seen offline (or never connected at all). Only meaningful when `online` is false. */
  last_seen_at: string | null;
}

/**
 * GET /api/staff-chat/conversations/:id and the POST/PATCH response bodies —
 * the one conversation's full detail, participants included (the list row
 * above doesn't carry these). `other_participant_id` mirrors TeamConversation.
 */
/** One user's emoji reaction to one message (one per user per message). */
export interface TeamReaction {
  message_id: number;
  user_id: number;
  emoji: string;
}

export interface TeamConversationDetail {
  id: number;
  kind: 'dm' | 'group';
  name: string | null;
  other_participant_id: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_user_id: number | null;
  participants: TeamParticipant[];
  /** Every reaction in the conversation, flat — grouped per message client-side. Optional for older cached copies. */
  reactions?: TeamReaction[];
}

export interface TeamConversationResponse {
  success: boolean;
  conversation: TeamConversationDetail;
}

export interface TeamMessagesResponse {
  success: boolean;
  messages: TeamMessage[];
  count: number;
  has_more?: boolean;
}

export interface TeamMessageResponse {
  success: boolean;
  message: TeamMessage;
}

export interface TeamUnreadResponse {
  success: boolean;
  unread: number;
}

/** GET /api/staff-chat/directory — the DM-recipient, group-member, and mention picker's shared list. */
export interface StaffDirectoryUser {
  id: number;
  name: string | null;
  email: string | null;
  type: string;
}

export interface StaffDirectoryResponse {
  success: boolean;
  users: StaffDirectoryUser[];
}
