// src/quotation/access.ts
//
// Who may use the Quotations module on the phone: the super admin only. This list only decides what the app SHOWS —
// the server is what enforces it (routes/quotationRoutes.js, QUOTATION_APP_EMAILS: a mobile office_portal token must
// belong to one of these emails; the web console's sales/admin access is unchanged). Keep the two lists the same.

export const QUOTATION_APP_EMAILS = ['superadmin@sowash.pk'];

export function canUseQuotations(email: string | null | undefined): boolean {
  return QUOTATION_APP_EMAILS.includes(String(email ?? '').trim().toLowerCase());
}
