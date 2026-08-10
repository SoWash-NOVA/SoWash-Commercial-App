// app/(tabs)/sites.tsx
//
// The client's estate. Tapping a site sets it as the active filter and drops
// the user on the Visits tab — which is the only reason most people open this
// screen, so it should not take three taps.

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
import { Building2, Check, CircleAlert, MapPin, Zap } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useSiteContext, siteLocation } from '../../src/site-context';
import { formatSystemSize } from '../../src/hooks';
import { Site } from '../../src/api/types';

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
      <View style={[styles.screen, local.centre]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={local.header}>
        <Text style={local.title}>Sites</Text>
        <Text style={local.subtitle}>
          {sites.length === 0
            ? 'No sites on this account'
            : `${sites.length} site${sites.length === 1 ? '' : 's'} on this account`}
        </Text>
      </View>

      <FlatList
        data={sites}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={local.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
        renderItem={({ item }) => {
          const active = item.id === selectedSiteId;
          return (
            <TouchableOpacity
              onPress={() => open(item)}
              style={[local.card, active && { borderColor: accent }]}
            >
              <View style={local.row}>
                <View style={[local.icon, active && { backgroundColor: `${accent}18` }]}>
                  {active ? (
                    <Check size={18} color={accent} />
                  ) : (
                    <Building2 size={18} color={palette.muted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={local.name} numberOfLines={1}>
                    {item.site_name || `Site #${item.id}`}
                  </Text>
                  {siteLocation(item) ? (
                    <View style={local.metaRow}>
                      <MapPin size={11} color={palette.mutedLight} />
                      <Text style={local.meta} numberOfLines={1}>
                        {siteLocation(item)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={local.footer}>
                <Fact label="SIZE" value={formatSystemSize(item.system_size)} />
                <Fact label="TYPE" value={item.system_type || '—'} />
                <Fact label="STATUS" value={item.installation_status || '—'} last />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={local.empty}>
            {error ? (
              <CircleAlert size={24} color={palette.danger} />
            ) : (
              <Zap size={24} color={palette.mutedLight} />
            )}
            <Text style={local.emptyTitle}>{error ? 'Could not load sites' : 'No sites yet'}</Text>
            <Text style={local.emptyBody}>
              {error || 'Sites appear here once SoWash adds them to your account.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function Fact({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <View style={{ flex: 1 }}>
        <Text style={local.factLabel}>{label}</Text>
        <Text style={local.factValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {!last ? <View style={local.factDivider} /> : null}
    </>
  );
}

const local = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '900', color: palette.ink },
  subtitle: { fontSize: 13, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '800', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  meta: { flex: 1, fontSize: 12, color: palette.mutedLight, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
    paddingTop: 10,
  },
  factLabel: { fontSize: 9, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.7 },
  factValue: { fontSize: 12.5, fontWeight: '700', color: palette.inkSoft, marginTop: 2 },
  factDivider: { width: 1, height: 24, backgroundColor: palette.borderSubtle, marginHorizontal: 10 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});
