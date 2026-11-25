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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowRight, CheckCircle2, CircleAlert, Inbox, Search, X } from 'lucide-react-native';
import { palette } from '../../src/theme';
import { tc, soft } from '../../src/themeEngine';
import { useAccent } from '../../src/theme-context';
import { useSiteContext } from '../../src/site-context';
import { useJobs, formatDateOnly, matchesStatusFilter, StatusFilterKey } from '../../src/hooks';
import { JobScope } from '../../src/api/types';
import { SiteSwitcher } from '../../src/components/SiteSwitcher';
import { JobCard } from '../../src/components/JobCard';
import PageHeader from '../../src/components/PageHeader';
import { StatusFilterBar } from '../../src/components/StatusFilterBar';

const GREEN = '#10b981';

const SCOPES: { key: JobScope; label: string }[] = [
  { key: 'past', label: 'Completed' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
];

const STATUS_LABELS: Record<StatusFilterKey, string> = {
  all: 'All',
  scheduled: 'Scheduled',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Deep links (Overview tiles) may send the raw status, e.g. `in_progress` - map it onto a chip. */
function toFilterKey(raw?: string | null): StatusFilterKey {
  const v = String(raw || '').toLowerCase();
  if (v === 'in_progress' || v === 'ongoing') return 'ongoing';
  if (v === 'scheduled' || v === 'completed' || v === 'cancelled') return v;
  return 'all';
}

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

/** One visit row. Memoised so a chip change / refresh only re-renders rows whose job actually changed. */
const VisitRow = React.memo(function VisitRow({ job, showSite }: { job: any; showSite: boolean }) {
  return (
    <View style={s.cardWrap}>
      <JobCard job={job} showSite={showSite} />
    </View>
  );
});

export default function JobsScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { selectedSiteId, selectedSite, selectedClientId } = useSiteContext();
  const params = useLocalSearchParams<{ scope?: string; status?: string }>();

  const [scope, setScope] = useState<JobScope>((params.scope as JobScope) || 'past');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>(toFilterKey(params.status));
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  // Deep-linked params can change while this tab stays mounted (tapping a
  // different KPI tile navigates here again with new params) — sync state
  // to them rather than only reading them once on first mount.
  useEffect(() => {
    if (params.scope) setScope(params.scope as JobScope);
    setStatusFilter(toFilterKey(params.status));
  }, [params.scope, params.status]);

  const { data, loading, error, refreshing, refresh } = useJobs({
    scope,
    siteId: selectedSiteId,
    clientId: selectedClientId,
    search,
    limit: 100,
  });

  // Independent of the scope tabs/search above — always "whatever happened
  // most recently", one job, one day.
  const last = useJobs({ scope: 'past', siteId: selectedSiteId, clientId: selectedClientId, limit: 1 });
  const lastJob = last.data?.jobs?.[0] ?? null;

  // Refetch on focus, not just pull-to-refresh — otherwise a job completed
  // after this screen's last fetch stays invisible until the user thinks to
  // manually pull down. Uses expo-router's own `useNavigation` rather than
  // importing `useFocusEffect` from `@react-navigation/native` directly,
  // since that package isn't reliably resolvable as a direct dependency
  // here (same issue as the tab bar's types earlier).
  const navigation = useNavigation();
  const lastFetchRef = useRef(Date.now());
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Throttled: the first focus fires right after mount (already fetching) and quick tab hops
      // do not need two more requests each time.
      if (Date.now() - lastFetchRef.current < 30_000) return;
      lastFetchRef.current = Date.now();
      refresh();
      last.refresh();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, scope, selectedSiteId, search]);

  const showSite = !selectedSite;
  const renderRow = useCallback(
    ({ item }: { item: any }) => <VisitRow job={item} showSite={showSite} />,
    [showSite],
  );

  const jobs = useMemo(() => {
    const base = data?.jobs ?? [];
    return statusFilter === 'all' ? base : base.filter((j) => matchesStatusFilter(j.status, statusFilter));
  }, [data, statusFilter]);

  // Counts shown on the chips (of the visits currently loaded for the chosen scope/site/search).
  const counts = useMemo(() => {
    const base = data?.jobs ?? [];
    const c: Partial<Record<StatusFilterKey, number>> = { all: base.length };
    (['scheduled', 'ongoing', 'completed', 'cancelled'] as StatusFilterKey[]).forEach((k) => {
      c[k] = base.filter((j) => matchesStatusFilter(j.status, k)).length;
    });
    return c;
  }, [data]);

  // A status chip filters the rows already loaded, so it needs the full list: switch off the
  // Completed-only / Upcoming-only server scope when a specific status is chosen.
  const selectStatus = (key: StatusFilterKey) => {
    setStatusFilter(key);
    // Completed uses the server's 'past' scope (smaller, correctly ordered page); Scheduled / Ongoing /
    // Cancelled need the full list.
    if (key === 'completed') setScope('past');
    else if (key !== 'all' && scope !== 'all') setScope('all');
    router.setParams({ status: key === 'all' ? '' : key });
  };

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
    setStatusFilter('all');
    router.setParams({ scope: key, status: '' });
  };

  return (
    <View style={s.screen}>
      <View pointerEvents="none" style={s.wash}>
        <View style={[s.blob, { backgroundColor: soft('#dbeafe'), top: -90, left: -70, width: 260, height: 260 }]} />
        <View style={[s.blob, { backgroundColor: soft('#fce7f3'), top: 240, right: -100, width: 260, height: 260 }]} />
      </View>

      <PageHeader title="Visits">
        <SiteSwitcher />
      </PageHeader>

      {loading && !data ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          data={jobs}
          keyExtractor={(j) => String(j.schedule_id)}
          style={{ flex: 1 }}
          renderItem={renderRow}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListHeaderComponent={
            <View>
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

              {/* Status chips (Scheduled / Ongoing / Completed ...) */}
              <View style={{ marginTop: 12 }}>
                <StatusFilterBar value={statusFilter} onChange={selectStatus} counts={counts} />
              </View>

              <Text style={[s.sectionTitle, { marginBottom: 4 }]}>
                {statusFilter !== 'all'
                  ? `${STATUS_LABELS[statusFilter].toUpperCase()} VISITS`
                  : scope === 'past'
                    ? 'COMPLETED VISITS'
                    : scope === 'upcoming'
                      ? 'UPCOMING VISITS'
                      : 'ALL VISITS'}
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
                    : statusFilter !== 'all'
                      ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} visits right now.`
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