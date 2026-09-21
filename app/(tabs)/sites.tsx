// app/(tabs)/sites.tsx
//
// The client's estate. Tapping a site sets it as the active filter and drops
// the user on the Visits tab — which is the only reason most people open this
// screen, so it should not take three taps.
//
// Visual language matches the rest of the app: light wash background,
// ambient colour blobs, white shadowed cards.

import React from 'react';
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
import { Building2, Check, CircleAlert, Gauge, MapPin, Ruler, Zap } from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useSiteContext, siteLocation } from '../../src/site-context';
import { formatSystemSize } from '../../src/hooks';
import { Site } from '../../src/api/types';

const TINTS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#14b8a6'];

function initial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export default function SitesScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { sites, selectedSiteId, setSelectedSiteId, loading, error, refresh } = useSiteContext();

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const open = (site: Site) => {
    setSelectedSiteId(site.id);
    router.push('/jobs');
  };

  if (loading && sites.length === 0) {
    return (
      <View style={[s.screen, s.centre]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View pointerEvents="none" style={s.wash}>
        <View style={[s.blob, { backgroundColor: '#dbeafe', top: -90, left: -70, width: 260, height: 260 }]} />
        <View style={[s.blob, { backgroundColor: '#fce7f3', top: 260, right: -100, width: 260, height: 260 }]} />
      </View>

      <FlatList
        data={sites}
        keyExtractor={(item) => String(item.id)}
        style={{ flex: 1 }}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.title}>Sites</Text>
            <Text style={s.subtitle}>
              {sites.length === 0
                ? 'No sites on this account'
                : `${sites.length} site${sites.length === 1 ? '' : 's'} on this account`}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const active = item.id === selectedSiteId;
          const name = item.site_name || `Site #${item.id}`;
          const tint = colorFor(name);

          return (
            <TouchableOpacity
              onPress={() => open(item)}
              activeOpacity={0.9}
              style={[s.card, active && { borderColor: accent, borderWidth: 1.5 }]}
            >
              <View style={s.row}>
                <View style={[s.avatar, { backgroundColor: active ? accent : tint }]}>
                  {active ? <Check size={19} color="#fff" /> : <Text style={s.avatarText}>{initial(name)}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {name}
                  </Text>
                  {siteLocation(item) ? (
                    <View style={s.metaRow}>
                      <MapPin size={11} color={palette.mutedLight} />
                      <Text style={s.meta} numberOfLines={1}>
                        {siteLocation(item)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {active ? (
                  <View style={[s.activePill, { backgroundColor: `${accent}16` }]}>
                    <Text style={[s.activePillText, { color: accent }]}>Selected</Text>
                  </View>
                ) : null}
              </View>

              <View style={s.footer}>
                <Fact icon={<Ruler size={12} color={palette.mutedLight} />} label="SIZE" value={formatSystemSize(item.system_size)} />
                <Fact icon={<Zap size={12} color={palette.mutedLight} />} label="TYPE" value={item.system_type || '—'} />
                <Fact icon={<Gauge size={12} color={palette.mutedLight} />} label="STATUS" value={item.installation_status || '—'} last />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            {error ? (
              <CircleAlert size={22} color={palette.danger} />
            ) : (
              <Zap size={22} color={palette.mutedLight} />
            )}
            <Text style={s.emptyTitle}>{error ? 'Could not load sites' : 'No sites yet'}</Text>
            <Text style={s.emptyBody}>
              {error || 'Sites appear here once SoWash adds them to your account.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function Fact({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <>
      <View style={{ flex: 1 }}>
        <View style={s.factLabelRow}>
          {icon}
          <Text style={s.factLabel}>{label}</Text>
        </View>
        <Text style={s.factValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {!last ? <View style={s.factDivider} /> : null}
    </>
  );
}

const CARD_SHADOW = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f8ff' },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.5 },
  centre: { alignItems: 'center', justifyContent: 'center' },

  header: { paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '900', color: palette.ink },
  subtitle: { fontSize: 13, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },

  // 140 clears the floating tab bar — same fix used on the other list
  // screens in this app.
  list: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 140, flexGrow: 1 },

  card: { backgroundColor: '#fff', borderRadius: 22, padding: 16, marginTop: 12, ...CARD_SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  name: { fontSize: 15.5, fontWeight: '800', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  meta: { flex: 1, fontSize: 12, color: palette.mutedLight, fontWeight: '600' },
  activePill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  activePillText: { fontSize: 10.5, fontWeight: '800' },

  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    paddingTop: 12,
  },
  factLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factLabel: { fontSize: 9, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.7 },
  factValue: { fontSize: 13, fontWeight: '800', color: palette.ink, marginTop: 4 },
  factDivider: { width: 1, height: 28, backgroundColor: '#eef2f7', marginHorizontal: 12 },

  empty: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 24,
    marginTop: 16,
    ...CARD_SHADOW,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});