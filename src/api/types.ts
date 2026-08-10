// src/api/types.ts
//
// Response shapes for /api/customer-portal/*, transcribed from the SELECT lists
// in routes/customerJobHistoryRoutes.js rather than guessed. Only the endpoints
// Phase 1 actually calls are typed here; the rest arrive with the screens that
// use them, so nothing in this file is ever speculative.
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
