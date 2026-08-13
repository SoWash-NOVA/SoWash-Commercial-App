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
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import api, { errorMessage } from './api/client';
import {
  HistoryResponse,
  JobDetailResponse,
  JobScope,
  JobSummary,
  MaintenanceDetailResponse,
  MaintenanceResponse,
  MaintenanceStats,
  PortalStats,
  ProfileResponse,
  SitesResponse,
  ChatDeltaResponse,
  ChatMessage,
  ChatResponse,
  ChatThread,
  NotificationsResponse,
  NotificationType,
  SldWalkthroughResponse,
  UnreadResponse,
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

/**
 * The SLD walkthrough for one visit: the site diagram, its pins, and the
 * before/after photo captured at each pin during THIS visit.
 *
 * Fetched by the detail screen as well as the walkthrough screen, because
 * /:schedule_id/detail does not carry has_sld_walkthrough — only /history
 * computes that flag (see the Omit on JobDetail in api/types.ts). Rather than
 * add a backend field and a deploy, the detail screen asks for the real thing
 * and decides with sldHasWalk(). It is a small payload and only one request.
 *
 * A site with no diagram is a normal answer, not an error: the endpoint returns
 * { hasDiagram: false, points: [] } and the caller falls back to the flat grid.
 */
export function useSldWalkthrough(scheduleId: number | string | null) {
  return useAsync<SldWalkthroughResponse | null>(async () => {
    if (!scheduleId) return null;
    const { data } = await api.get<SldWalkthroughResponse>(`customer-portal/sld/${scheduleId}`);
    return data;
  }, [scheduleId]);
}

/**
 * Maintenance tasks — a separate work stream from cleaning visits.
 *
 * Takes no siteId, and must not be given one: maintenance_schedules has no site
 * column. See the note on MaintenanceJob in api/types.ts.
 */
export function useMaintenance(opts: { status?: string; search?: string; dateRange?: string } = {}) {
  const { status, search, dateRange } = opts;

  return useAsync<MaintenanceResponse>(async () => {
    const params: Record<string, string> = {};
    if (status && status !== 'all') params.status = status;
    if (search && search.trim()) params.search = search.trim();
    if (dateRange && dateRange !== 'all') params.dateRange = dateRange;

    const { data } = await api.get<MaintenanceResponse>('customer-portal/maintenance-history', {
      params,
    });
    return data;
  }, [status, search, dateRange]);
}

export function useMaintenanceStats() {
  return useAsync<MaintenanceStats>(async () => {
    const { data } = await api.get<MaintenanceStats>('customer-portal/maintenance-stats');
    return data;
  }, []);
}

export function useMaintenanceDetail(id: number | string | null) {
  return useAsync<MaintenanceDetailResponse | null>(async () => {
    if (!id) return null;
    const { data } = await api.get<MaintenanceDetailResponse>(
      `customer-portal/maintenance/${id}/detail`,
    );
    return data;
  }, [id]);
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

/**
 * Is there actually a walkthrough to show for this visit?
 *
 * Mirrors the EXISTS behind has_sld_walkthrough in /history: a diagram must
 * exist AND at least one of its pins must carry a before or after photo from
 * this schedule. A diagram with no photos is not a walkthrough — it is an empty
 * map, and offering to "walk" it would be a dead end.
 *
 * This is also what absorbs the re-uploaded-diagram edge case. The endpoint
 * always returns the site's LATEST diagram; if it was replaced after this visit
 * the new pin ids match none of the visit's photos, every url comes back null,
 * and this correctly reports false so the flat grid ships instead.
 */
export function sldHasWalk(sld: SldWalkthroughResponse | null | undefined): boolean {
  if (!sld?.hasDiagram || !sld.diagram?.diagram_url) return false;
  return (sld.points ?? []).some((p) => Boolean(p.before_url || p.after_url));
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

// ────────────────────────────── notifications ──────────────────────────────
//
// Feed + badge for the bell on Overview. Rows come from
// commercial_notifications, written by the backend on two events only: the
// crew starting work, and CI admin approving a finished visit.

/**
 * Where a tapped notification should land.
 *
 * Both types point at the visit. `visit_approved` always resolves — approval
 * is exactly what makes a completed job visible. `crew_started` resolves on
 * the day, because /:schedule_id/detail admits
 * `approval_status = 'approved' OR scheduled_date = CURRENT_DATE`, and a crew
 * starts on the scheduled date.
 *
 * ⚠ Tapping a `crew_started` notification the NEXT day, before the visit has
 * been approved, falls outside both halves of that predicate and 404s. That is
 * not handled here: app/job/[id].tsx already renders "This visit is not
 * available yet. Completed visits appear once CI admin has approved them",
 * which is the truthful answer. Swallowing the tap instead would be worse — a
 * dead row in the feed with no explanation.
 */
export function notificationTarget(n: {
  type?: NotificationType | string | null;
  schedule_id?: number | null;
  thread_id?: number | null;
}): string | null {
  // A chat reply opens the conversation, not a visit. There is one thread per
  // account, so the thread id is not needed in the route.
  if (n.type === 'chat_reply') return '/support';
  return n.schedule_id ? `/job/${n.schedule_id}` : null;
}

// A module-level pub-sub so a push arriving while the app is OPEN refreshes
// the badge and the feed immediately. FCM shows no tray notification in the
// foreground, so without this the customer sees nothing until the next poll.
type PushListener = () => void;
const pushListeners = new Set<PushListener>();

/** Called by src/push.ts when a message arrives in the foreground. */
export function pushArrived(): void {
  pushListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One bad subscriber must not stop the others.
    }
  });
}

function subscribePush(listener: PushListener): () => void {
  pushListeners.add(listener);
  return () => {
    pushListeners.delete(listener);
  };
}

/** Poll interval for the bell badge while the app is in the foreground. */
const UNREAD_POLL_MS = 60_000;

/**
 * Unread count for the bell badge.
 *
 * Its own endpoint rather than reading `unread` off the feed, because the
 * badge is live on Overview while the feed is opened rarely. Polling is
 * deliberately paused unless the app is active — a 60s timer running in the
 * background would drain battery for a notification the tray already showed.
 *
 * A failed poll is swallowed. The badge is decoration; showing an error banner
 * on the dashboard because a count request timed out would be absurd.
 */
export function useUnreadCount() {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<UnreadResponse>('customer-portal/notifications/unread');
      setUnread(data?.unread ?? 0);
    } catch {
      // Leave the previous count in place.
    }
  }, []);

  useEffect(() => {
    refresh();

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, UNREAD_POLL_MS);

    // Coming back from the background is the most likely moment for the count
    // to be stale, since that is usually a tray notification being tapped.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });

    const offPush = subscribePush(refresh);

    return () => {
      clearInterval(timer);
      appStateSub.remove();
      offPush();
    };
  }, [refresh]);

  return { unread, refresh, setUnread };
}

/**
 * The notification feed.
 *
 * One page of 50. There is no infinite scroll: two notifications per visit
 * means even a daily-cleaning client takes months to fill that, and `hasMore`
 * is surfaced as a line of text rather than a paging control nobody would hit.
 */
export function useNotifications() {
  const state = useAsync<NotificationsResponse>(async () => {
    const { data } = await api.get<NotificationsResponse>('customer-portal/notifications', {
      params: { limit: 50 },
    });
    return data;
  }, []);

  // Refresh in place if a push lands while the feed is on screen.
  useEffect(() => subscribePush(state.refresh), [state.refresh]);

  return state;
}

/**
 * Mark notifications read. Passing no ids marks the whole feed.
 *
 * Returns how many rows actually changed. Best-effort by design: this is
 * called as a side effect of opening a screen, and a failure there must not
 * produce an error the customer has to dismiss. The badge simply stays up and
 * clears on the next attempt.
 *
 * ⚠ An EMPTY array is not the same as no argument. The backend reads an empty
 * ids array as "mark these specific ones, of which none are valid" and updates
 * nothing, so it is normalised to "mark everything" here rather than silently
 * doing nothing.
 */
export async function markNotificationsRead(ids?: number[]): Promise<number> {
  try {
    const body = ids && ids.length > 0 ? { ids } : {};
    const { data } = await api.post<{ success: boolean; updated: number }>(
      'customer-portal/notifications/read',
      body,
    );
    return data?.updated ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Hand this device's FCM token to the backend.
 *
 * Deliberately NOT swallowed — src/push.ts decides what to do on failure, and
 * it has more context (no permission, no dev build, no Firebase config).
 */
export async function registerPushToken(token: string, platform: string): Promise<void> {
  await api.post('customer-portal/push/register', { token, platform });
}

// ────────────────────────────── support chat ──────────────────────────────
//
// One thread per ACCOUNT, so there is no inbox on this side — the Support tab
// IS the conversation. Staff see an inbox because an agent handles many
// clients; a site manager only ever talks to SoWash.
//
// Polling, not websockets: the backend has no socket layer. 5s while the
// screen is focused and the app is active, stopped otherwise.

/** How often to poll for new messages while the Support tab is open. */
const CHAT_POLL_MS = 5_000;
/** How often to refresh the tab-bar unread badge from anywhere in the app. */
const CHAT_UNREAD_POLL_MS = 60_000;

/** A photo picked with expo-image-picker, reduced to what upload needs. */
export interface ChatPhotoInput {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}

export interface SendChatArgs {
  body?: string | null;
  photo?: ChatPhotoInput | null;
  scheduleId?: number | null;
}

/**
 * The conversation.
 *
 * Deliberately NOT built on useAsync: this needs a delta poller keyed on the
 * last message id, an append rather than a replace, and a send path — none of
 * which the load/refresh/error shape covers.
 */
export function useChat() {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // The poller reads this instead of `messages` so its identity stays stable
  // and the interval is not torn down and rebuilt on every arriving message.
  const lastIdRef = useRef(0);

  const rememberLast = useCallback((list: ChatMessage[]) => {
    if (list.length > 0) {
      lastIdRef.current = Math.max(lastIdRef.current, list[list.length - 1].id);
    }
  }, []);

  const markRead = useCallback(async () => {
    try {
      await api.post('customer-portal/chat/read', {});
    } catch {
      // The badge simply stays up until the next attempt.
    }
  }, []);

  const open = useCallback(async () => {
    try {
      const { data } = await api.get<ChatResponse>('customer-portal/chat');
      setThread(data?.thread ?? null);
      const list = data?.messages ?? [];
      setMessages(list);
      rememberLast(list);
      setError(null);
      if ((data?.unread ?? 0) > 0) markRead();
    } catch (err) {
      setError(errorMessage(err, 'Could not open support chat.'));
    } finally {
      setLoading(false);
    }
  }, [markRead, rememberLast]);

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get<ChatDeltaResponse>('customer-portal/chat/messages', {
        params: lastIdRef.current ? { after_id: lastIdRef.current } : undefined,
      });
      const fresh = data?.messages ?? [];
      if (fresh.length === 0) return;

      setMessages((prev) => {
        // The send path appends optimistically, and a poll in flight at that
        // moment can carry the same row back. Filtering by id keeps the list
        // honest without needing to coordinate the two.
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...fresh.filter((m) => !seen.has(m.id))];
      });
      rememberLast(fresh);

      // Anything from the other side that arrives while the screen is open
      // has, by definition, been seen.
      if (fresh.some((m) => m.sender_kind === 'agent')) markRead();
    } catch {
      // Silent. The next tick retries.
    }
  }, [markRead, rememberLast]);

  const send = useCallback(
    async ({ body, photo, scheduleId }: SendChatArgs): Promise<boolean> => {
      const text = (body ?? '').trim();
      if (!text && !photo) return false;

      setSending(true);
      setError(null);
      try {
        const form = new FormData();
        if (text) form.append('body', text);
        if (scheduleId) form.append('schedule_id', String(scheduleId));
        if (photo) {
          // React Native's FormData takes this shape for a file; it is not the
          // web File object and TypeScript has no type for it.
          form.append('photo', {
            uri: photo.uri,
            name: photo.name || 'photo.jpg',
            type: photo.mimeType || 'image/jpeg',
          } as unknown as Blob);
        }

        const { data } = await api.post<{ success: boolean; message: ChatMessage }>(
          'customer-portal/chat/messages',
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );

        if (data?.message) {
          setMessages((prev) =>
            prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
          );
          rememberLast([data.message]);
        }
        return true;
      } catch (err) {
        setError(errorMessage(err, 'Could not send your message.'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [rememberLast],
  );

  // Poll only while this screen is focused AND the app is foregrounded. A 5s
  // timer left running behind a backgrounded app is a battery complaint.
  useFocusEffect(
    useCallback(() => {
      open();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') poll();
      }, CHAT_POLL_MS);

      const offPush = subscribePush(poll);

      return () => {
        clearInterval(timer);
        offPush();
      };
    }, [open, poll]),
  );

  return { thread, messages, loading, error, sending, send, refresh: open };
}

/**
 * Unread message count for the Support tab badge.
 *
 * Separate from useUnreadCount() (the bell). They are different inboxes: the
 * bell is job events, this is someone waiting for a reply. Collapsing them
 * would mean a customer clearing the bell also silences an unanswered
 * question.
 */
export function useChatUnread() {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<UnreadResponse>('customer-portal/chat/unread');
      setUnread(data?.unread ?? 0);
    } catch {
      // Leave the previous count in place.
    }
  }, []);

  useEffect(() => {
    refresh();

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, CHAT_UNREAD_POLL_MS);

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });

    const offPush = subscribePush(refresh);

    return () => {
      clearInterval(timer);
      appStateSub.remove();
      offPush();
    };
  }, [refresh]);

  return { unread, refresh };
}
