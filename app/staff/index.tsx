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

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, CircleCheck, ClipboardList, Clock, RotateCcw } from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useStaffStats, useStaffJobs, formatDateOnly, statusMeta, StaffStatsPeriod } from '../../src/hooks';
import { useAuth } from '../../src/auth/AuthContext';
import { useStaffScope } from '../../src/staff-context';
import PageHeader from '../../src/components/PageHeader';

const RECENT_COUNT = 6;

const PERIODS: { key: StaffStatsPeriod; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

export default function StaffOverviewScreen() {
  const router = useRouter();
  const { accent } = useAccent();
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
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  const tiles = [
    { label: 'Scheduled', value: stats.data?.scheduled ?? 0, Icon: CalendarDays, color: '#38BDF8' },
    { label: 'In progress', value: stats.data?.inProgress ?? 0, Icon: Clock, color: '#F59E0B' },
    { label: 'Completed', value: stats.data?.completed ?? 0, Icon: CircleCheck, color: '#22C55E' },
    { label: 'Rescheduled', value: stats.data?.rescheduled ?? 0, Icon: RotateCcw, color: '#F87171' },
  ];

  return (
    <View style={s.screen}>
      <PageHeader
        title={`Hi${user?.firstName ? `, ${user.firstName}` : ''}`}
        subtitle="Here's what's happening across every client."
      />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        <View style={s.periodRow}>
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPeriod(p.key)}
                style={[s.periodPill, active && { backgroundColor: accent }]}
                activeOpacity={0.8}
              >
                <Text style={[s.periodPillText, active && { color: '#fff' }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.tileGrid}>
          {tiles.map((t) => (
            <View key={t.label} style={s.tile}>
              <View style={[s.tileIcon, { backgroundColor: `${t.color}18` }]}>
                <t.Icon size={16} color={t.color} />
              </View>
              <Text style={s.tileValue}>{t.value}</Text>
              <Text style={s.tileLabel}>{t.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Recent activity</Text>
          <TouchableOpacity onPress={() => router.push('/staff/jobs')}>
            <Text style={[s.seeAll, { color: accent }]}>See all</Text>
          </TouchableOpacity>
        </View>

        {recent.length === 0 ? (
          <View style={s.emptyCard}>
            <ClipboardList size={20} color={palette.mutedLight} />
            <Text style={s.emptyText}>Nothing scheduled yet.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {recent.map((job) => {
              const meta = statusMeta(job.status);
              return (
                <TouchableOpacity
                  key={job.schedule_id}
                  style={s.row}
                  activeOpacity={0.85}
                  onPress={() => {
                    // Jobs tab (Phase 3 rework) is a client drill-down, not a
                    // flat list — land directly on this job's client instead
                    // of the client index, so the tap goes somewhere specific.
                    setSelectedClientId(job.client_id);
                    router.push('/staff/jobs');
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {job.site_name || 'Site'}
                    </Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      {job.client_name || '—'} · {formatDateOnly(job.scheduled_date)}
                    </Text>
                  </View>
                  <View style={[s.rowDot, { backgroundColor: meta.color }]} />
                  <Text style={[s.rowStatus, { color: meta.color }]}>{meta.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingBottom: 140 },

  greeting: { fontSize: 24, fontWeight: '900', color: palette.ink },
  sub: { fontSize: 13, fontWeight: '600', color: palette.mutedLight, marginTop: 3, marginBottom: 16 },

  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  periodPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  periodPillText: { fontSize: 12, fontWeight: '800', color: palette.muted },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 26 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileValue: { fontSize: 22, fontWeight: '900', color: palette.ink },
  tileLabel: { fontSize: 11.5, fontWeight: '700', color: palette.muted, marginTop: 2 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: palette.ink },
  seeAll: { fontSize: 12.5, fontWeight: '800' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  rowTitle: { fontSize: 13.5, fontWeight: '800', color: palette.ink },
  rowSub: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },
  rowDot: { width: 6, height: 6, borderRadius: 3 },
  rowStatus: { fontSize: 10.5, fontWeight: '800' },

  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  emptyText: { fontSize: 13, color: palette.muted, fontWeight: '600' },
});
