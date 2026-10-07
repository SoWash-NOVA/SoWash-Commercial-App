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
  SafetyTrainingPhotosResponse,
  SldWalkthroughResponse,
  StaffChatAgentsResponse,
  StaffChatMessagesResponse,
  StaffChatSendResponse,
  StaffChatThreadDetail,
  StaffChatThreadDetailResponse,
  StaffChatThreadsResponse,
  StaffChatUnreadResponse,
  StaffClientsResponse,
  StaffDirectoryResponse,
  StaffJobsResponse,
  StaffStats,
  TbtPhotosResponse,
  TeamConversationDetail,
  TeamConversationResponse,
  TeamConversationsResponse,
  TeamMessage,
  TeamReplyRef,
  TeamReaction,
  StaffChatTypingResponse,
  ChatTypingResponse,
  ChatRing,
  ChatRingsResponse,
  TeamMessageResponse,
  TeamMessagesResponse,
  TeamUnreadResponse,
  UnreadResponse,
} from './api/types';
import { subscribeTeamSocket, sendTyping } from './teamChatSocket';
import { dataCache } from './dataCache';

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
function useAsync<T>(run: () => Promise<T>, deps: readonly unknown[], cacheName?: string): AsyncState<T> {
  // Stale-while-revalidate: with a cacheName, a previously loaded result for the same deps shows instantly.
  const cacheKey = cacheName ? `${cacheName}:${JSON.stringify(deps)}` : null;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  const initial = cacheKey ? dataCache.get<T>(cacheKey) : undefined;

  const [data, setData] = useState<T | null>(initial ?? null);
  const [loading, setLoading] = useState(initial === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runRef = useRef(run);
  runRef.current = run;

  // Guards against a resolved request from a previous dep set overwriting newer
  // data, and against setting state after unmount.
  const generation = useRef(0);

  const load = useCallback(async (isRefresh: boolean) => {
    const gen = ++generation.current;
    const key = cacheKeyRef.current;
    const cached = key ? dataCache.get<T>(key) : undefined;
    if (isRefresh) setRefreshing(true);
    else if (cached !== undefined) {
      // show what we already have, refresh quietly underneath
      setData(cached);
      setLoading(false);
    } else setLoading(true);

    try {
      const result = await runRef.current();
      if (gen !== generation.current) return;
      if (key) dataCache.set(key, result);
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
  }, [], 'client');
}

/** Every site under this client. Drives the site switcher. */
export function useSites() {
  return useAsync<SitesResponse>(async () => {
    const { data } = await api.get<SitesResponse>('customer-portal/client/sites');
    return data;
  }, [], 'sites');
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
  }, [], 'stats');
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
  }, [scope, siteId, status, search, limit], 'jobs');
}

/** One schedule with its field service report. Approved jobs (or today's) only. */
export function useJobDetail(scheduleId: number | string | null) {
  return useAsync<JobDetailResponse | null>(async () => {
    if (!scheduleId) return null;
    const { data } = await api.get<JobDetailResponse>(`customer-portal/${scheduleId}/detail`);
    return data;
  }, [scheduleId], 'jobDetail');
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
  }, [scheduleId], 'sld');
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
  }, [status, search, dateRange], 'maint');
}

export function useMaintenanceStats() {
  return useAsync<MaintenanceStats>(async () => {
    const { data } = await api.get<MaintenanceStats>('customer-portal/maintenance-stats');
    return data;
  }, [], 'maintStats');
}

export function useMaintenanceDetail(id: number | string | null) {
  return useAsync<MaintenanceDetailResponse | null>(async () => {
    if (!id) return null;
    const { data } = await api.get<MaintenanceDetailResponse>(
      `customer-portal/maintenance/${id}/detail`,
    );
    return data;
  }, [id], 'maintDetail');
}

/**
 * TBT (toolbox talk) photos — one per completed job, gated the same way
 * /history gates a job's own photos (see the backend route's comment).
 * Uploaded from the staff web portal; this app only reads.
 */
export function useTbtPhotos(siteId: number | null = null) {
  return useAsync<TbtPhotosResponse>(async () => {
    const params: Record<string, number> = {};
    if (siteId) params.site_id = siteId;
    const { data } = await api.get<TbtPhotosResponse>('customer-portal/documentation/tbt', {
      params,
    });
    return data;
  }, [siteId], 'tbt');
}

/** Safety Training photos — client/site-wide, not tied to a specific visit. */
export function useSafetyTrainingPhotos(siteId: number | null = null) {
  return useAsync<SafetyTrainingPhotosResponse>(async () => {
    const params: Record<string, number> = {};
    if (siteId) params.site_id = siteId;
    const { data } = await api.get<SafetyTrainingPhotosResponse>(
      'customer-portal/documentation/safety-training',
      { params },
    );
    return data;
  }, [siteId], 'safety');
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
  /** Set on team_message — see the internal staff chat section below. */
  conversation_id?: number | null;
}): string | null {
  // A chat reply opens the conversation, not a visit. There is one thread per
  // account, so the thread id is not needed in the route.
  if (n.type === 'chat_reply') return '/support';
  // Internal staff chat lives inside app/staff/chats.tsx as a second section,
  // not its own route — a `team` query param is how that screen knows which
  // conversation to open on mount. No conversation_id (should not normally
  // happen) still lands on the Team section rather than nowhere.
  if (n.type === 'team_message') {
    return n.conversation_id ? `/staff/chats?team=${n.conversation_id}` : '/staff/chats';
  }
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
  }, [], 'notifs');

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
 * Hand this device's FCM token to the backend — CLIENT sessions only.
 * /customer-portal/push/register is gated by authenticatePortal, which
 * rejects an office_portal token outright — this is why staff push has
 * never worked at all: every office session calling this silently 403'd
 * and src/push.ts's own .catch(() => {}) swallowed it with no visible sign
 * anything was wrong. Staff sessions must call registerStaffPushToken below
 * instead.
 *
 * Deliberately NOT swallowed here — src/push.ts decides what to do on
 * failure, and it has more context (no permission, no dev build, no
 * Firebase config).
 */
export async function registerPushToken(token: string, platform: string): Promise<void> {
  await api.post('customer-portal/push/register', { token, platform });
}

/**
 * Hand this device's FCM token to the backend — STAFF (office_portal)
 * sessions. A different endpoint entirely: POST /api/user/fcm-token
 * (routes/userRoutes.js), gated by the plain staff `authenticate` — which
 * accepts office_portal since Phase 1 — and writing to user_fcm_tokens, the
 * table services/staffPush.js's notifyStaff() (and so notifyAssignedAgent /
 * notifyMentionedAgent) actually reads. That table/endpoint already existed
 * before any of this session's chat work; the gap was only ever that this
 * app never called it for a staff session.
 *
 * Note the request path has no `customer-portal/` prefix — this hits
 * /api/user/fcm-token directly, a sibling mount, not a sibling route under
 * customer-portal.
 */
export async function registerStaffPushToken(token: string): Promise<void> {
  await api.post('user/fcm-token', { token });
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
/** Messages fetched when a chat opens, and per "scroll up for older" page. */
const CHAT_PAGE = 40;
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
  /** The message being replied to (sent as reply_to_id; also drawn on the optimistic bubble). */
  replyTo?: TeamReplyRef | null;
  photo?: ChatPhotoInput | null;
  scheduleId?: number | null;
  /** The site this message is about (a label on the message — there is still one shared thread). */
  siteId?: number | null;
  /** Its name, for the optimistic bubble only (the server returns site_name on the real row). */
  siteName?: string | null;
}

/** Order-insensitive signature, so an unchanged reaction list keeps its identity across polls. */
const reactionSig = (list: TeamReaction[]) =>
  list.map((r) => `${r.message_id}:${r.user_id}:${r.emoji}`).sort().join('|');

/**
 * The conversation.
 *
 * Deliberately NOT built on useAsync: this needs a delta poller keyed on the
 * last message id, an append rather than a replace, and a send path — none of
 * which the load/refresh/error shape covers.
 */
export function useChat(myUserId?: number | null) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<TeamReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // From a 2s poll — the client app has no socket (see services/chatTyping.js).
  const [agentTyping, setAgentTyping] = useState(false);
  const [agentTypingName, setAgentTypingName] = useState<string | null>(null);

  // The poller reads this instead of `messages` so its identity stays stable
  // and the interval is not torn down and rebuilt on every arriving message.
  const lastIdRef = useRef(0);
  // Negative, decrementing — can never collide with a real id.
  const nextLocalIdRef = useRef(0);
  const failedSendsRef = useRef(new Map<number, SendChatArgs>());

  const rememberLast = useCallback((list: ChatMessage[]) => {
    // Only real rows move the delta cursor — never an optimistic placeholder.
    const real = list.filter((m) => m.id > 0);
    if (real.length > 0) {
      lastIdRef.current = Math.max(lastIdRef.current, real[real.length - 1].id);
    }
  }, []);

  const adoptReactions = useCallback((next: TeamReaction[] | undefined) => {
    if (!next) return;
    setReactions((prev) => (reactionSig(prev) === reactionSig(next) ? prev : next));
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
      // Re-focusing must not wipe a bubble that is still sending / failed.
      setMessages((prev) => [...list, ...prev.filter((m) => m.id < 0)]);
      adoptReactions(data?.reactions);
      rememberLast(list);
      setError(null);
      if ((data?.unread ?? 0) > 0) markRead();
    } catch (err) {
      setError(errorMessage(err, 'Could not open support chat.'));
    } finally {
      setLoading(false);
    }
  }, [markRead, rememberLast, adoptReactions]);

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get<ChatDeltaResponse>('customer-portal/chat/messages', {
        params: lastIdRef.current ? { after_id: lastIdRef.current } : undefined,
      });
      // Before the early return: a reaction can change with no new message.
      adoptReactions(data?.reactions);

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
  }, [markRead, rememberLast, adoptReactions]);

  const pollTyping = useCallback(async () => {
    try {
      const { data } = await api.get<ChatTypingResponse>('customer-portal/chat/typing');
      setAgentTyping(!!data?.agent_typing);
      setAgentTypingName(data?.agent_name ?? null);
    } catch {
      // A missed tick just means a stale indicator for 2 more seconds.
    }
  }, []);

  // ── my own typing → support staff ──
  const typingActiveRef = useRef(false);
  const typingLastSentRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      typingLastSentRef.current = 0;
      api.post('customer-portal/chat/typing', { typing: false }).catch(() => {});
    }
  }, []);

  /** Call on every keystroke. Pings at most every 3s (server TTL is 5s), "stopped" after 3s of silence. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - typingLastSentRef.current > 3000) {
      typingLastSentRef.current = now;
      typingActiveRef.current = true;
      api.post('customer-portal/chat/typing', {}).catch(() => {});
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(stopTyping, 3000);
  }, [stopTyping]);

  /** The network half of a send. Never throws; on failure the bubble is kept, marked `failed`. */
  const post = useCallback(
    async (localId: number, { body, photo, scheduleId, siteId, siteName, replyTo }: SendChatArgs): Promise<void> => {
      const text = (body ?? '').trim();
      setSending(true);
      try {
        const form = new FormData();
        if (text) form.append('body', text);
        if (scheduleId) form.append('schedule_id', String(scheduleId));
        if (siteId) form.append('site_id', String(siteId));
        if (replyTo) form.append('reply_to_id', String(replyTo.id));
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

        failedSendsRef.current.delete(localId);
        setMessages((prev) => {
          const withoutLocal = prev.filter((m) => m.id !== localId);
          if (!data?.message) return withoutLocal;
          return withoutLocal.some((m) => m.id === data.message.id) ? withoutLocal : [...withoutLocal, data.message];
        });
        if (data?.message) rememberLast([data.message]);
      } catch {
        failedSendsRef.current.set(localId, { body, photo, scheduleId, siteId, siteName, replyTo });
        setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m)));
      } finally {
        setSending(false);
      }
    },
    [rememberLast],
  );

  const send = useCallback(
    async (args: SendChatArgs): Promise<boolean> => {
      const text = (args.body ?? '').trim();
      if (!text && !args.photo) return false;

      stopTyping();

      // Optimistic append — the message appears the instant you hit send.
      const localId = --nextLocalIdRef.current;
      const optimistic: ChatMessage = {
        id: localId,
        sender_kind: 'customer',
        sender_user_id: myUserId ?? null,
        body: text || null,
        attachment_url: null,
        attachment_name: args.photo?.name ?? null,
        created_at: new Date().toISOString(),
        sender_name: null,
        visit: null,
        site_id: args.siteId ?? null,
        site_name: args.siteName ?? null,
        reply_to: args.replyTo ?? null,
        pending: true,
        localPhotoUri: args.photo?.uri,
      };
      setMessages((prev) => [...prev, optimistic]);
      setError(null);

      // Fire and return: the composer clears at once because the bubble owns
      // the content now; a failure keeps it with Retry / Delete.
      void post(localId, args);
      return true;
    },
    [myUserId, post, stopTyping],
  );

  const retry = useCallback(
    (localId: number) => {
      const args = failedSendsRef.current.get(localId);
      if (!args) return;
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, pending: true, failed: false } : m)));
      void post(localId, args);
    },
    [post],
  );

  const discard = useCallback((localId: number) => {
    failedSendsRef.current.delete(localId);
    setMessages((prev) => prev.filter((m) => m.id !== localId));
  }, []);

  /** React to a message; the same emoji again removes it. Optimistic, rolled back if the PUT fails. */
  const react = useCallback(
    async (messageId: number, emoji: string) => {
      if (!myUserId || messageId <= 0) return;
      const mine = reactions.find((r) => r.message_id === messageId && r.user_id === myUserId);
      const next = mine?.emoji === emoji ? null : emoji;
      const before = reactions;

      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === myUserId));
        return next ? [...rest, { message_id: messageId, user_id: myUserId, emoji: next }] : rest;
      });
      try {
        await api.put(`customer-portal/chat/messages/${messageId}/reaction`, { emoji: next ?? '' });
      } catch {
        setReactions(before);
      }
    },
    [myUserId, reactions],
  );

  // Poll only while this screen is focused AND the app is foregrounded. A 5s
  // timer left running behind a backgrounded app is a battery complaint.
  useFocusEffect(
    useCallback(() => {
      open();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') poll();
      }, CHAT_POLL_MS);
      const typingTimer = setInterval(() => {
        if (AppState.currentState === 'active') pollTyping();
      }, 2000);

      const offPush = subscribePush(poll);

      return () => {
        clearInterval(timer);
        clearInterval(typingTimer);
        offPush();
        stopTyping();
        setAgentTyping(false);
        setAgentTypingName(null);
      };
    }, [open, poll, pollTyping, stopTyping]),
  );

  return {
    thread,
    messages,
    reactions,
    loading,
    error,
    sending,
    send,
    retry,
    discard,
    react,
    agentTyping,
    agentTypingName,
    notifyTyping,
    stopTyping,
    refresh: open,
  };
}

/**
 * One site's ring history (client side). Polls while focused because a ring's
 * status changes without the client doing anything — staff reply, staff close.
 * `ring()` sends a new ring: it is just a message tagged with the site, so it
 * also shows up in the General conversation (that is where everything lives).
 */
export function useSiteRings(siteId: number | null) {
  const [rings, setRings] = useState<ChatRing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<ChatRingsResponse>('customer-portal/chat/rings', {
        params: { site_id: siteId },
      });
      setRings(data?.rings ?? []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load rings.'));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') refresh();
      }, CHAT_POLL_MS);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  const ring = useCallback(
    async (body: string): Promise<boolean> => {
      if (!siteId) return false;
      setSending(true);
      try {
        const form = new FormData();
        form.append('body', body);
        form.append('site_id', String(siteId));
        await api.post('customer-portal/chat/messages', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        await refresh();
        return true;
      } catch (err) {
        setError(errorMessage(err, 'Could not send your ring.'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [siteId, refresh],
  );

  return { rings, loading, error, sending, ring, refresh };
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

// ─────────────────────────── office/staff (Phase 3) ───────────────────────────
//
// Talks to /api/schedule/*, not /api/customer-portal/* — see the header
// comment on StaffJob in api/types.ts. These are the only hooks in this file
// that don't go through the customer-portal API, so they're kept in their own
// section rather than interleaved with the client hooks above.

/** Every client's jobs, filterable by client — the office Jobs tab. */
export function useStaffJobs(
  opts: { clientId?: number | null; status?: string; search?: string } = {},
) {
  const { clientId = null, status, search } = opts;

  return useAsync<StaffJobsResponse>(async () => {
    const params: Record<string, string | number> = {};
    // NOT `client_id` — three sowash-frontend pages already send that exact
    // param name to this endpoint on every request (a pre-existing bug,
    // harmless only because the backend used to ignore it). See the matching
    // comment in sowash-backend routes/schedulingRoutes.js.
    if (clientId) params.office_client_id = clientId;
    if (status && status !== 'all') params.status = status;
    if (search && search.trim()) params.search = search.trim();

    const { data } = await api.get<StaffJobsResponse>('schedule/history', { params });
    return data;
  }, [clientId, status, search], 'sJobs');
}

/** Which slice of time the Overview KPI tiles count. Maps to the `period`
 *  query param on GET /schedule/stats — calendar-aligned, not a rolling
 *  window ('month' resets on the 1st). Omit for the endpoint's original
 *  all-time behaviour. */
export type StaffStatsPeriod = 'month' | 'last_month' | 'year' | 'all';

/** Org-wide job counts — no client scoping, matches the Overview KPI tiles. */
export function useStaffStats(period: StaffStatsPeriod = 'month') {
  return useAsync<StaffStats>(async () => {
    const params = period === 'all' ? undefined : { period };
    const { data } = await api.get<StaffStats>('schedule/stats', { params });
    return data;
  }, [period], 'sStats');
}

/** Every active commercial client, with site/completed-job counts — the office Clients tab picker. */
export function useStaffClients() {
  return useAsync<StaffClientsResponse>(async () => {
    const { data } = await api.get<StaffClientsResponse>('schedule/clients');
    return data;
  }, [], 'sClients');
}

// ─────────────────────── office staff chat (Phase 4) ───────────────────────
//
// Talks to /api/commercial-chat/*, the STAFF side of the same conversations
// useChat() above reads from the customer side. Deliberately not sharing a
// hook with useChat(): the customer has exactly one thread and opens it
// straight from a session, staff has an INBOX of many threads and only
// starts polling once one is actually open — different enough shapes that
// forcing one hook to cover both would need a threadId-or-not branch on
// every line rather than two hooks that each read cleanly.

export interface StaffSendChatArgs {
  body?: string | null;
  photo?: ChatPhotoInput | null;
  scheduleId?: number | null;
  /** @-mention one colleague on this message — see mentioned_user_id on ChatMessage. */
  mentionedUserId?: number | null;
  /** Display name for the optimistic bubble's highlight (the server fills mentioned_name in on the real row). */
  mentionedName?: string | null;
  /** Reply to this message (sent as reply_to_id — see docs/backend-patches/2026-10-07-support-chat-replies.md). */
  replyTo?: TeamReplyRef | null;
}

/** The inbox list. `status` defaults to 'open' — closed threads are a lookup, not the default view. */
export function useStaffChatThreads(status: 'open' | 'closed' | 'all' = 'open', q: string = '') {
  return useAsync<StaffChatThreadsResponse>(async () => {
    const params: Record<string, string> = {};
    if (status !== 'all') params.status = status;
    if (q.trim()) params.q = q.trim();

    const { data } = await api.get<StaffChatThreadsResponse>('commercial-chat/threads', { params });
    return data;
  }, [status, q], 'sThreads');
}

/** Threads needing an agent's attention — the Chats tab's centre badge. */
export function useStaffChatUnread() {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<StaffChatUnreadResponse>('commercial-chat/unread');
      setUnread(data?.threads ?? 0);
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

    return () => {
      clearInterval(timer);
      appStateSub.remove();
    };
  }, [refresh]);

  return { unread, refresh };
}

/**
 * One open conversation. Mirrors useChat()'s load/poll/send shape, scoped to
 * a single thread id instead of "the" thread.
 *
 * No subscribePush() wiring here, unlike useChat(): a NEW customer message
 * pushes to staff through services/staffPush.js's user_fcm_tokens, a
 * completely separate channel from the commercial_fcm_tokens src/push.ts
 * registers this app's own sessions against — this app has never registered
 * a staff session for push at all, so there is nothing to subscribe to yet.
 * Polling while the thread is open is the whole story for now.
 */
export function useStaffChatThread(threadId: number | null, myUserId?: number | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<TeamReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Typing comes from a 2s poll (the client app has no socket) — see
  // services/chatTyping.js on the backend.
  const [customerTyping, setCustomerTyping] = useState(false);
  const [agentTypingName, setAgentTypingName] = useState<string | null>(null);
  // Only the newest CHAT_PAGE messages load on open; older ones come in when you scroll to the top.
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const lastIdRef = useRef(0);
  // Negative, decrementing — can never collide with a real id.
  const nextLocalIdRef = useRef(0);
  // What to re-POST for a failed bubble, keyed by its local id.
  const failedSendsRef = useRef(new Map<number, StaffSendChatArgs>());

  const rememberLast = useCallback((list: ChatMessage[]) => {
    // Only real rows move the delta cursor — never an optimistic placeholder.
    const real = list.filter((m) => m.id > 0);
    if (real.length > 0) {
      lastIdRef.current = Math.max(lastIdRef.current, real[real.length - 1].id);
    }
  }, []);

  const adoptReactions = useCallback((next: TeamReaction[] | undefined) => {
    if (!next) return;
    setReactions((prev) => (reactionSig(prev) === reactionSig(next) ? prev : next));
  }, []);

  const markRead = useCallback(async () => {
    if (!threadId) return;
    try {
      await api.post(`commercial-chat/threads/${threadId}/read`, {});
    } catch {
      // The badge simply stays up until the next attempt.
    }
  }, [threadId]);

  const open = useCallback(async () => {
    if (!threadId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    lastIdRef.current = 0;
    try {
      const { data } = await api.get<StaffChatMessagesResponse>(
        `commercial-chat/threads/${threadId}/messages`,
        { params: { limit: CHAT_PAGE } },
      );
      const list = data?.messages ?? [];
      setHasMore(!!data?.has_more);
      // A reopen must not wipe a bubble that is still sending / failed.
      setMessages((prev) => [...list, ...prev.filter((m) => m.id < 0)]);
      adoptReactions(data?.reactions);
      rememberLast(list);
      setError(null);
      markRead();
    } catch (err) {
      setError(errorMessage(err, 'Could not open this conversation.'));
    } finally {
      setLoading(false);
    }
  }, [threadId, markRead, rememberLast, adoptReactions]);

  const poll = useCallback(async () => {
    if (!threadId) return;
    try {
      const { data } = await api.get<StaffChatMessagesResponse>(
        `commercial-chat/threads/${threadId}/messages`,
        { params: lastIdRef.current ? { after_id: lastIdRef.current } : undefined },
      );
      // Before the early return: a reaction can change with no new message.
      adoptReactions(data?.reactions);

      const fresh = data?.messages ?? [];
      if (fresh.length === 0) return;

      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...fresh.filter((m) => !seen.has(m.id))];
      });
      rememberLast(fresh);

      if (fresh.some((m) => m.sender_kind === 'customer')) markRead();
    } catch {
      // Silent. The next tick retries.
    }
  }, [threadId, markRead, rememberLast, adoptReactions]);

  /** Older messages, prepended — called when the list is scrolled to the top. */
  const loadOlder = useCallback(async () => {
    if (!threadId || !hasMore || loadingOlder) return;
    const oldest = messages.find((m) => m.id > 0);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { data } = await api.get<StaffChatMessagesResponse>(
        `commercial-chat/threads/${threadId}/messages`,
        { params: { limit: CHAT_PAGE, before_id: oldest.id } },
      );
      const older = data?.messages ?? [];
      setHasMore(!!data?.has_more);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !seen.has(m.id)), ...prev];
      });
    } catch {
      // Stay put; scrolling to the top again retries.
    } finally {
      setLoadingOlder(false);
    }
  }, [threadId, hasMore, loadingOlder, messages]);

  const pollTyping = useCallback(async () => {
    if (!threadId) return;
    try {
      const { data } = await api.get<StaffChatTypingResponse>(`commercial-chat/threads/${threadId}/typing`);
      setCustomerTyping(!!data?.customer_typing);
      setAgentTypingName(data?.agent_typing_name ?? null);
    } catch {
      // A missed tick just means a stale indicator for 2 more seconds.
    }
  }, [threadId]);

  // ── my own typing → the client (and any colleague in the thread) ──
  const typingActiveRef = useRef(false);
  const typingLastSentRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Call when the draft is cleared or sent — tells the other side right away instead of waiting out the 5s decay. */
  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (typingActiveRef.current && threadId) {
      typingActiveRef.current = false;
      typingLastSentRef.current = 0;
      api.post(`commercial-chat/threads/${threadId}/typing`, { typing: false }).catch(() => {});
    }
  }, [threadId]);

  /** Call on every keystroke. Pings at most every 3s (server TTL is 5s), and sends "stopped" after 3s of silence. */
  const notifyTyping = useCallback(() => {
    if (!threadId) return;
    const now = Date.now();
    if (now - typingLastSentRef.current > 3000) {
      typingLastSentRef.current = now;
      typingActiveRef.current = true;
      api.post(`commercial-chat/threads/${threadId}/typing`, {}).catch(() => {});
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(stopTyping, 3000);
  }, [threadId, stopTyping]);

  /** The network half of a send. Never throws; on failure the bubble is kept, marked `failed`. */
  const post = useCallback(
    async (localId: number, { body, photo, scheduleId, mentionedUserId, replyTo }: StaffSendChatArgs): Promise<void> => {
      const text = (body ?? '').trim();
      setSending(true);
      try {
        const form = new FormData();
        if (text) form.append('body', text);
        if (scheduleId) form.append('schedule_id', String(scheduleId));
        if (mentionedUserId) form.append('mentioned_user_id', String(mentionedUserId));
        if (replyTo) form.append('reply_to_id', String(replyTo.id));
        if (photo) {
          form.append('photo', {
            uri: photo.uri,
            name: photo.name || 'photo.jpg',
            type: photo.mimeType || 'image/jpeg',
          } as unknown as Blob);
        }

        const { data } = await api.post<StaffChatSendResponse>(
          `commercial-chat/threads/${threadId}/messages`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );

        failedSendsRef.current.delete(localId);
        // Swap the placeholder for the real row in one update, deduped
        // against anything the poll already delivered.
        setMessages((prev) => {
          const withoutLocal = prev.filter((m) => m.id !== localId);
          if (!data?.message) return withoutLocal;
          return withoutLocal.some((m) => m.id === data.message.id) ? withoutLocal : [...withoutLocal, data.message];
        });
        if (data?.message) rememberLast([data.message]);
      } catch {
        failedSendsRef.current.set(localId, { body, photo, scheduleId, mentionedUserId, replyTo });
        setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m)));
      } finally {
        setSending(false);
      }
    },
    [threadId, rememberLast],
  );

  const send = useCallback(
    async (args: StaffSendChatArgs): Promise<boolean> => {
      if (!threadId) return false;
      const text = (args.body ?? '').trim();
      if (!text && !args.photo) return false;

      stopTyping();

      // Optimistic append — the message appears the instant you hit send,
      // like WhatsApp, instead of after the round trip.
      const localId = --nextLocalIdRef.current;
      const optimistic: ChatMessage = {
        id: localId,
        sender_kind: 'agent',
        sender_user_id: myUserId ?? null,
        body: text || null,
        attachment_url: null,
        attachment_name: args.photo?.name ?? null,
        created_at: new Date().toISOString(),
        sender_name: null,
        visit: null,
        mentioned_user_id: args.mentionedUserId ?? null,
        mentioned_name: args.mentionedName ?? null,
        reply_to: args.replyTo ?? null,
        pending: true,
        localPhotoUri: args.photo?.uri,
      };
      setMessages((prev) => [...prev, optimistic]);
      setError(null);

      // Fire and return: the composer clears at once because the bubble now
      // owns the content; a failure keeps it with Retry / Delete.
      void post(localId, args);
      return true;
    },
    [threadId, myUserId, post, stopTyping],
  );

  /** Re-send a failed bubble in place — same local id, so it keeps its position. */
  const retry = useCallback(
    (localId: number) => {
      const args = failedSendsRef.current.get(localId);
      if (!args) return;
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, pending: true, failed: false } : m)));
      void post(localId, args);
    },
    [post],
  );

  const discard = useCallback((localId: number) => {
    failedSendsRef.current.delete(localId);
    setMessages((prev) => prev.filter((m) => m.id !== localId));
  }, []);

  /** React to a message; the same emoji again removes it. Optimistic, rolled back if the PUT fails. */
  const react = useCallback(
    async (messageId: number, emoji: string) => {
      if (!threadId || !myUserId || messageId <= 0) return;
      const mine = reactions.find((r) => r.message_id === messageId && r.user_id === myUserId);
      const next = mine?.emoji === emoji ? null : emoji;
      const before = reactions;

      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === myUserId));
        return next ? [...rest, { message_id: messageId, user_id: myUserId, emoji: next }] : rest;
      });
      try {
        await api.put(`commercial-chat/threads/${threadId}/messages/${messageId}/reaction`, { emoji: next ?? '' });
      } catch {
        setReactions(before);
      }
    },
    [threadId, myUserId, reactions],
  );

  useFocusEffect(
    useCallback(() => {
      if (!threadId) return;
      open();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') poll();
      }, CHAT_POLL_MS);
      const typingTimer = setInterval(() => {
        if (AppState.currentState === 'active') pollTyping();
      }, 2000);

      return () => {
        clearInterval(timer);
        clearInterval(typingTimer);
        stopTyping();
        setCustomerTyping(false);
        setAgentTypingName(null);
      };
    }, [threadId, open, poll, pollTyping, stopTyping]),
  );

  return {
    messages,
    reactions,
    loading,
    error,
    sending,
    send,
    retry,
    discard,
    react,
    customerTyping,
    agentTypingName,
    notifyTyping,
    stopTyping,
    refresh: open,
    hasMore,
    loadingOlder,
    loadOlder,
  };
}

/** Every ci_admin — the assignee picker's list. Small and static enough not to need polling. */
export function useStaffChatAgents() {
  return useAsync<StaffChatAgentsResponse>(async () => {
    const { data } = await api.get<StaffChatAgentsResponse>('commercial-chat/agents');
    return data;
  }, [], 'sAgents');
}

/**
 * One thread's own metadata (who it's assigned to, its status) plus the
 * action to change the assignment — separate from useStaffChatThread above,
 * which only ever deals in messages. ThreadView in app/staff/chats.tsx uses
 * both together: this for the header's assign control, that for the
 * conversation itself.
 */
export function useStaffChatThreadMeta(threadId: number | null) {
  const [thread, setThread] = useState<StaffChatThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignError, setAssignError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!threadId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get<StaffChatThreadDetailResponse>(`commercial-chat/threads/${threadId}`);
      setThread(data?.thread ?? null);
    } catch {
      // Non-fatal — the assign control just won't show current state.
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * userId null unassigns. Returns whether it actually took — the caller
   * MUST check this before treating the picker's job as done (a swallowed
   * failure here previously looked identical to a success: the picker
   * closed either way with nothing on screen saying otherwise).
   */
  const assign = useCallback(
    async (userId: number | null): Promise<boolean> => {
      if (!threadId) return false;
      setAssignError(null);
      try {
        const { data } = await api.patch<StaffChatThreadDetailResponse>(
          `commercial-chat/threads/${threadId}`,
          { assigned_user_id: userId },
        );
        if (data?.thread) setThread(data.thread);
        return true;
      } catch (err) {
        setAssignError(errorMessage(err, 'Could not update the assignment.'));
        return false;
      }
    },
    [threadId],
  );

  /**
   * Close (`'closed'`) or reopen (`'open'`) the conversation. Returns whether
   * it took. The server drops a "X closed this conversation" note into the
   * thread, which the open thread's own poll then picks up.
   */
  const setStatus = useCallback(
    async (next: 'open' | 'closed'): Promise<boolean> => {
      if (!threadId) return false;
      try {
        const { data } = await api.patch<StaffChatThreadDetailResponse>(
          `commercial-chat/threads/${threadId}`,
          { status: next },
        );
        if (data?.thread) setThread(data.thread);
        return true;
      } catch {
        return false;
      }
    },
    [threadId],
  );

  return { thread, loading, assign, assignError, setStatus, refresh: load };
}

// ─────────────────────── internal staff chat (Phase 5) ───────────────────────
//
// Talks to /api/staff-chat/*, staff TALKING TO EACH OTHER (DMs + groups), not
// to a client — see the header comment on TeamMessage in src/api/types.ts.
// Surfaces as a second "Team" section on app/staff/chats.tsx, so these hooks
// mirror the office-chat ones above (useStaffChatThreads/useStaffChatThread)
// rather than sharing them: same shapes, different endpoints, different
// sender_kind values, no visit tag.
//
// Real-time: subscribeTeamSocket() (src/teamChatSocket.ts) hands off whatever
// the WebSocket delivers, deduped by id exactly like a poll response — but
// polling underneath never stops. If the socket never connects (unconfirmed
// whether the VPS's reverse proxy passes the upgrade through), these hooks
// behave exactly like useStaffChatThread above: 5s polling while focused,
// nothing more, nothing less.

export interface StaffSendTeamArgs {
  body?: string | null;
  photo?: ChatPhotoInput | null;
  /** @-mention one participant of THIS conversation — see mentioned_user_id on TeamMessage. */
  mentionedUserId?: number | null;
  /** @all — groups only; the backend ignores it for a dm. */
  mentionAll?: boolean;
  /** Reply to (quote) a specific earlier message of this conversation. */
  replyTo?: TeamReplyRef | null;
}

/** Every person who can be DM'd, added to a group, or @-mentioned in Team chat. Small and static enough not to poll. */
export function useStaffDirectory() {
  return useAsync<StaffDirectoryResponse>(async () => {
    const { data } = await api.get<StaffDirectoryResponse>('staff-chat/directory');
    return data;
  }, [], 'sDir');
}

/** The Team inbox list — DMs and groups together, newest activity first. */
export function useTeamConversations(q: string = '') {
  return useAsync<TeamConversationsResponse>(async () => {
    const params: Record<string, string> = {};
    if (q.trim()) params.q = q.trim();

    const { data } = await api.get<TeamConversationsResponse>('staff-chat/conversations', { params });
    return data;
  }, [q], 'tConvs');
}

/**
 * Total unread across every Team conversation — the piece
 * app/staff/_layout.tsx's centre tab badge combines with
 * useStaffChatUnread()'s own count, per that file's own comment already
 * anticipating this.
 */
export function useTeamUnread() {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<TeamUnreadResponse>('staff-chat/unread');
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

    // A socket delivery means something changed right now — no reason to
    // wait for the next 60s tick.
    const offSocket = subscribeTeamSocket(() => refresh());

    return () => {
      clearInterval(timer);
      appStateSub.remove();
      offSocket();
    };
  }, [refresh]);

  return { unread, refresh };
}

// Module-level, in-memory only (cleared on app restart, never written to
// disk) — the last known-good state for a conversation this app session has
// already opened. On reopening it (e.g. back out to the Team list, then tap
// the same thread again), useTeamConversation hydrates from this instantly
// instead of showing a blank spinner while open() re-fetches — the same
// "feels instant" effect WhatsApp gets from its on-device SQLite cache, just
// scoped to what's already been loaded in memory this session rather than a
// real persistence layer (a bigger, separate piece of work — see the
// performance-audit notes in CLAUDE.md — this is the contained version of
// that same idea for the one screen it matters most on).
const teamConversationCache = new Map<number, { conversation: TeamConversationDetail | null; messages: TeamMessage[] }>();

/**
 * One open conversation: detail (participants, resolved name) + messages +
 * poll + send, combined — unlike client-support chat, the Team thread view
 * always needs the participant list on hand (a group's header shows the
 * count, and "Manage" needs the roles), so there is no separate "meta" hook
 * here the way useStaffChatThreadMeta splits off from useStaffChatThread.
 */
export function useTeamConversation(conversationId: number | null, myUserId: number | undefined) {
  const [conversation, setConversation] = useState<TeamConversationDetail | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  // Reactions live beside `messages`, not on them: a reaction to an OLD
  // message must update without touching (and re-rendering) the message list.
  const [reactions, setReactions] = useState<TeamReaction[]>([]);
  /** Replace only when the content actually changed — the 5s poll hands back an identical list almost every time, and a new identity would re-render every bubble for nothing. */
  const adoptReactions = useCallback((next: TeamReaction[] | undefined) => {
    if (!next) return;
    const sig = (list: TeamReaction[]) =>
      list.map((r) => `${r.message_id}:${r.user_id}:${r.emoji}`).sort().join('|');
    setReactions((prev) => (sig(prev) === sig(next) ? prev : next));
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Who (besides me) is currently typing in this conversation — WhatsApp-
  // style, ephemeral, never persisted. Each id auto-expires on its own timer
  // in case a stop_typing event is ever lost (app backgrounded, socket
  // hiccup) rather than trusting the network to always deliver the "stopped"
  // half of the pair.
  const [typingUserIds, setTypingUserIds] = useState<number[]>([]);
  const typingExpiryTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const lastIdRef = useRef(0);
  // Set true/false by useFocusEffect below. A tab screen stays MOUNTED when
  // you switch tabs (React Navigation doesn't unmount inactive tabs by
  // default) — this is what stops the socket subscription from marking a
  // message "read" just because it arrived while this screen still happens
  // to be sitting mounted in the background. The poll path doesn't need
  // this same guard: its setInterval is destroyed on blur, so it physically
  // cannot fire while unfocused the way this plain effect can.
  const isFocusedRef = useRef(false);

  const rememberLast = useCallback((list: TeamMessage[]) => {
    if (list.length > 0) {
      lastIdRef.current = Math.max(lastIdRef.current, list[list.length - 1].id);
    }
  }, []);

  const clearTypingExpiry = useCallback((userId: number) => {
    const timer = typingExpiryTimersRef.current.get(userId);
    if (timer) {
      clearTimeout(timer);
      typingExpiryTimersRef.current.delete(userId);
    }
  }, []);

  const markTyping = useCallback(
    (userId: number) => {
      clearTypingExpiry(userId);
      setTypingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      const timer = setTimeout(() => {
        typingExpiryTimersRef.current.delete(userId);
        setTypingUserIds((prev) => prev.filter((id) => id !== userId));
      }, 6000);
      typingExpiryTimersRef.current.set(userId, timer);
    },
    [clearTypingExpiry],
  );

  const clearTyping = useCallback(
    (userId: number) => {
      clearTypingExpiry(userId);
      setTypingUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : prev));
    },
    [clearTypingExpiry],
  );

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    try {
      await api.post(`staff-chat/conversations/${conversationId}/read`, {});
    } catch {
      // The badge simply stays up until the next attempt.
    }
  }, [conversationId]);

  const open = useCallback(async () => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    // Hydrate instantly from whatever this session already knows about this
    // conversation — the fetch below still runs and will overwrite this
    // with the real, current data, but the user isn't staring at a blank
    // spinner for however long that round trip takes in the meantime.
    const cached = teamConversationCache.get(conversationId);
    lastIdRef.current = 0;
    if (cached) {
      setConversation(cached.conversation);
      adoptReactions(cached.conversation?.reactions);
      setMessages(cached.messages);
      rememberLast(cached.messages);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const [detailRes, messagesRes] = await Promise.all([
        api.get<TeamConversationResponse>(`staff-chat/conversations/${conversationId}`),
        api.get<TeamMessagesResponse>(`staff-chat/conversations/${conversationId}/messages`, {
          params: { limit: CHAT_PAGE },
        }),
      ]);
      const freshConversation = detailRes.data?.conversation ?? null;
      const list = messagesRes.data?.messages ?? [];
      setHasMore(!!messagesRes.data?.has_more);
      setConversation(freshConversation);
      adoptReactions(freshConversation?.reactions);
      setMessages(list);
      rememberLast(list);
      teamConversationCache.set(conversationId, { conversation: freshConversation, messages: list });
      setError(null);
      markRead();
    } catch (err) {
      // A cached copy already rendered above — a failed refresh shouldn't
      // blank it out, just surface the error alongside what's already shown.
      if (!cached) setError(errorMessage(err, 'Could not open this conversation.'));
    } finally {
      setLoading(false);
    }
  }, [conversationId, markRead, rememberLast, adoptReactions]);

  /** Older messages, prepended — called when the list is scrolled to the top. */
  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasMore || loadingOlder) return;
    const oldest = messages.find((m) => m.id > 0);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { data } = await api.get<TeamMessagesResponse>(`staff-chat/conversations/${conversationId}/messages`, {
        params: { limit: CHAT_PAGE, before_id: oldest.id },
      });
      const older = data?.messages ?? [];
      setHasMore(!!data?.has_more);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !seen.has(m.id)), ...prev];
      });
    } catch {
      // Scrolling to the top again retries.
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, messages]);

  /** Admin-only (the server enforces it): removes the message for everyone. Returns an error string, or null on success. */
  const deleteMessage = useCallback(
    async (messageId: number): Promise<string | null> => {
      if (!conversationId) return 'No conversation.';
      try {
        await api.delete(`staff-chat/conversations/${conversationId}/messages/${messageId}`);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return null;
      } catch (err) {
        return errorMessage(err, 'Could not delete this message.');
      }
    },
    [conversationId],
  );

  const poll = useCallback(async () => {
    if (!conversationId) return;
    try {
      const [messagesRes, detailRes] = await Promise.all([
        api.get<TeamMessagesResponse>(
          `staff-chat/conversations/${conversationId}/messages`,
          { params: lastIdRef.current ? { after_id: lastIdRef.current } : undefined },
        ),
        // Refreshes each participant's last_read_at — the WebSocket path
        // (below) already flips a tick instantly when it's connected, this
        // is the fallback for when it isn't. Runs every tick regardless of
        // whether there are new messages: the other side reading OLD
        // messages still needs to flip single → double with nothing new
        // having arrived.
        api.get<TeamConversationResponse>(`staff-chat/conversations/${conversationId}`),
      ]);

      const freshConversation = detailRes.data?.conversation ?? null;
      if (freshConversation) {
        setConversation(freshConversation);
        adoptReactions(freshConversation.reactions);
        const existing = teamConversationCache.get(conversationId);
        teamConversationCache.set(conversationId, { conversation: freshConversation, messages: existing?.messages ?? [] });
      }

      const fresh = messagesRes.data?.messages ?? [];
      if (fresh.length === 0) return;

      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const merged = [...prev, ...fresh.filter((m) => !seen.has(m.id))];
        const existing = teamConversationCache.get(conversationId);
        teamConversationCache.set(conversationId, {
          conversation: existing?.conversation ?? freshConversation,
          messages: merged,
        });
        return merged;
      });
      rememberLast(fresh);
      markRead();
    } catch {
      // Silent. The next tick retries.
    }
  }, [conversationId, markRead, rememberLast, adoptReactions]);

  // The recipient list a typing ping fans out to — this conversation's own
  // participants minus me, the exact set services/staffChatSocket.js trusts
  // instead of querying for it (see that file's own comment). Kept in a ref
  // rather than recomputed inline so notifyTyping/stopTyping don't need
  // `conversation` in their own dependency arrays.
  const typingRecipientIdsRef = useRef<number[]>([]);
  useEffect(() => {
    typingRecipientIdsRef.current = (conversation?.participants ?? [])
      .map((p) => p.id)
      .filter((id) => id !== myUserId);
  }, [conversation, myUserId]);

  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Call on every keystroke. Sends "typing" at most once per pause, then auto-sends "stopped" after 3s of silence — same debounce WhatsApp's own client uses. */
  const notifyTyping = useCallback(() => {
    if (!conversationId || typingRecipientIdsRef.current.length === 0) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      sendTyping(conversationId, typingRecipientIdsRef.current, true);
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      sendTyping(conversationId, typingRecipientIdsRef.current, false);
    }, 3000);
  }, [conversationId]);

  /** Call when the draft is cleared or sent — lets the other side know right away instead of waiting out the 3s decay above. */
  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (typingActiveRef.current && conversationId) {
      typingActiveRef.current = false;
      sendTyping(conversationId, typingRecipientIdsRef.current, false);
    }
  }, [conversationId]);

  // Leaving the conversation (switching threads, unmounting) must tell the
  // other side "stopped" immediately rather than leaving them staring at a
  // typing bubble for up to 6s (markTyping's own expiry) with nobody there.
  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      if (typingActiveRef.current && conversationId) {
        sendTyping(conversationId, typingRecipientIdsRef.current, false);
      }
    };
  }, [conversationId]);

  // Negative, decrementing — can never collide with a real (positive) server
  // id, so "is this message still local?" is always just `id < 0`.
  const nextLocalIdRef = useRef(0);

  // What to re-POST for a bubble that failed, keyed by its local id. A ref,
  // not state — nothing renders from it, the bubble's own `failed` flag does.
  const failedSendsRef = useRef(new Map<number, StaffSendTeamArgs>());

  /** The network half of a send. Never throws; on failure the bubble is kept, marked `failed`, so Retry/Delete can act on it. */
  const post = useCallback(
    async (localId: number, { body, photo, mentionedUserId, mentionAll, replyTo }: StaffSendTeamArgs): Promise<void> => {
      const text = (body ?? '').trim();
      setSending(true);
      try {
        const form = new FormData();
        if (text) form.append('body', text);
        if (mentionedUserId) form.append('mentioned_user_id', String(mentionedUserId));
        if (mentionAll) form.append('mention_all', 'true');
        if (replyTo) form.append('reply_to_id', String(replyTo.id));
        if (photo) {
          form.append('photo', {
            uri: photo.uri,
            name: photo.name || 'photo.jpg',
            type: photo.mimeType || 'image/jpeg',
          } as unknown as Blob);
        }

        const { data } = await api.post<TeamMessageResponse>(
          `staff-chat/conversations/${conversationId}/messages`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );

        failedSendsRef.current.delete(localId);
        // Swap the optimistic placeholder for the real row in one update —
        // never both on screen at once, and dedupe against anything the
        // socket/poll already delivered for this same send in the meantime.
        setMessages((prev) => {
          const withoutLocal = prev.filter((m) => m.id !== localId);
          if (!data?.message) return withoutLocal;
          return withoutLocal.some((m) => m.id === data.message.id) ? withoutLocal : [...withoutLocal, data.message];
        });
        if (data?.message) rememberLast([data.message]);
      } catch {
        failedSendsRef.current.set(localId, { body, photo, mentionedUserId, mentionAll, replyTo });
        setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m)));
      } finally {
        setSending(false);
      }
    },
    [conversationId, rememberLast],
  );

  /**
   * React to a message. Same emoji as your current one = remove it (WhatsApp:
   * tap your own reaction again). Optimistic, rolled back if the PUT fails.
   */
  const react = useCallback(
    async (messageId: number, emoji: string) => {
      if (!conversationId || !myUserId || messageId <= 0) return;
      const mine = reactions.find((r) => r.message_id === messageId && r.user_id === myUserId);
      const next = mine?.emoji === emoji ? null : emoji;
      const before = reactions;

      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === myUserId));
        return next ? [...rest, { message_id: messageId, user_id: myUserId, emoji: next }] : rest;
      });
      try {
        await api.put(`staff-chat/conversations/${conversationId}/messages/${messageId}/reaction`, {
          emoji: next ?? '',
        });
      } catch {
        setReactions(before);
      }
    },
    [conversationId, myUserId, reactions],
  );

  /** Re-send a failed bubble in place — same local id, so it keeps its position in the thread. */
  const retry = useCallback(
    (localId: number) => {
      const args = failedSendsRef.current.get(localId);
      if (!args) return;
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, pending: true, failed: false } : m)));
      void post(localId, args);
    },
    [post],
  );

  /** Throw a failed bubble away. */
  const discard = useCallback((localId: number) => {
    failedSendsRef.current.delete(localId);
    setMessages((prev) => prev.filter((m) => m.id !== localId));
  }, []);

  const send = useCallback(
    async ({ body, photo, mentionedUserId, mentionAll, replyTo }: StaffSendTeamArgs): Promise<boolean> => {
      if (!conversationId) return false;
      const text = (body ?? '').trim();
      if (!text && !photo) return false;

      stopTyping();

      // Optimistic append — the message appears the instant you hit send,
      // not after the network round trip (which, for a photo, can be
      // several seconds). This was the single biggest reason the chat felt
      // slower than WhatsApp: WhatsApp never waits on the network to show
      // your own message. `pending: true` drives a faded bubble + a small
      // spinner in place of the tick (TeamBubble); `localPhotoUri` lets the
      // photo preview render immediately, before attachment_url exists.
      const localId = --nextLocalIdRef.current;
      const mentionedName =
        mentionedUserId != null
          ? conversation?.participants.find((p) => p.id === mentionedUserId)?.name ?? null
          : null;
      const optimistic: TeamMessage = {
        id: localId,
        conversation_id: conversationId,
        sender_kind: 'staff',
        sender_user_id: myUserId ?? null,
        body: text || null,
        attachment_url: null,
        attachment_name: photo?.name ?? null,
        created_at: new Date().toISOString(),
        sender_name: null,
        mentioned_user_id: mentionedUserId ?? null,
        mentioned_name: mentionedName,
        mention_all: !!mentionAll,
        reply_to_id: replyTo?.id ?? null,
        reply_to: replyTo ?? null,
        pending: true,
        localPhotoUri: photo?.uri,
      };
      setMessages((prev) => [...prev, optimistic]);

      setError(null);
      // Fire and return: the composer clears right away because the bubble
      // now owns the content. A failure keeps that bubble with Retry/Delete
      // (see post()) instead of dropping it and making the user retype.
      void post(localId, { body, photo, mentionedUserId, mentionAll, replyTo });
      return true;
    },
    [conversationId, stopTyping, myUserId, conversation, post],
  );

  // Whatever the socket hands off for THIS conversation gets merged the same
  // way a poll response does — dedupe by id, no coordination needed between
  // the two delivery paths. A read_receipt event flips the sender's own
  // single tick to a double tick instantly, instead of waiting for the next
  // poll tick to notice this participant's last_read_at moved.
  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeTeamSocket((event) => {
      if (event.conversation_id !== conversationId) return;

      if (event.type === 'staff_message') {
        setMessages((prev) => (prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message]));
        rememberLast([event.message]);
        // Only mark it read if this screen is actually the one on screen
        // right now — otherwise a message that arrives while you're on a
        // totally different tab would falsely show as "seen" to the sender.
        if (isFocusedRef.current) markRead();
        // Someone can't still be "typing" once their message has actually
        // landed — clear it immediately rather than waiting on their own
        // stop_typing ping (or the 6s expiry) to catch up.
        if (event.message.sender_user_id != null) clearTyping(event.message.sender_user_id);
        return;
      }

      if (event.type === 'reaction') {
        setReactions((prev) => {
          const rest = prev.filter((r) => !(r.message_id === event.message_id && r.user_id === event.user_id));
          return event.emoji
            ? [...rest, { message_id: event.message_id, user_id: event.user_id, emoji: event.emoji }]
            : rest;
        });
        return;
      }

      if (event.type === 'message_deleted') {
        setMessages((prev) => prev.filter((m) => m.id !== event.message_id));
        return;
      }

      if (event.type === 'typing') {
        markTyping(event.user_id);
        return;
      }

      if (event.type === 'stop_typing') {
        clearTyping(event.user_id);
        return;
      }

      if (event.type === 'mention_reminder') {
        // Only reaches here for THIS conversation (the guard above already
        // filtered by conversation_id) — meaning the mention reminder fired
        // while this exact thread happened to be open. It's already been
        // read, so there's nothing for this screen to do; TeamList's own
        // socket listener is what re-sorts/re-badges the inbox.
        return;
      }

      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map((p) =>
            p.id === event.user_id ? { ...p, last_read_at: event.last_read_at } : p,
          ),
        };
      });
    });
  }, [conversationId, rememberLast, markRead, markTyping, clearTyping]);

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      isFocusedRef.current = true;
      open();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') poll();
      }, CHAT_POLL_MS);

      return () => {
        isFocusedRef.current = false;
        clearInterval(timer);
      };
    }, [conversationId, open, poll]),
  );

  // Switching to a different conversation (or leaving this screen) discards
  // whatever typing state belonged to the old one — it would otherwise be
  // meaningless (and, worse, misattributed) once conversationId moves on.
  useEffect(() => {
    return () => {
      typingExpiryTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingExpiryTimersRef.current.clear();
      setTypingUserIds([]);
    };
  }, [conversationId]);

  return {
    conversation,
    messages,
    loading,
    error,
    sending,
    send,
    retry,
    discard,
    reactions,
    react,
    refresh: open,
    typingUserIds,
    notifyTyping,
    stopTyping,
    hasMore,
    loadingOlder,
    loadOlder,
    deleteMessage,
  };
}

/** Get-or-create a dm with `userId`. Throws on failure — callers already sit inside a try/catch (the "New conversation" sheet). */
export async function startTeamDm(userId: number): Promise<TeamConversationDetail> {
  const { data } = await api.post<TeamConversationResponse>('staff-chat/conversations', {
    kind: 'dm',
    user_id: userId,
  });
  if (!data?.conversation) throw new Error('Could not start the conversation.');
  return data.conversation;
}

/** Admin-only server-side (see routes/staffChatRoutes.js) — the client-side gate on this is UX only, never trust it alone. */
export async function createTeamGroup(name: string, participantIds: number[]): Promise<TeamConversationDetail> {
  const { data } = await api.post<TeamConversationResponse>('staff-chat/conversations', {
    kind: 'group',
    name,
    participant_ids: participantIds,
  });
  if (!data?.conversation) throw new Error('Could not create the group.');
  return data.conversation;
}

export async function renameTeamGroup(conversationId: number, name: string): Promise<TeamConversationDetail> {
  const { data } = await api.patch<TeamConversationResponse>(`staff-chat/conversations/${conversationId}`, { name });
  if (!data?.conversation) throw new Error('Could not rename the group.');
  return data.conversation;
}

/** Add and/or remove members — server refuses to remove the last remaining conversation admin. */
export async function updateTeamGroupMembers(
  conversationId: number,
  changes: { add?: number[]; remove?: number[] },
): Promise<TeamConversationDetail> {
  const { data } = await api.patch<TeamConversationResponse>(
    `staff-chat/conversations/${conversationId}/participants`,
    changes,
  );
  if (!data?.conversation) throw new Error('Could not update the group.');
  return data.conversation;
}
