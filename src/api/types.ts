// src/api/types.ts
//
// Response shapes for /api/customer-portal/*, transcribed from the SELECT lists
// in routes/customerJobHistoryRoutes.js rather than guessed.
//
// Two things to keep in mind when extending it:
//   • Money and sizes are VARCHAR in this schema, not numeric. They come back
//     as strings like "1,250,000" or "300 kW" and must be parsed, not summed.
//   • site_schedules.status is free-text. Compare case-insensitively.

/** The `users` row behind a portal session, as returned by the login route. */
export interface PortalUser {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** users."Type" — always 'customer' for accounts this app admits. */
  role: string | null;
  /** FK to commercial_clients. The login route rejects accounts without one. */
  client_id: number;
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
  sender_kind: ChatSenderKind;
  body: string | null;
  /** Server path like "/uploads/commercial-chat/…". Needs SERVER_BASE. */
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  /** Staff name on an agent message; the sender's name on a customer one. */
  sender_name: string | null;
  visit: ChatVisitTag | null;
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
}

export interface ChatDeltaResponse {
  success: boolean;
  messages: ChatMessage[];
  count: number;
}
