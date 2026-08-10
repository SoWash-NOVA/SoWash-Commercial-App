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
  /** Whether Phase 4's SLD walkthrough has anything to show for this job. */
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
 */
export interface JobDetail extends JobSummary {
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
