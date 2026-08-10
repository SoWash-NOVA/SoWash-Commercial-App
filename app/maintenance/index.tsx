// app/maintenance/index.tsx
//
// Maintenance tasks — the contractual checklist work, separate from cleaning
// visits and on a separate table.
//
// NO SITE SWITCHER HERE, deliberately. maintenance_schedules has no site
// column; it is scoped to the client and a task template. The endpoint does
// return a site_name, but it comes from a LATERAL that picks the client's
// alphabetically-first site, so for a multi-site client every row would show
// the same wrong address. Showing a site filter over that would be worse than
// showing no site at all — it would look like it worked.

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Images,
  Info,
  User,
  Wrench,
} from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useMaintenance, useMaintenanceStats, formatDateOnly, relativeDay, statusMeta } from '../../src/hooks';
import { MaintenanceJob } from '../../src/api/types';

const FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'completed', label: 'DONE' },
  { key: 'scheduled', label: 'BOOKED' },
];

export default function MaintenanceScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const [status, setStatus] = useState('all');

  const { data, loading, error, refreshing, refresh } = useMaintenance({ status });
  const stats = useMaintenanceStats();

  const jobs = data?.jobs ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Maintenance</Text>
      </View>

      <View style={local.header}>
        <View style={local.kpiRow}>
          <Kpi label="TOTAL" value={stats.data?.total} color={palette.ink} />
          <View style={local.kpiDivider} />
          <Kpi label="DONE" value={stats.data?.completed} color={palette.good} />
          <View style={local.kpiDivider} />
          <Kpi label="ACTIVE" value={stats.data?.inProgress} color={palette.warn} />
          <View style={local.kpiDivider} />
          <Kpi label="BOOKED" value={stats.data?.scheduled} color={accent} />
        </View>

        <View style={[styles.tabRow, { marginTop: 12, marginBottom: 0 }]}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setStatus(f.key)}
              style={[styles.tab, status === f.key && styles.tabActive]}
            >
              <Text style={[styles.tabText, status === f.key && styles.tabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && !data ? (
        <View style={local.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => String(j.id)}
          contentContainerStyle={local.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
          }
          renderItem={({ item }) => <MaintenanceCard job={item} />}
          ListHeaderComponent={
            jobs.length > 0 ? (
              <View style={local.notice}>
                <Info size={13} color={palette.muted} />
                <Text style={local.noticeText}>
                  Maintenance is tracked against your contract, not per site.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={local.empty}>
              {error ? (
                <CircleAlert size={24} color={palette.danger} />
              ) : (
                <Wrench size={24} color={palette.mutedLight} />
              )}
              <Text style={local.emptyTitle}>
                {error ? 'Could not load maintenance' : 'No maintenance tasks'}
              </Text>
              <Text style={local.emptyBody}>
                {error || 'Scheduled maintenance for your contract will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function MaintenanceCard({ job }: { job: MaintenanceJob }) {
  const router = useRouter();
  const meta = statusMeta(job.status);
  const when = relativeDay(job.scheduled_date);
  const photos = [job.before_photo_url, job.after_photo_url].filter(Boolean).length;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/maintenance/${job.id}`)}
      style={local.card}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={local.task} numberOfLines={2}>
            {job.task_name || 'Maintenance task'}
          </Text>
          <View style={local.metaRow}>
            <CalendarDays size={12} color={palette.mutedLight} />
            <Text style={local.meta}>{formatDateOnly(job.scheduled_date)}</Text>
            {when ? <Text style={local.metaSoft}>· {when}</Text> : null}
          </View>
        </View>
        <View style={[local.pill, { backgroundColor: meta.bg }]}>
          <Text style={[local.pillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={local.footer}>
        <View style={local.badges}>
          {job.team_lead_name ? (
            <View style={local.badge}>
              <User size={11} color={palette.muted} />
              <Text style={local.badgeText} numberOfLines={1}>
                {job.team_lead_name}
              </Text>
            </View>
          ) : null}
          {photos > 0 ? (
            <View style={local.badge}>
              <Images size={11} color={palette.muted} />
              <Text style={local.badgeText}>
                {photos} photo{photos === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
          {job.service_number ? (
            <Text style={local.badgeText}>Service #{job.service_number}</Text>
          ) : null}
        </View>
        <ChevronRight size={16} color={palette.mutedLight} />
      </View>
    </TouchableOpacity>
  );
}

function Kpi({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <View style={local.kpi}>
      <Text style={local.kpiLabel}>{label}</Text>
      <Text style={[local.kpiValue, { color }]}>{value ?? '—'}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    paddingVertical: 14,
  },
  kpi: { flex: 1, alignItems: 'center' },
  kpiLabel: { fontSize: 9, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.8 },
  kpiValue: { fontSize: 22, fontWeight: '900', marginTop: 3 },
  kpiDivider: { width: 1, height: 28, backgroundColor: palette.borderSubtle },
  list: { paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 11.5, color: palette.mutedLight, fontWeight: '600' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 10,
  },
  task: { fontSize: 15, fontWeight: '800', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  meta: { fontSize: 12, fontWeight: '700', color: palette.muted },
  metaSoft: { fontSize: 12, fontWeight: '600', color: palette.mutedLight },
  pill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  pillText: { fontSize: 10, fontWeight: '800' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
    paddingTop: 10,
  },
  badges: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', color: palette.muted, maxWidth: 130 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});
