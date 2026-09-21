// app/documentation/site-sld.tsx
//
// "Site SLD" under Documentation. Deliberately NOT a new backend call: the
// only SLD endpoint this app can reach is per-visit
// (GET /customer-portal/sld/:schedule_id, see useSldWalkthrough in hooks.ts) —
// there is no site-scoped equivalent reachable with the portal JWT (the
// staff-only /api/commercial-sld/diagrams/site/:siteId 403s any token with a
// `kind` claim, see middleware/auth.js). So this screen just lists the
// completed visits that have a walkthrough (has_sld_walkthrough, from
// /history) and opens the exact same /walkthrough/[id] route job/[id].tsx
// already uses.
//
// NO SITE SWITCHER HERE, deliberately, same reasoning as maintenance/index.tsx:
// this is a root-level stack screen (a sibling of /maintenance, outside the
// (tabs) group), and SiteProvider only wraps (tabs) — it needs a session and
// nothing outside the signed-in tab area uses it (see site-context.tsx /
// (tabs)/_layout.tsx). useSiteContext() would throw here. Every row shows its
// own site name instead.

import React from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Footprints, MapPin } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useJobs, formatDateOnly, relativeDay } from '../../src/hooks';
import { JobSummary } from '../../src/api/types';

export default function SiteSldScreen() {
  const router = useRouter();
  const { accent } = useAccent();

  const { data, loading, error, refreshing, refresh } = useJobs({
    scope: 'past',
    limit: 100,
  });

  const jobs = (data?.jobs ?? []).filter((j) => j.has_sld_walkthrough);

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/documentation' as never))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Site SLD</Text>
      </View>

      {loading && !data ? (
        <View style={local.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => String(j.schedule_id)}
          contentContainerStyle={local.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />}
          renderItem={({ item }) => <SldRow job={item} accent={accent} />}
          ListEmptyComponent={
            <View style={local.empty}>
              {error ? (
                <CircleAlert size={24} color={palette.danger} />
              ) : (
                <Footprints size={24} color={palette.mutedLight} />
              )}
              <Text style={local.emptyTitle}>
                {error ? 'Could not load site SLD' : 'No SLD walkthrough yet'}
              </Text>
              <Text style={local.emptyBody}>
                {error || 'A completed visit with a captured walkthrough will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function SldRow({ job, accent }: { job: JobSummary; accent: string }) {
  const router = useRouter();
  const when = relativeDay(job.scheduled_date);

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/walkthrough/[id]', params: { id: String(job.schedule_id) } })}
      style={local.card}
      activeOpacity={0.9}
    >
      <View style={[local.icon, { backgroundColor: `${accent}14` }]}>
        <Footprints size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={local.site} numberOfLines={1}>
          {job.site_name || 'Site'}
        </Text>
        <View style={local.metaRow}>
          <CalendarDays size={12} color={palette.mutedLight} />
          <Text style={local.meta}>{formatDateOnly(job.scheduled_date)}</Text>
          {when ? <Text style={local.metaSoft}>· {when}</Text> : null}
        </View>
        {job.address ? (
          <View style={local.metaRow}>
            <MapPin size={12} color={palette.mutedLight} />
            <Text style={local.metaSoft} numberOfLines={1}>
              {[job.address, job.city].filter(Boolean).join(', ')}
            </Text>
          </View>
        ) : null}
      </View>
      <ChevronRight size={18} color={palette.mutedLight} />
    </TouchableOpacity>
  );
}

const local = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 10,
  },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  site: { fontSize: 15, fontWeight: '800', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { fontSize: 12, fontWeight: '700', color: palette.muted },
  metaSoft: { fontSize: 12, fontWeight: '600', color: palette.mutedLight },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});
