// src/hooks.ts
//
// Data hooks for the commercial portal app. Everything here talks to
// /api/customer-portal (sowash-backend/routes/customerJobHistoryRoutes.js).
//
// The useAsync plumbing is lifted from sowash-customer-app/src/hooks.ts —
// same generation-guard, same load/refresh/error shape. Deliberately
// dependency-free: a handful of read endpoints with pull-to-refresh on every
// screen does not justify a cache layer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { errorMessage } from './api/client';
import {
  HistoryResponse,
  JobDetailResponse,
  JobScope,
  JobSummary,
  PortalStats,
  ProfileResponse,
  SitesResponse,
} from './api/types';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** Set only on a failed load; cleared when a retry succeeds. */
  error: string | null;
  /** True while a pull-to-refresh is in flight over existing data. */
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/**
 * Shared load/refresh/error plumbing.
 *
 * `run` is held in a ref so callers can pass an inline arrow without the effect
 * re-firing every render, while `deps` stays the explicit re-fetch trigger.
 */
function useAsync<T>(run: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runRef = useRef(run);
  runRef.current = run;

  // Guards against a resolved request from a previous dep set overwriting newer
  // data, and against setting state after unmount.
  const generation = useRef(0);

  const load = useCallback(async (isRefresh: boolean) => {
    const gen = ++generation.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await runRef.current();
      if (gen !== generation.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (gen !== generation.current) return;
      setError(errorMessage(err));
    } finally {
      if (gen === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load(false);
    return () => {
      // Invalidate any in-flight request belonging to this dep set.
      generation.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refreshing, refresh };
}

// ────────────────────────────── endpoints ──────────────────────────────

/** commercial_clients row for the signed-in account. */
export function useClient() {
  return useAsync<ProfileResponse>(async () => {
    const { data } = await api.get<ProfileResponse>('customer-portal/customer/profile');
    return data;
  }, []);
}

/** Every site under this client. Drives the site switcher. */
export function useSites() {
  return useAsync<SitesResponse>(async () => {
    const { data } = await api.get<SitesResponse>('customer-portal/client/sites');
    return data;
  }, []);
}

/**
 * Job counts.
 *
 * NOTE these are client-wide — /stats takes no site_id, so they do not narrow
 * with the site switcher. The dashboard says "across all sites" on them rather
 * than letting the numbers quietly disagree with a filtered list.
 */
export function useStats() {
  return useAsync<PortalStats>(async () => {
    const { data } = await api.get<PortalStats>('customer-portal/stats');
    return data;
  }, []);
}

/**
 * Job history.
 *
 * `scope` matters more than it looks. Rows come back ordered by scheduled_date
 * DESC and the endpoint pages at 100, so with scope 'all' a client with many
 * future bookings gets a page consisting almost entirely of jobs that have not
 * happened yet — Power Cement's first completed job sat at rank 46. 'past' is
 * what you want for a history list; 'upcoming' for a schedule.
 */
export function useJobs(opts: {
  scope?: JobScope;
  siteId?: number | null;
  status?: string;
  search?: string;
  limit?: number;
} = {}) {
  const { scope = 'all', siteId = null, status, search, limit } = opts;

  return useAsync<HistoryResponse>(async () => {
    const params: Record<string, string | number> = {};
    if (scope !== 'all') params.scope = scope;
    if (siteId) params.site_id = siteId;
    if (status && status !== 'all') params.status = status;
    if (search && search.trim()) params.search = search.trim();
    if (limit) params.limit = limit;

    const { data } = await api.get<HistoryResponse>('customer-portal/history', { params });
    return data;
  }, [scope, siteId, status, search, limit]);
}

/** One schedule with its field service report. Approved jobs (or today's) only. */
export function useJobDetail(scheduleId: number | string | null) {
  return useAsync<JobDetailResponse | null>(async () => {
    if (!scheduleId) return null;
    const { data } = await api.get<JobDetailResponse>(`customer-portal/${scheduleId}/detail`);
    return data;
  }, [scheduleId]);
}

// ────────────────────────────── derived ──────────────────────────────

/**
 * Split a job list into what is coming and what has been done.
 *
 * Done deliberately on `status` rather than on the date: a job scheduled for
 * last week that nobody closed out is still outstanding, and showing it under
 * "completed" because its date has passed would be a lie.
 */
export function useSplitJobs(jobs: JobSummary[] | undefined) {
  return useMemo(() => {
    const list = jobs ?? [];
    const done = list.filter((j) => isCompleted(j.status));
    const active = list.filter((j) => isInProgress(j.status));
    const upcoming = list.filter((j) => isScheduled(j.status));
    return { done, active, upcoming };
  }, [jobs]);
}

// ────────────────────────────── status ──────────────────────────────
//
// site_schedules.status is free-text varchar written by several screens over
// several years. Always compare lowercased, and prefix-match `complet%` — the
// residential side has both 'completed' and 'complete' in the wild.

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();

export const isCompleted = (s: string | null | undefined) => norm(s).startsWith('complet');
export const isScheduled = (s: string | null | undefined) => norm(s) === 'scheduled';
export const isCancelled = (s: string | null | undefined) => norm(s).startsWith('cancel');
export const isInProgress = (s: string | null | undefined) =>
  ['started', 'before_photos', 'after_photos', 'in_progress'].includes(norm(s));

export interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

/** Mirrors statusMeta() in the web portal so both clients read identically. */
export function statusMeta(status: string | null | undefined): StatusMeta {
  const s = norm(status);
  const map: Record<string, StatusMeta> = {
    completed: { label: 'Completed', color: '#22C55E', bg: '#22C55E18' },
    scheduled: { label: 'Scheduled', color: '#38BDF8', bg: '#38BDF818' },
    started: { label: 'In Progress', color: '#F59E0B', bg: '#F59E0B18' },
    before_photos: { label: 'In Progress', color: '#F59E0B', bg: '#F59E0B18' },
    after_photos: { label: 'In Progress', color: '#F59E0B', bg: '#F59E0B18' },
    in_progress: { label: 'In Progress', color: '#F59E0B', bg: '#F59E0B18' },
    rescheduled: { label: 'Rescheduled', color: '#F87171', bg: '#F8717118' },
    cancelled: { label: 'Cancelled', color: '#94A3B8', bg: '#94A3B818' },
  };
  return map[s] || { label: status || 'Unknown', color: '#94A3B8', bg: '#94A3B818' };
}

/**
 * How far along a job is, for the detail screen's timeline.
 * Returns the completed step count out of STAGES.length.
 */
export const STAGES = ['Scheduled', 'Started', 'Before photos', 'After photos', 'Completed'] as const;

export function stageIndex(job: {
  started_at?: string | null;
  before_photos_at?: string | null;
  after_photos_at?: string | null;
  completed_at?: string | null;
}): number {
  if (job.completed_at) return 5;
  if (job.after_photos_at) return 4;
  if (job.before_photos_at) return 3;
  if (job.started_at) return 2;
  return 1;
}

// ────────────────────────────── formatting ──────────────────────────────
//
// scheduled_date is a DATE column and must NOT be timezone-converted — doing so
// shifts it a day either side of midnight. It is rendered from its own parts.
// Timestamp columns (started_at, completed_at, …) DO carry an instant and are
// rendered in Asia/Karachi, per the workspace-wide PKT convention.

const PKT = 'Asia/Karachi';

/** A DATE column ("2026-08-04" or an ISO string) → "4 Aug 2026". No TZ maths. */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return '—';
  const [, y, mo, d] = m;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(mo, 10) - 1]} ${y}`;
}

/** A timestamp column → "4 Aug, 14:30" in Pakistan time. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PKT,
  });
}

/** A timestamp column → "14:30" in Pakistan time. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PKT,
  });
}

/** "Today" / "Tomorrow" / "In 3 days" / "12 days ago" for a DATE column. */
export function relativeDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;

  // Compare calendar days, not instants — the value has no time component.
  const [, y, mo, d] = m;
  const target = Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - today) / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/**
 * System sizes are VARCHAR — "300", "300 kW", "1.2 MW", or empty. Show the
 * string as given, only appending a unit when it is clearly a bare number.
 */
export function formatSystemSize(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') {
    return '—';
  }
  const s = String(value).trim();
  return /^[\d.,]+$/.test(s) ? `${s} kW` : s;
}
