// app/staff/clients.tsx
//
// The office Clients tab — every active commercial client, read-only.
// Tapping one sets it as the Jobs filter and jumps there, mirroring
// app/(tabs)/sites.tsx's "tap a site, land on Visits already filtered"
// pattern exactly, via src/staff-context.tsx instead of site-context.tsx.
//
// Ordered most-recent-activity-first (GET /schedule/clients sorts server-side
// by last_job_date DESC) — not alphabetically. "Last visit" on each card is
// what that ordering is actually sorted by, so it doesn't read as arbitrary.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, CalendarDays, CircleAlert, Phone, Search, User as UserIcon, Wrench } from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useStaffScope } from '../../src/staff-context';
import { formatDateOnly } from '../../src/hooks';
import { StaffClient } from '../../src/api/types';
import PageHeader from '../../src/components/PageHeader';

const TINTS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#14b8a6'];

function initial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export default function StaffClientsScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { clients, loading, error, refresh, setSelectedClientId } = useStaffScope();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (c.client_name || '').toLowerCase().includes(q));
  }, [clients, query]);

  const open = (c: StaffClient) => {
    setSelectedClientId(c.client_id);
    router.push('/staff/jobs');
  };

  if (loading && clients.length === 0) {
    return (
      <View style={[s.screen, s.centre]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} active client${clients.length === 1 ? '' : 's'}`}
      />

      <View style={s.searchWrap}>
        <Search size={16} color={palette.mutedLight} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search clients…"
          placeholderTextColor={palette.mutedLight}
          style={s.searchInput}
        />
      </View>

      {error && clients.length === 0 ? (
        <View style={s.centre}>
          <CircleAlert size={22} color={palette.danger} />
          <Text style={s.emptyTitle}>Could not load clients</Text>
          <Text style={s.emptyBody}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.client_id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          renderItem={({ item }) => {
            const name = item.client_name || 'Client';
            return (
              <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => open(item)}>
                <View style={[s.avatar, { backgroundColor: colorFor(name) }]}>
                  <Text style={s.avatarText}>{initial(name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {name}
                  </Text>
                  {item.contact_person ? (
                    <View style={s.metaRow}>
                      <UserIcon size={11} color={palette.mutedLight} />
                      <Text style={s.metaText} numberOfLines={1}>
                        {item.contact_person}
                      </Text>
                    </View>
                  ) : null}
                  {item.contact_number ? (
                    <View style={s.metaRow}>
                      <Phone size={11} color={palette.mutedLight} />
                      <Text style={s.metaText}>{item.contact_number}</Text>
                    </View>
                  ) : null}
                  {item.last_job_date ? (
                    <View style={s.metaRow}>
                      <CalendarDays size={11} color={palette.mutedLight} />
                      <Text style={s.metaText}>Last visit {formatDateOnly(item.last_job_date)}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.stats}>
                  <View style={s.statPill}>
                    <Building2 size={11} color={accent} />
                    <Text style={[s.statText, { color: accent }]}>{item.total_sites}</Text>
                  </View>
                  <View style={s.statPill}>
                    <Wrench size={11} color={palette.muted} />
                    <Text style={s.statText}>{item.completed_jobs}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Building2 size={22} color={palette.mutedLight} />
              <Text style={s.emptyTitle}>No clients found</Text>
              <Text style={s.emptyBody}>
                {query ? 'Try a different search.' : 'Active clients will show up here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 6 },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: palette.ink },
  headerSub: { fontSize: 12.5, fontWeight: '600', color: palette.mutedLight, marginTop: 3 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.ink },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 140, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  name: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight },

  stats: { gap: 5, alignItems: 'flex-end' },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.bg,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statText: { fontSize: 11, fontWeight: '800', color: palette.muted },

  emptyCard: { alignItems: 'center', gap: 6, marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginTop: 6 },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },
});
