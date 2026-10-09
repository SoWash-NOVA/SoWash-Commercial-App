// src/chatDue.tsx
//
// Deadlines on assigned support conversations (staff app). When a conversation is assigned the assigner can set a
// timeline ("resolve within 2 hours"). The server reminds the assignee (services/chatDueReminders.js) and, once the
// conversation is closed, marks it resolved on time / late. This file is the app's side of that: the timeline
// choices, how long is left, and the little badges that show it in the inbox list and in the thread, so everyone
// can see at a glance what is on track, what is overdue and what was resolved late.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlarmClock, CircleCheck, Clock, TriangleAlert } from 'lucide-react-native';
import { formatTime } from './hooks';
import { palette } from './theme';

export interface DueFields {
  status?: 'open' | 'closed';
  assigned_user_id?: number | null;
  assigned_due_at?: string | null;
  closed_at?: string | null;
  resolved_late?: boolean | null;
}

/** The choices offered when assigning. `minutes: null` = no deadline. */
export const TIMELINES: Array<{ key: string; label: string; minutes: number | null }> = [
  { key: '15m', label: '15 min', minutes: 15 },
  { key: '30m', label: '30 min', minutes: 30 },
  { key: '1h', label: '1 hour', minutes: 60 },
  { key: '2h', label: '2 hours', minutes: 120 },
  { key: '4h', label: '4 hours', minutes: 240 },
  { key: 'eod', label: 'End of day', minutes: -1 }, // resolved to a real number by timelineMinutes()
  { key: 'none', label: 'No deadline', minutes: null },
];

/** Minutes for a chosen timeline; "End of day" = until 6 PM today (or tomorrow if that is under 30 min away). */
export function timelineMinutes(key: string, now = new Date()): number | null {
  const t = TIMELINES.find((x) => x.key === key);
  if (!t || t.minutes === null) return null;
  if (t.minutes >= 0) return t.minutes;
  const end = new Date(now);
  end.setHours(18, 0, 0, 0);
  let mins = Math.round((end.getTime() - now.getTime()) / 60000);
  if (mins < 30) mins += 24 * 60;
  return mins;
}

/** "40m", "1h 10m", "2d 3h" */
export function spanText(ms: number): string {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return rest ? `${h}h ${rest}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export type DueState =
  | { kind: 'none' }
  | { kind: 'ok'; leftMs: number; due: string } // plenty of time
  | { kind: 'soon'; leftMs: number; due: string } // under 30 minutes (or 25 % of the window) left
  | { kind: 'overdue'; overMs: number; due: string }
  | { kind: 'resolved-on-time'; due: string }
  | { kind: 'resolved-late'; due: string; overMs: number };

export function dueState(t: DueFields, now = Date.now()): DueState {
  if (!t.assigned_due_at) return { kind: 'none' };
  const dueMs = new Date(t.assigned_due_at).getTime();
  if (Number.isNaN(dueMs)) return { kind: 'none' };
  if (t.status === 'closed') {
    if (t.resolved_late == null) return { kind: 'none' };
    const closedMs = t.closed_at ? new Date(t.closed_at).getTime() : now;
    return t.resolved_late
      ? { kind: 'resolved-late', due: t.assigned_due_at, overMs: Math.max(0, closedMs - dueMs) }
      : { kind: 'resolved-on-time', due: t.assigned_due_at };
  }
  if (t.assigned_user_id == null) return { kind: 'none' };
  const left = dueMs - now;
  if (left <= 0) return { kind: 'overdue', overMs: -left, due: t.assigned_due_at };
  return left <= 30 * 60000 ? { kind: 'soon', leftMs: left, due: t.assigned_due_at } : { kind: 'ok', leftMs: left, due: t.assigned_due_at };
}

/** Re-renders every `everyMs` so countdowns keep moving. */
export function useNow(everyMs = 30000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

const COLORS = {
  ok: { bg: '#E8F5EC', fg: '#166534' },
  soon: { bg: '#FEF3C7', fg: '#92400E' },
  late: { bg: '#FEE2E2', fg: '#B91C1C' },
};

function label(state: DueState): { text: string; tone: keyof typeof COLORS; Icon: typeof Clock } | null {
  switch (state.kind) {
    case 'ok':
      return { text: `Due in ${spanText(state.leftMs)} · ${formatTime(state.due)}`, tone: 'ok', Icon: Clock };
    case 'soon':
      return { text: `Due in ${spanText(state.leftMs)} · ${formatTime(state.due)}`, tone: 'soon', Icon: AlarmClock };
    case 'overdue':
      return { text: `Overdue by ${spanText(state.overMs)}`, tone: 'late', Icon: TriangleAlert };
    case 'resolved-late':
      return { text: `Resolved late (${spanText(state.overMs)} over)`, tone: 'late', Icon: TriangleAlert };
    case 'resolved-on-time':
      return { text: 'Resolved on time', tone: 'ok', Icon: CircleCheck };
    default:
      return null;
  }
}

/** A small badge: countdown / "Overdue by …" / "Resolved late" / "Resolved on time". Renders nothing without a deadline. */
export function DueBadge({ thread, now }: { thread: DueFields; now: number }) {
  const state = dueState(thread, now);
  const l = label(state);
  if (!l) return null;
  const c = COLORS[l.tone];
  return (
    <View style={[st.badge, { backgroundColor: c.bg }]}>
      <l.Icon size={11} color={c.fg} />
      <Text style={[st.badgeText, { color: c.fg }]} numberOfLines={1}>
        {l.text}
      </Text>
    </View>
  );
}

/** A full-width strip under the thread header with the same information, plus the deadline time. */
export function DueBanner({ thread, now }: { thread: DueFields; now: number }) {
  const state = dueState(thread, now);
  const l = label(state);
  if (!l || state.kind === 'none') return null;
  const c = COLORS[l.tone];
  const sub =
    state.kind === 'overdue'
      ? `Was due ${formatTime(state.due)} — not resolved yet`
      : state.kind === 'resolved-late'
        ? `Was due ${formatTime(state.due)} — closed after the deadline`
        : state.kind === 'resolved-on-time'
          ? `Due ${formatTime(state.due)}`
          : '';
  return (
    <View style={[st.banner, { backgroundColor: c.bg }]}>
      <l.Icon size={15} color={c.fg} />
      <Text style={[st.bannerText, { color: c.fg }]} numberOfLines={2}>
        {l.text}
        {sub ? ` — ${sub}` : ''}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
    maxWidth: '100%',
  },
  badgeText: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  bannerText: { flex: 1, fontSize: 12.5, fontWeight: '800' },
});
