// app/documentation/safety-training.tsx
//
// Safety Training photos — client/site-wide, not tied to a specific visit.
// Uploaded from the staff web portal (routes/ciDocumentationRoutes.js); this
// screen only reads (GET /customer-portal/documentation/safety-training, see
// useSafetyTrainingPhotos).
//
// NO SITE SWITCHER HERE, deliberately — see the note at the top of
// documentation/site-sld.tsx. This is a root-level screen, outside
// SiteProvider. Every card shows its own site name instead.

import React from 'react';
import { View, Text, Image, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, CircleAlert, ShieldCheck } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useSafetyTrainingPhotos, formatDateTime } from '../../src/hooks';
import { photoUrl } from '../../src/api/client';
import { SafetyTrainingPhoto } from '../../src/api/types';

export default function SafetyTrainingScreen() {
  const router = useRouter();
  const { accent } = useAccent();

  const { data, loading, error, refreshing, refresh } = useSafetyTrainingPhotos();
  const photos = data?.photos ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/documentation' as never))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Safety Training</Text>
      </View>

      {loading && !data ? (
        <View style={local.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={local.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />}
          renderItem={({ item }) => <SafetyCard photo={item} />}
          ListEmptyComponent={
            <View style={local.empty}>
              {error ? (
                <CircleAlert size={24} color={palette.danger} />
              ) : (
                <ShieldCheck size={24} color={palette.mutedLight} />
              )}
              <Text style={local.emptyTitle}>
                {error ? 'Could not load safety training photos' : 'No safety training photos yet'}
              </Text>
              <Text style={local.emptyBody}>
                {error || 'Safety training photos your team uploads will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function SafetyCard({ photo }: { photo: SafetyTrainingPhoto }) {
  const uri = photoUrl(photo.photo_url);

  return (
    <View style={local.card}>
      {uri ? (
        <Image source={{ uri }} style={local.thumb} resizeMode="cover" />
      ) : (
        <View style={[local.thumb, local.thumbPlaceholder]}>
          <ShieldCheck size={20} color={palette.mutedLight} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={local.site} numberOfLines={1}>
          {photo.site_name || 'All Sites'}
        </Text>
        <Text style={local.metaSoft}>{formatDateTime(photo.captured_at)}</Text>
      </View>
    </View>
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
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#f1f5f9' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  site: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  metaSoft: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight, marginTop: 3 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});
