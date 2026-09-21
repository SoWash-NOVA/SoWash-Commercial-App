// app/documentation/tbt.tsx
//
// TBT (toolbox talk) photos — one card per completed job, newest first, each
// showing all of that visit's TBT photos together in one horizontal strip
// (mirrors JobDetailBody.tsx's PhotoStrip). A job's several TBT photos are
// one visit's toolbox talk, not separate list rows.
//
// Backend: GET /customer-portal/documentation/tbt (see useTbtPhotos), which
// reads field_service_reports.temp_voltage_photos — TBT already had a real
// capture pipeline before this feature existed, this screen only reads it.
//
// NO SITE SWITCHER HERE, deliberately — see the note at the top of
// documentation/site-sld.tsx. This is a root-level screen, outside
// SiteProvider. Every card shows its own site name instead.

import React from 'react';
import { View, Text, Image, FlatList, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, CircleAlert, Megaphone } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useTbtPhotos, formatDateOnly, formatDateTime } from '../../src/hooks';
import { photoUrl } from '../../src/api/client';
import { TbtJob } from '../../src/api/types';

export default function TbtScreen() {
  const router = useRouter();
  const { accent } = useAccent();

  const { data, loading, error, refreshing, refresh } = useTbtPhotos();
  const jobs = data?.jobs ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/documentation' as never))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>TBT</Text>
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
          renderItem={({ item }) => <TbtJobCard job={item} />}
          ListEmptyComponent={
            <View style={local.empty}>
              {error ? (
                <CircleAlert size={24} color={palette.danger} />
              ) : (
                <Megaphone size={24} color={palette.mutedLight} />
              )}
              <Text style={local.emptyTitle}>{error ? 'Could not load TBT photos' : 'No TBT photos yet'}</Text>
              <Text style={local.emptyBody}>
                {error || "Toolbox talk photos from your team's completed visits will appear here."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function TbtJobCard({ job }: { job: TbtJob }) {
  return (
    <View style={local.card}>
      <View style={local.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={local.site} numberOfLines={1}>
            {job.site_name || 'Site'}
          </Text>
          <View style={local.metaRow}>
            <CalendarDays size={12} color={palette.mutedLight} />
            <Text style={local.meta}>
              {job.scheduled_date ? formatDateOnly(job.scheduled_date) : '—'}
              {job.service_number ? ` · Service #${job.service_number}` : ''}
            </Text>
          </View>
        </View>
        <Text style={local.count}>
          {job.photos.length} photo{job.photos.length === 1 ? '' : 's'}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.strip}>
        {job.photos.map((p) => {
          const uri = photoUrl(p.photo_url);
          return (
            <View key={p.id} style={local.thumbWrap}>
              {uri ? (
                <Image source={{ uri }} style={local.thumb} resizeMode="cover" />
              ) : (
                <View style={[local.thumb, local.thumbPlaceholder]}>
                  <Megaphone size={18} color={palette.mutedLight} />
                </View>
              )}
              <Text style={local.thumbTime} numberOfLines={1}>
                {formatDateTime(p.captured_at)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  site: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  meta: { fontSize: 12, fontWeight: '700', color: palette.muted },
  count: { fontSize: 11, fontWeight: '700', color: palette.mutedLight },
  strip: { gap: 10, marginTop: 12 },
  thumbWrap: { width: 84 },
  thumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: '#f1f5f9' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbTime: { fontSize: 9.5, fontWeight: '600', color: palette.mutedLight, marginTop: 4, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});
