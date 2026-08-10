// app/(tabs)/jobs.tsx
//
// The service record: every visit, filterable by site and by what stage it is
// at. Uses a FlatList rather than a ScrollView because a multi-site client can
// have hundreds of rows.
//
// The scope tabs map onto the endpoint's `scope` param, not onto client-side
// filtering, and that distinction is the whole point: the API pages at 100 rows
// ordered by date DESC, so with everything mixed together a client with many
// future bookings would fill the entire page with jobs that have not happened.

import React, { useState } from 'react';
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
import { CircleAlert, Inbox, Search, X } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useSiteContext } from '../../src/site-context';
import { useJobs } from '../../src/hooks';
import { JobScope } from '../../src/api/types';
import { SiteSwitcher } from '../../src/components/SiteSwitcher';
import { JobCard } from '../../src/components/JobCard';

const SCOPES: { key: JobScope; label: string }[] = [
  { key: 'past', label: 'COMPLETED' },
  { key: 'upcoming', label: 'UPCOMING' },
  { key: 'all', label: 'ALL' },
];

export default function JobsScreen() {
  const { accent } = useAccent();
  const { selectedSiteId, selectedSite } = useSiteContext();

  const [scope, setScope] = useState<JobScope>('past');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading, error, refreshing, refresh } = useJobs({
    scope,
    siteId: selectedSiteId,
    search,
    limit: 100,
  });

  const jobs = data?.jobs ?? [];

  // Search is applied on submit, not per keystroke: it goes to the server as an
  // ILIKE across three columns and firing that on every character is wasteful.
  const submitSearch = () => setSearch(query.trim());
  const clearSearch = () => {
    setQuery('');
    setSearch('');
  };

  return (
    <View style={styles.screen}>
      <View style={local.header}>
        <Text style={local.title}>Visits</Text>
        <View style={{ marginTop: 12 }}>
          <SiteSwitcher />
        </View>

        <View style={local.searchWrap}>
          <Search size={16} color={palette.mutedLight} />
          <TextInput
            style={local.searchInput}
            placeholder="Search site or address"
            placeholderTextColor={palette.mutedLight}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={clearSearch} hitSlop={8}>
              <X size={16} color={palette.mutedLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.tabRow, { marginTop: 12, marginBottom: 0 }]}>
          {SCOPES.map((s) => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setScope(s.key)}
              style={[styles.tab, scope === s.key && styles.tabActive]}
            >
              <Text style={[styles.tabText, scope === s.key && styles.tabTextActive]}>
                {s.label}
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
          keyExtractor={(j) => String(j.schedule_id)}
          renderItem={({ item }) => <JobCard job={item} showSite={!selectedSite} />}
          contentContainerStyle={local.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
          }
          ListEmptyComponent={
            <View style={local.empty}>
              {error ? (
                <CircleAlert size={24} color={palette.danger} />
              ) : (
                <Inbox size={24} color={palette.mutedLight} />
              )}
              <Text style={local.emptyTitle}>{error ? 'Could not load visits' : 'Nothing here'}</Text>
              <Text style={local.emptyBody}>
                {error ||
                  (search
                    ? `No visits match “${search}”.`
                    : scope === 'upcoming'
                      ? 'No upcoming visits are booked.'
                      : scope === 'past'
                        ? 'Completed visits appear here once CI admin approves them.'
                        : 'No visits on this account yet.')}
              </Text>
            </View>
          }
          ListFooterComponent={
            data?.hasMore ? (
              <Text style={local.footer}>
                Showing the most recent {jobs.length}. Narrow by site or search to see more.
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const local = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '900', color: palette.ink },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.ink },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 },
  empty: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
  footer: {
    fontSize: 11.5,
    color: palette.mutedLight,
    textAlign: 'center',
    paddingVertical: 14,
    fontWeight: '600',
  },
});
