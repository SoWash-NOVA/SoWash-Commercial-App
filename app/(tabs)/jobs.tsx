// app/(tabs)/jobs.tsx
//
// The service record: every visit, filterable by site and by what stage it is
// at. Uses a FlatList rather than a ScrollView because a multi-site client can
// have hundreds of rows.
//
// DATE FIX — the "Last Visit" card was showing one day earlier than the real
// scheduled_date (16 Sep assigned, 15 Sep shown). That's the classic
// timezone bug: `new Date("2026-09-16")` is parsed as UTC midnight, then
// re-rendered in the device's local time can land on the previous calendar
// day depending on offset. `visitDayLabel` below sidesteps it entirely by
// reading the Y/M/D digits straight out of the string and building a LOCAL
// Date from those numbers — no UTC conversion involved, so no shift.
// ⚠️ This only fixes the date shown on THIS screen's own "Last Visit" card.
// Each row below it is rendered by `<JobCard>`, a separate component I
// don't have the source of — if its dates are also off by a day, the same
// fix needs to go wherever IT formats a date (likely the same
// `formatDateOnly`/`relativeDay` helpers in `src/hooks.ts`, imported here
// too). Share that file and I'll fix it once, correctly, everywhere it's
// used instead of scattering local overrides screen by screen.
//
// MISSING COMPLETED JOBS — two different things can cause this, and I can
// only fix one of them from this file:
//   1. Stale data: this screen fetched once and never refetched, so a job
//      completed after that fetch just isn't in memory yet. FIXED below —
//      `useFocusEffect` now refetches both the list and the Last Visit card
//      every time this tab regains focus, not just on pull-to-refresh.
//   2. Server-side gating: the empty-state copy on this very screen already
//      said "Completed visits appear here once CI admin approves them" —
//      that was already true before I touched this file, which means
//      `scope=past` on the backend may only return admin-approved completed
//      jobs, not everything with status=completed. If a job shows completed
//      on the web portal but not here, and a fresh pull-to-refresh still
//      doesn't surface it, this is very likely why — and it's a backend
//      filter, not something I can change from the app. Worth confirming
//      with whoever owns that endpoint.
//
// DEEP-LINKED FILTERS — the Overview screen's KPI tiles link here with query
// params (`/jobs?scope=past`, `/jobs?scope=all&status=in_progress`, etc.),
// read via `useLocalSearchParams`. `scope` maps straight onto the existing
// scope tabs. `status` has no server-side scope of its own, so it's applied
// as a client-side filter on top of whichever scope was requested.
//
// Tapping a scope tab manually clears any incoming status filter — picking
// a broader tab on purpose shouldn't leave an invisible filter still narrowing
// the list underneath it.
//
// The scope tabs map onto the endpoint's `scope` param, not onto client-side
// filtering, and that distinction is the whole point: the API pages at 100 rows
// ordered by date DESC, so with everything mixed together a client with many
// future bookings would fill the entire page with jobs that have not happened.
//
// Visual language matches the rest of the app: light wash background,
// ambient colour blobs, white shadowed cards.

import React, { useEffect, useMemo, useState } from 'react';
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
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { ArrowRight, CheckCircle2, CircleAlert, Filter, Inbox, Search, X } from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useSiteContext } from '../../src/site-context';
import { useJobs, formatDateOnly } from '../../src/hooks';
import { JobScope } from '../../src/api/types';
import { SiteSwitcher } from '../../src/components/SiteSwitcher';
import { JobCard } from '../../src/components/JobCard';

const GREEN = '#10b981';

const SCOPES: { key: JobScope; label: string }[] = [
  { key: 'past', label: 'Completed' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
];

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In progress',
};

/** Reads the Y/M/D digits straight out of the date string and builds a
 * LOCAL Date from those numbers — deliberately bypasses `new Date(iso)`,
 * which is where the UTC-parse-then-local-render shift comes from. Falls
 * back to `formatDateOnly` for anything that doesn't look like a plain
 * date so this stays a narrow, targeted fix rather than a second date
 * formatter for the whole app. */
function visitDayLabel(raw: string | null | undefined): string {
  if (!raw) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return formatDateOnly(raw);
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function JobsScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { selectedSiteId, selectedSite } = useSiteContext();
  const params = useLocalSearchParams<{ scope?: string; status?: string }>();

  const [scope, setScope] = useState<JobScope>((params.scope as JobScope) || 'past');
  const [statusFilter, setStatusFilter] = useState<string | null>(params.status ?? null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  // Deep-linked params can change while this tab stays mounted (tapping a
  // different KPI tile navigates here again with new params) — sync state
  // to them rather than only reading them once on first mount.
  useEffect(() => {
    if (params.scope) setScope(params.scope as JobScope);
    setStatusFilter(params.status ?? null);
  }, [params.scope, params.status]);

  const { data, loading, error, refreshing, refresh } = useJobs({
    scope,
    siteId: selectedSiteId,
    search,
    limit: 100,
  });

  // Independent of the scope tabs/search above — always "whatever happened
  // most recently", one job, one day.
  const last = useJobs({ scope: 'past', siteId: selectedSiteId, limit: 1 });
  const lastJob = last.data?.jobs?.[0] ?? null;

  // Refetch on focus, not just pull-to-refresh — otherwise a job completed
  // after this screen's last fetch stays invisible until the user thinks to
  // manually pull down. Uses expo-router's own `useNavigation` rather than
  // importing `useFocusEffect` from `@react-navigation/native` directly,
  // since that package isn't reliably resolvable as a direct dependency
  // here (same issue as the tab bar's types earlier).
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
      last.refresh();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, scope, selectedSiteId, search]);

  const jobs = useMemo(() => {
    const base = data?.jobs ?? [];
    return statusFilter ? base.filter((j) => j.status === statusFilter) : base;
  }, [data, statusFilter]);

  // Search is applied on submit, not per keystroke: it goes to the server as an
  // ILIKE across three columns and firing that on every character is wasteful.
  const submitSearch = () => setSearch(query.trim());
  const clearSearch = () => {
    setQuery('');
    setSearch('');
  };

  const onRefresh = async () => {
    await Promise.all([refresh(), last.refresh()]);
  };

  const selectScope = (key: JobScope) => {
    setScope(key);
    setStatusFilter(null);
    router.setParams({ scope: key, status: '' });
  };

  return (
    <View style={s.screen}>
      <View pointerEvents="none" style={s.wash}>
        <View style={[s.blob, { backgroundColor: '#dbeafe', top: -90, left: -70, width: 260, height: 260 }]} />
        <View style={[s.blob, { backgroundColor: '#fce7f3', top: 240, right: -100, width: 260, height: 260 }]} />
      </View>

      {loading && !data ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => String(j.schedule_id)}
          style={{ flex: 1 }}
          renderItem={({ item }) => (
            <View style={s.cardWrap}>
              <JobCard job={item} showSite={!selectedSite} />
            </View>
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListHeaderComponent={
            <View>
              <Text style={s.title}>Visits</Text>
              <View style={{ marginTop: 14 }}>
                <SiteSwitcher />
              </View>

              {/* ── Last visit ─────────────────────────────────────────── */}
              <Text style={s.sectionTitle}>LAST VISIT</Text>
              {last.loading && !last.data ? (
                <View style={[s.skeleton, { height: 92 }]} />
              ) : lastJob ? (
                <TouchableOpacity
                  onPress={() => router.push(`/job/${lastJob.schedule_id}`)}
                  activeOpacity={0.9}
                  style={s.lastCard}
                >
                  <View style={s.lastIcon}>
                    <CheckCircle2 size={20} color={GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lastDate}>{visitDayLabel(lastJob.scheduled_date)}</Text>
                    <Text style={s.lastSite} numberOfLines={1}>
                      {lastJob.site_name || 'Site'}
                    </Text>
                  </View>
                  <ArrowRight size={16} color={palette.mutedLight} />
                </TouchableOpacity>
              ) : (
                <View style={s.lastEmpty}>
                  <Inbox size={18} color={palette.mutedLight} />
                  <Text style={s.lastEmptyText}>
                    {selectedSite ? `No completed visits yet for ${selectedSite.site_name}.` : 'No completed visits yet.'}
                  </Text>
                </View>
              )}

              {/* ── Search ─────────────────────────────────────────────── */}
              <View style={s.searchWrap}>
                <Search size={16} color={palette.mutedLight} />
                <TextInput
                  style={s.searchInput}
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

              {/* ── Scope segment ──────────────────────────────────────── */}
              <View style={s.segment}>
                {SCOPES.map((sc) => {
                  const on = sc.key === scope;
                  return (
                    <TouchableOpacity
                      key={sc.key}
                      onPress={() => selectScope(sc.key)}
                      activeOpacity={0.8}
                      style={[s.segmentItem, on && s.segmentItemOn]}
                    >
                      <Text style={[s.segmentText, on && { color: accent }]}>{sc.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Deep-linked status filter, e.g. from the Overview "Active"
                  tile — shown as a clearable chip so it's never an invisible
                  narrowing of the list underneath the scope tabs. */}
              {statusFilter ? (
                <TouchableOpacity
                  onPress={() => {
                    setStatusFilter(null);
                    router.setParams({ status: '' });
                  }}
                  activeOpacity={0.8}
                  style={[s.filterChip, { borderColor: `${accent}44`, backgroundColor: `${accent}12` }]}
                >
                  <Filter size={12} color={accent} />
                  <Text style={[s.filterChipText, { color: accent }]}>
                    {STATUS_LABELS[statusFilter] ?? statusFilter}
                  </Text>
                  <X size={13} color={accent} />
                </TouchableOpacity>
              ) : null}

              <Text style={[s.sectionTitle, { marginBottom: 4 }]}>
                {scope === 'past' ? 'COMPLETED VISITS' : scope === 'upcoming' ? 'UPCOMING VISITS' : 'ALL VISITS'}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              {error ? (
                <CircleAlert size={22} color={palette.danger} />
              ) : (
                <Inbox size={22} color={palette.mutedLight} />
              )}
              <Text style={s.emptyTitle}>{error ? 'Could not load visits' : 'Nothing here'}</Text>
              <Text style={s.emptyBody}>
                {error ||
                  (search
                    ? `No visits match "${search}".`
                    : statusFilter
                      ? `No ${(STATUS_LABELS[statusFilter] ?? statusFilter).toLowerCase()} visits right now.`
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
              <Text style={s.footer}>
                Showing the most recent {jobs.length}. Narrow by site or search to see more.
              </Text>
            ) : null
          }
        />
      )}
    </View>
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
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  title: { fontSize: 24, fontWeight: '900', color: palette.ink, marginTop: 8 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: palette.mutedLight,
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 10,
  },

  lastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    ...CARD_SHADOW,
  },
  lastIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: `${GREEN}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastDate: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  lastSite: { fontSize: 12.5, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },
  lastEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    ...CARD_SHADOW,
  },
  lastEmptyText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: palette.mutedLight, lineHeight: 18 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 46,
    marginTop: 20,
    ...CARD_SHADOW,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.ink },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#eef1f8',
    borderRadius: 14,
    padding: 4,
    marginTop: 14,
  },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  segmentItemOn: { backgroundColor: '#fff', ...CARD_SHADOW },
  segmentText: { fontSize: 12.5, fontWeight: '700', color: palette.muted },

  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 12,
  },
  filterChipText: { fontSize: 12, fontWeight: '800' },

  cardWrap: { marginBottom: 10 },

  // 140 clears the floating tab bar (its own height + the raised centre
  // button + safe-area inset) — same fix as the Overview screen.
  list: { paddingHorizontal: 18, paddingBottom: 140, flexGrow: 1 },

  empty: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 24,
    marginTop: 4,
    ...CARD_SHADOW,
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

  skeleton: { borderRadius: 20, backgroundColor: '#fff', ...CARD_SHADOW },
});