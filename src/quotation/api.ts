// src/quotation/api.ts
//
// /api/quotations (sowash-backend routes/quotationRoutes.js) — the same saved quotations the web console's
// Sales > Quotation Generator uses. The whole form lives in `data` (jsonb); the list columns are copies.

import api from '../api/client';
import { DEFAULT_QUOTATION, DEFAULT_TERMS } from './template';

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export const STATUSES: { value: QuotationStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: '#94A3B8' },
  { value: 'sent', label: 'Sent', color: '#0EA5E9' },
  { value: 'accepted', label: 'Accepted', color: '#16A34A' },
  { value: 'rejected', label: 'Rejected', color: '#DC2626' },
];
export const statusOf = (v: string) => STATUSES.find((s) => s.value === v) ?? STATUSES[0];

export interface QuotationRow {
  id: number;
  quote_no: string;
  client_name: string;
  site: string | null;
  quote_date: string | null;
  subtotal: string | number;
  tax_amount: string | number;
  total: string | number;
  currency: string;
  status: QuotationStatus;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  description: string;
  details: string;
  amount: string;
}

export interface QuotationForm extends Record<string, any> {
  clientName: string;
  quoteNo: string;
  date: string;
  currency: string;
  taxPercent: string | number;
  lineItems: LineItem[];
  terms: string[];
  revised: boolean;
  revisionOf: string;
}

export const MAX_ITEMS = 4;
export const MAX_TERMS = 9;

// ── Quote number: SW-<MON>-<YY><DD> from the quotation date (27 Oct 2026 -> SW-OCT-2627). A second one the same day
// gets -2, -3 ...; a revision gets -R (then -R2 ...). Same rules as QuotationGenerator.js on the web.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad2 = (n: number) => String(n).padStart(2, '0');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export const baseQuoteNo = (isoDate: string) => {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [y, mo, dd] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : todayIso().split('-').map(Number);
  return `SW-${MONTHS[mo - 1]}-${pad2(y % 100)}${pad2(dd)}`;
};
export const stripRevision = (no: string) => String(no || '').trim().replace(/-R\d*$/i, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function nextQuoteNo(isoDate: string, revised: boolean, revisionOf: string): Promise<string> {
  const base = revised && revisionOf ? stripRevision(revisionOf) : baseQuoteNo(isoDate);
  const { data } = await api.get('quotations', { params: { search: base, limit: 100 } });
  const nos: string[] = (data.quotations || []).map((q: QuotationRow) => String(q.quote_no || '').trim());
  const used = new Set<number>();
  if (revised) {
    const re = new RegExp(`^${escapeRe(base)}-R(\d*)$`, 'i');
    nos.forEach((no) => {
      const m = no.match(re);
      if (m) used.add(m[1] ? parseInt(m[1], 10) : 1);
    });
    if (!used.has(1)) return `${base}-R`;
    let n = 2;
    while (used.has(n)) n += 1;
    return `${base}-R${n}`;
  }
  const re = new RegExp(`^${escapeRe(base)}(?:-(\d+))?$`, 'i');
  nos.forEach((no) => {
    const m = no.match(re);
    if (m) used.add(m[1] ? parseInt(m[1], 10) : 1);
  });
  if (!used.has(1)) return base;
  let n = 2;
  while (used.has(n)) n += 1;
  return `${base}-${n}`;
}

export const blankForm = (): QuotationForm => ({
  ...DEFAULT_QUOTATION,
  date: todayIso(),
  revised: false,
  revisionOf: '',
  lineItems: [{ description: '', details: '', amount: '' }],
  terms: [...DEFAULT_TERMS],
} as QuotationForm);

export interface QuotationList {
  quotations: QuotationRow[];
  total: number;
  totalPages: number;
}

export async function listQuotations(p: { page: number; search?: string; status?: string }): Promise<QuotationList> {
  const { data } = await api.get('quotations', {
    params: { page: p.page, limit: 20, search: p.search || undefined, status: p.status || undefined },
  });
  return { quotations: data.quotations ?? [], total: data.total ?? 0, totalPages: data.totalPages ?? 1 };
}

export async function getQuotation(id: number): Promise<QuotationRow & { data: Record<string, any> }> {
  const { data } = await api.get(`quotations/${id}`);
  return data.quotation;
}

export async function saveQuotation(id: number | null, form: QuotationForm): Promise<QuotationRow> {
  const { data } = id
    ? await api.put(`quotations/${id}`, { data: form })
    : await api.post('quotations', { data: form });
  return data.quotation;
}

export async function setQuotationStatus(id: number, status: QuotationStatus): Promise<QuotationRow> {
  const { data } = await api.patch(`quotations/${id}/status`, { status });
  return data.quotation;
}

export interface AccessUser {
  id: number;
  name: string | null;
  email: string | null;
  type: string;
  granted: boolean;
}

export async function listAccess(): Promise<AccessUser[]> {
  const { data } = await api.get('quotations/access');
  return data.users ?? [];
}

export async function setAccess(userId: number, granted: boolean): Promise<void> {
  await api.put(`quotations/access/${userId}`, { granted });
}
