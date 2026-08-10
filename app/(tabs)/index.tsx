// app/(tabs)/index.tsx
//
// Overview. Three questions, in the order a site manager asks them: what is
// coming, how is the account doing overall, and what happened recently.
//
// The KPI row is deliberately labelled "across all sites" — /stats takes no
// site_id, so it does not narrow with the switcher. Letting those numbers sit
// unlabelled above a site-filtered list is exactly how the web portal ended up
// claiming 219 completed jobs over a list of 30.

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, CalendarCheck, CircleAlert, Inbox, Wrench } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useAuth } from '../../src/auth/AuthContext';
import { useSiteContext } from '../../src/site-context';
import { useJobs, useStats, formatDateOnly, relativeDay } from '../../src/hooks';
import { SiteSwitcher } from '../../src/components/SiteSwitcher';
import { JobCard } from '../../src/components/JobCard';

export default function OverviewScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { clientName, user } = useAuth();
  const { selectedSiteId, selectedSite } = useSiteContext();

  const stats = useStats();
  const upcoming = useJobs({ scope: 'upcoming', siteId: selectedSiteId, limit: 5 });
  const past = useJobs({ scope: 'past', siteId: selectedSiteId, limit: 5 });

  const refreshing = stats.refreshing || upcoming.refreshing || past.refreshing;
  const onRefresh = async () => {
    await Promise.all([stats.refresh(), upcoming.refresh(), past.refresh()]);
  };

  const nextJob = upcoming.data?.jobs?.[0] ?? null;
  const recent = past.data?.jobs ?? [];
  const firstLoad = stats.loading && !stats.data && past.loading && !past.data;

  if (firstLoad) {
    return (
      <View style={[styles.screen, local.centre]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
      >
        <Text style={local.greeting}>
          {user?.firstName ? `Hello, ${user.firstName}` : 'Welcome back'}
        </Text>
        <Text style={local.client} numberOfLines={2}>
          {clientName || 'Your account'}
        </Text>

        <View style={{ marginTop: 14, marginBottom: 18 }}>
          <SiteSwitcher />
        </View>

        {/* ── Next visit ─────────────────────────────────────────────── */}
        <Text style={local.section}>NEXT VISIT</Text>
        {upcoming.loading && !upcoming.data ? (
          <SkeletonCard />
        ) : nextJob ? (
          <TouchableOpacity
            onPress={() => router.push(`/job/${nextJob.schedule_id}`)}
            style={[local.hero, { backgroundColor: accent }]}
          >
            <View style={local.heroTop}>
              <CalendarCheck size={20} color="#fff" />
              <Text style={local.heroWhen}>{relativeDay(nextJob.scheduled_date) || 'Scheduled'}</Text>
            </View>
            <Text style={local.heroDate}>{formatDateOnly(nextJob.scheduled_date)}</Text>
            <Text style={local.heroSite} numberOfLines={1}>
              {nextJob.site_name || 'Site'}
            </Text>
            <View style={local.heroFooter}>
              <Text style={local.heroLink}>View details</Text>
              <ArrowRight size={15} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : (
          <Empty
            icon={<Inbox size={22} color={palette.mutedLight} />}
            title="Nothing scheduled"
            body={
              selectedSite
                ? `No upcoming visits booked for ${selectedSite.site_name}.`
                : 'No upcoming visits are booked yet.'
            }
          />
        )}

        {/* ── Counts ─────────────────────────────────────────────────── */}
        <Text style={local.section}>ACROSS ALL SITES</Text>
        {stats.error && !stats.data ? (
          <Empty
            icon={<CircleAlert size={22} color={palette.danger} />}
            title="Could not load totals"
            body={stats.error}
          />
        ) : (
          <View style={local.kpiRow}>
            <Kpi label="TOTAL" value={stats.data?.total} color={palette.ink} />
            <Kpi label="DONE" value={stats.data?.completed} color={palette.good} />
            <Kpi label="ACTIVE" value={stats.data?.inProgress} color={palette.warn} />
            <Kpi label="BOOKED" value={stats.data?.scheduled} color={accent} last />
          </View>
        )}

        {/* Maintenance lives on its own table with no site column, so it is a
            separate destination rather than another filter on this screen. */}
        <TouchableOpacity onPress={() => router.push('/maintenance')} style={local.linkTile}>
          <View style={[local.linkIcon, { backgroundColor: `${accent}18` }]}>
            <Wrench size={17} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={local.linkTitle}>Maintenance</Text>
            <Text style={local.linkSub}>Contract tasks and checklists</Text>
          </View>
          <ArrowRight size={16} color={palette.mutedLight} />
        </TouchableOpacity>

        {/* ── Recent ─────────────────────────────────────────────────── */}
        <View style={local.sectionRow}>
          <Text style={[local.section, { marginTop: 0 }]}>RECENT VISITS</Text>
          <TouchableOpacity onPress={() => router.push('/jobs')} hitSlop={8}>
            <Text style={[local.seeAll, { color: accent }]}>See all</Text>
          </TouchableOpacity>
        </View>

        {past.loading && !past.data ? (
          <SkeletonCard />
        ) : recent.length > 0 ? (
          recent.map((job) => <JobCard key={job.schedule_id} job={job} showSite={!selectedSite} />)
        ) : (
          <Empty
            icon={<Inbox size={22} color={palette.mutedLight} />}
            title="No visits yet"
            body={
              past.error ||
              (selectedSite
                ? `No completed visits recorded for ${selectedSite.site_name}.`
                : 'Once a cleaning is completed and approved it appears here.')
            }
          />
        )}
      </ScrollView>
    </View>
  );
}

function Kpi({
  label,
  value,
  color,
  last,
}: {
  label: string;
  value: number | undefined;
  color: string;
  last?: boolean;
}) {
  return (
    <>
      <View style={local.kpi}>
        <Text style={local.kpiLabel}>{label}</Text>
        <Text style={[local.kpiValue, { color }]}>{value ?? '—'}</Text>
      </View>
      {!last ? <View style={local.kpiDivider} /> : null}
    </>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string | null;
}) {
  return (
    <View style={local.empty}>
      {icon}
      <Text style={local.emptyTitle}>{title}</Text>
      {body ? <Text style={local.emptyBody}>{body}</Text> : null}
    </View>
  );
}

function SkeletonCard() {
  return <View style={local.skeleton} />;
}

const local = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 13, fontWeight: '700', color: palette.mutedLight },
  client: { fontSize: 24, fontWeight: '900', color: palette.ink, marginTop: 2 },
  section: {
    fontSize: 11,
    fontWeight: '800',
    color: palette.mutedLight,
    letterSpacing: 1,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  seeAll: { fontSize: 12, fontWeight: '800' },
  hero: { borderRadius: 24, padding: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heroWhen: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  heroDate: { color: '#fff', fontSize: 26, fontWeight: '900' },
  heroSite: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '700', marginTop: 4 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  heroLink: { color: '#fff', fontSize: 13, fontWeight: '800' },
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
  empty: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: 2 },
  emptyBody: { fontSize: 12.5, lineHeight: 18, color: palette.mutedLight, textAlign: 'center' },
  linkTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    padding: 14,
    marginTop: 12,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  linkSub: { fontSize: 12, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },
  skeleton: {
    height: 96,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
});
