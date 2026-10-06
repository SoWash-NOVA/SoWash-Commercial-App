// app/staff/index.tsx — Office Overview.
//
// Org-wide KPI tiles (GET /schedule/stats — no client scoping, by design,
// same as the client app's own useStats()) plus a short recent-activity list
// reusing useStaffJobs with no filter. Tapping a recent job or "See all"
// jumps to the Jobs tab; a tapped job also becomes the Jobs tab's initial
// filter via src/staff-context.tsx so the tap feels like it went somewhere
// specific, not just "here's the same list again".
//
// The KPI tiles default to THIS calendar month (period='month', resets on
// the 1st — not a rolling 30 days) with a pill row to switch to Last month /
// This year / All time. Only this screen defaults to 'month' — useStaffStats
// itself just forwards whatever period it's given, and GET /schedule/stats
// still defaults to all-time when no period is sent at all, which is what
// keeps sowash-frontend's existing (unscoped) caller unaffected.
//
// Look (2026-10-05 redesign, same language as the client Overview): a gradient
// summary hero in the logo's blue→aqua carrying the period switch, the period's
// total and a completion bar; four count tiles; and the recent-activity list with date tiles and
// status pills. Fixed brand colours, not the user-selectable accent.

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock,
  RotateCcw,
} from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useStaffStats, useStaffJobs, formatDateOnly, relativeDay, statusMeta, StaffStatsPeriod } from '../../src/hooks';
import { useAuth } from '../../src/auth/AuthContext';
import { useStaffScope } from '../../src/staff-context';
import PageHeader from '../../src/components/PageHeader';
import FadeInRow from '../../src/components/FadeInRow';
import { keep, tc } from '../../src/themeEngine';

const RECENT_COUNT = 6;

const PERIODS: { key: StaffStatsPeriod; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

/* Brand-harmonious colours, the same set as the client Overview. */
const C = {
  blue: '#1C9BE0',
  blueSoft: '#E6F5FD',
  green: '#3E9F00',
  greenSoft: '#EEFAE0',
  teal: '#0E9F9A',
  tealSoft: '#E0F6F4',
  amber: '#E08E0B',
  amberSoft: '#FDF1DA',
  coral: '#E5484D',
  coralSoft: '#FDE8E8',
};

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "2026-10-07" → { day: '7', month: 'OCT' } from the string parts (never through a Date — see CLAUDE.md §3). */
function dateParts(value: string | null | undefined): { day: string; month: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return { day: String(parseInt(m[3], 10)), month: months[parseInt(m[2], 10) - 1] };
}

export default function StaffOverviewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { setSelectedClientId } = useStaffScope();
  const [period, setPeriod] = useState<StaffStatsPeriod>('month');
  const stats = useStaffStats(period);
  const jobs = useStaffJobs({});

  const recent = useMemo(() => (jobs.data?.jobs ?? []).slice(0, RECENT_COUNT), [jobs.data]);

  const loading = (stats.loading && !stats.data) || (jobs.loading && !jobs.data);
  const refreshing = stats.refreshing || jobs.refreshing;

  const onRefresh = async () => {
    await Promise.all([stats.refresh(), jobs.refresh()]);
  };

  if (loading) {
    return (
      <View style={[s.screen, s.centre]}>
        <ActivityIndicator size="large" color={C.blue} />
      </View>
    );
  }

  const total = stats.data?.total ?? 0;
  const done = stats.data?.completed ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? '';

  const tiles = [
    { label: 'Scheduled', value: stats.data?.scheduled ?? 0, Icon: CalendarDays, colors: [C.blueSoft, C.blueSoft] as [string, string], tint: C.blueSoft },
    { label: 'In progress', value: stats.data?.inProgress ?? 0, Icon: Clock, colors: [C.blueSoft, C.blueSoft] as [string, string], tint: C.amberSoft },
    { label: 'Completed', value: stats.data?.completed ?? 0, Icon: CircleCheck, colors: [C.blueSoft, C.blueSoft] as [string, string], tint: C.greenSoft },
    { label: 'Rescheduled', value: stats.data?.rescheduled ?? 0, Icon: RotateCcw, colors: [C.blueSoft, C.blueSoft] as [string, string], tint: C.coralSoft },
  ];

  return (
    <View style={s.screen}>

      <PageHeader
        title={`${greeting()}${user?.firstName ? `, ${user.firstName}` : ''}`}
        subtitle="Here's what's happening across every client."
      />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
      >
        {/* ── Summary hero: period switch + total + completion ─────── */}
        <FadeInRow index={0}>
          <View style={s.heroShadow}>
            <LinearGradient
              colors={['#1689CC', '#2EAEE8']}
              locations={[0, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.hero}
            >
              <View pointerEvents="none" style={[s.ring, { width: 220, height: 220, top: -96, right: -70 }]} />
              <View pointerEvents="none" style={[s.ring, { width: 140, height: 140, top: -46, right: -22 }]} />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodRow}>
                {PERIODS.map((p) => {
                  const active = p.key === period;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => setPeriod(p.key)}
                      style={[s.periodPill, active && s.periodPillActive]}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.periodPillText, active && s.periodPillTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={s.heroLabel}>Total visits · {periodLabel.toLowerCase()}</Text>
              <Text style={s.heroValue}>{stats.data ? total : '—'}</Text>

              <View style={s.heroProgressRow}>
                <Text style={s.heroProgressText}>
                  {done} completed
                </Text>
                <Text style={s.heroProgressPct}>{pct}%</Text>
              </View>
              <View style={s.heroTrack}>
                <View style={[s.heroFill, { width: `${Math.max(pct, done > 0 ? 4 : 0)}%` }]} />
              </View>
            </LinearGradient>
          </View>
        </FadeInRow>

        {/* ── Counts ──────────────────────────────────────────────── */}
        <FadeInRow index={1}>
          <View style={s.tileGrid}>
            {tiles.map((t) => (
              <View key={t.label} style={s.tile}>
                <View style={s.tileTop}>
                  <LinearGradient colors={[tc(t.colors[0]), tc(t.colors[1])]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.tileIcon}>
                    <t.Icon size={18} color={C.blue} />
                  </LinearGradient>
                </View>
                <Text style={s.tileValue}>{t.value}</Text>
                <Text style={s.tileLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
        </FadeInRow>

        {/* ── Recent activity ─────────────────────────────────────── */}
        <FadeInRow index={2}>
          <SectionHead title="Recent activity" action="See all" onAction={() => router.push('/staff/jobs')} />

          {recent.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIcon}>
                <ClipboardList size={20} color={C.blue} />
              </View>
              <Text style={s.emptyText}>Nothing scheduled yet.</Text>
            </View>
          ) : (
            <View style={s.listCard}>
              {recent.map((job, i) => {
                const meta = statusMeta(job.status);
                const p = dateParts(job.scheduled_date);
                return (
                  <TouchableOpacity
                    key={job.schedule_id}
                    style={[s.row, i > 0 && s.rowBorder]}
                    activeOpacity={0.85}
                    onPress={() => {
                      // Jobs tab (Phase 3 rework) is a client drill-down, not a
                      // flat list — land directly on this job's client instead
                      // of the client index, so the tap goes somewhere specific.
                      setSelectedClientId(job.client_id);
                      router.push('/staff/jobs');
                    }}
                  >
                    <LinearGradient colors={[tc(C.blueSoft), tc(C.blueSoft)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.dateTile}>
                      <Text style={s.dateDay}>{p?.day ?? '—'}</Text>
                      <Text style={s.dateMonth}>{p?.month ?? ''}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>
                        {job.site_name || 'Site'}
                      </Text>
                      <Text style={s.rowSub} numberOfLines={1}>
                        {job.client_name || '—'} · {relativeDay(job.scheduled_date) || formatDateOnly(job.scheduled_date)}
                      </Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
                      <View style={[s.statusDot, { backgroundColor: meta.color }]} />
                      <Text style={[s.statusText, { color: meta.color }]} numberOfLines={1}>
                        {meta.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </FadeInRow>
      </ScrollView>
    </View>
  );
}

/** Section title: a small blue→lime bar, the title, and an optional link on the right. */
function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionHead}>
      <LinearGradient colors={[C.blue, C.blue]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} style={s.sectionAction}>
          <Text style={s.sectionActionText}>{action}</Text>
          <ChevronRight size={14} color={C.blue} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}


const CARD_SHADOW = {
  shadowColor: '#0b2a3a',
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FA' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.6 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 140 },

  // hero
  heroShadow: {
    borderRadius: 26,
    shadowColor: '#1C9BE0',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  hero: { borderRadius: 26, paddingVertical: 16, paddingHorizontal: 18, overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  periodRow: { gap: 6, paddingRight: 4 },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  // white on the blue hero in both themes
  periodPillActive: { backgroundColor: keep('#fff'), borderColor: keep('#fff') },
  periodPillText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  periodPillTextActive: { color: C.blue },
  heroLabel: { marginTop: 18, color: 'rgba(255,255,255,0.95)', fontSize: 12.5, fontWeight: '700' },
  heroValue: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
    marginTop: 2,
    textShadowColor: 'rgba(8,60,95,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroProgressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  heroProgressText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  heroProgressPct: { color: '#fff', fontSize: 14, fontWeight: '900' },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)', marginTop: 8, overflow: 'hidden' },
  heroFill: { height: 8, borderRadius: 4, backgroundColor: keep('#fff') }, // white on the blue hero in both themes

  // tiles
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 15,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  tileBlob: { position: 'absolute', width: 96, height: 96, borderRadius: 48, top: -36, right: -30 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 28, fontWeight: '900', color: palette.ink, marginTop: 14 },
  tileLabel: { fontSize: 12, fontWeight: '700', color: palette.muted, marginTop: 1 },

  // sections
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  sectionBar: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: palette.ink, letterSpacing: -0.1 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { fontSize: 12.5, fontWeight: '800', color: C.blue },

  // recent activity
  listCard: { backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 14, ...CARD_SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#EEF3F7' },
  dateTile: { width: 46, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 17, fontWeight: '900', color: C.blue, lineHeight: 20 },
  dateMonth: { fontSize: 9.5, fontWeight: '900', color: palette.muted, letterSpacing: 0.8 },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  rowSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: 110,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },

  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 28, backgroundColor: '#fff', borderRadius: 22, ...CARD_SHADOW },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, color: palette.muted, fontWeight: '700' },
});
