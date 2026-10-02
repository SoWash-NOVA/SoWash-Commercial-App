// app/staff/jobs.tsx
//
// The office Jobs tab — a two-level drill-down, not one flat/grouped list of
// every client's visits at once:
//
//   1. No client picked (src/staff-context.tsx's selectedClientId is null):
//      show the CLIENT INDEX — same client_id/name/counts useStaffScope()
//      already fetches for app/staff/clients.tsx. Tapping a client sets it as
//      selected.
//   2. A client picked: show THAT client's job list, full stop. Going "back"
//      (the header's back arrow) clears the selection and returns to the
//      index — it does not clear the tab, since app/staff/clients.tsx sets
//      the same selection when it hands off here.
//
// No approval gate on the job list, unlike the client app's own Visits list:
// this talks to /api/schedule/history (src/hooks.ts useStaffJobs), the
// staff-side endpoint, not /api/customer-portal/history. A completed-but-
// unapproved visit is real information for an office user — it shows as a
// "Pending approval" badge instead of being hidden, the same signal
// ChatVisitCard.tsx's pending_approval already gives staff elsewhere.
//
// Tapping a job opens a detail sheet built entirely from the row already in
// hand — /schedule/history's SELECT already carries the FSR fields and photo
// columns, so there is no second request, matching the "one card, one fetch"
// shape ChatVisitCard.tsx uses for its own popup.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Search,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useStaffScope } from '../../src/staff-context';
import { useStaffJobs, formatDateOnly, formatDateTime, statusMeta, stageIndex, STAGES } from '../../src/hooks';
import { photoUrl, photoUrls } from '../../src/api/client';
import { StaffJob } from '../../src/api/types';
import PageHeader from '../../src/components/PageHeader';
import { PhotoStripList, PhotoStripSkeleton, PhotoThumb, useAfterOpen } from '../../src/components/PhotoStripList';

const isFinished = (status: string | null | undefined) =>
  String(status || '').trim().toLowerCase().startsWith('complet');

/** Staff-only badge, same rule ChatVisitCard.tsx's pending_approval uses. */
const isPendingApproval = (job: StaffJob) =>
  isFinished(job.status) && String(job.approval_status || '').toLowerCase() !== 'approved';

/**
 * Wraps the detail popup so a render crash shows the actual error message
 * instead of Metro's full-screen red box — added specifically because a
 * crash was reported opening a completed job's popup that repeated identical
 * "ERROR ... FlatList" stack traces with no error message ever visible,
 * across several rounds of static code review turning up nothing. This
 * surfaces the real message on screen next time so it can actually be fixed,
 * rather than guessed at again. Class component because React error
 * boundaries require getDerivedStateFromError, which has no hook form.
 */
class DetailErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Modal visible transparent animationType="slide" onRequestClose={this.props.onClose}>
          <Pressable style={detail.backdrop} onPress={this.props.onClose}>
            <Pressable style={detail.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={detail.head}>
                <Text style={detail.headTitle}>Couldn't show this visit</Text>
                <TouchableOpacity onPress={this.props.onClose} hitSlop={10} style={detail.close}>
                  <X size={18} color={palette.inkSoft} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 18 }}>
                <Text style={detail.errorText}>{String(this.state.error.message || this.state.error)}</Text>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      );
    }
    return this.props.children;
  }
}

const TINTS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#14b8a6'];
const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();
function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export default function StaffJobsScreen() {
  const { selectedClientId } = useStaffScope();
  return selectedClientId ? <ClientJobsList /> : <ClientIndex />;
}

/* ==================================================================== *
 * Level 1 — pick a client
 * ==================================================================== */

function ClientIndex() {
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

  if (loading && clients.length === 0) {
    return (
      <View style={[s.screen, s.centre]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <PageHeader title="Jobs" subtitle="Pick a client to see their visits" />

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
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          data={filtered}
          keyExtractor={(item) => String(item.client_id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          renderItem={({ item }) => {
            const name = item.client_name || 'Client';
            return (
              <TouchableOpacity
                style={s.clientCard}
                activeOpacity={0.85}
                onPress={() => setSelectedClientId(item.client_id)}
              >
                <View style={[s.avatar, { backgroundColor: colorFor(name) }]}>
                  <Text style={s.avatarText}>{initial(name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.clientName} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={s.metaRow}>
                    <Building2 size={11} color={palette.mutedLight} />
                    <Text style={s.metaText}>
                      {item.total_sites} site{item.total_sites === 1 ? '' : 's'} · {item.completed_jobs} completed
                    </Text>
                  </View>
                  {item.last_job_date ? (
                    <View style={s.metaRow}>
                      <CalendarDays size={11} color={palette.mutedLight} />
                      <Text style={s.metaText}>Last visit {formatDateOnly(item.last_job_date)}</Text>
                    </View>
                  ) : null}
                </View>
                <ChevronRight size={18} color={palette.mutedLight} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Building2 size={22} color={palette.mutedLight} />
              <Text style={s.emptyTitle}>No clients found</Text>
              <Text style={s.emptyBody}>{query ? 'Try a different search.' : 'Active clients will show up here.'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

/* ==================================================================== *
 * Level 2 — one client's jobs
 * ==================================================================== */

function ClientJobsList() {
  const { accent } = useAccent();
  const { selectedClient, setSelectedClientId } = useStaffScope();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [openJob, setOpenJob] = useState<StaffJob | null>(null);

  const { data, loading, error, refresh } = useStaffJobs({
    clientId: selectedClient?.client_id ?? null,
    search,
  });
  const jobs = useMemo(() => data?.jobs ?? [], [data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const goBack = () => setSelectedClientId(null);

  if (loading && jobs.length === 0) {
    return (
      <View style={[s.screen, s.centre]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <PageHeader
        title={selectedClient?.client_name || 'Client'}
        subtitle={`${jobs.length} visit${jobs.length === 1 ? '' : 's'}`}
        onBack={goBack}
      />

      <View style={s.searchWrap}>
        <Search size={16} color={palette.mutedLight} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search site or address…"
          placeholderTextColor={palette.mutedLight}
          style={s.searchInput}
        />
      </View>

      {error && jobs.length === 0 ? (
        <View style={s.centre}>
          <CircleAlert size={22} color={palette.danger} />
          <Text style={s.emptyTitle}>Could not load jobs</Text>
          <Text style={s.emptyBody}>{error}</Text>
        </View>
      ) : (
        <FlatList
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          data={jobs}
          keyExtractor={(item) => String(item.schedule_id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          renderItem={({ item }) => {
            const meta = statusMeta(item.status);
            const pending = isPendingApproval(item);
            return (
              <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => setOpenJob(item)}>
                <View style={s.cardTop}>
                  <Text style={s.siteName} numberOfLines={1}>
                    {item.site_name || 'Site'}
                  </Text>
                  <View style={[s.dot, { backgroundColor: meta.color }]} />
                  <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>

                <View style={s.metaRow}>
                  <CalendarDays size={11} color={palette.mutedLight} />
                  <Text style={s.metaText}>
                    {formatDateOnly(item.scheduled_date)}
                    {item.team_lead_name ? ` · ${item.team_lead_name}` : ''}
                  </Text>
                </View>

                {pending ? (
                  <View style={s.pendingChip}>
                    <Text style={s.pendingChipText}>Pending approval</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Wrench size={22} color={palette.mutedLight} />
              <Text style={s.emptyTitle}>No jobs found</Text>
              <Text style={s.emptyBody}>{search ? 'Try a different search.' : 'Visits will show up here.'}</Text>
            </View>
          }
        />
      )}

      {openJob ? (
        <DetailErrorBoundary onClose={() => setOpenJob(null)}>
          <JobDetailSheet job={openJob} onClose={() => setOpenJob(null)} />
        </DetailErrorBoundary>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={detail.fact}>
      <Text style={detail.factLabel}>{label}</Text>
      <Text style={detail.factValue}>{value}</Text>
    </View>
  );
}

/**
 * Connected-dot progress rail — the same visual src/components/JobDetailBody.tsx
 * uses for the client app's own visit timeline (STAGES/stageIndex from
 * src/hooks.ts), reused here rather than reinvented so a completed visit
 * reads identically to a site manager and to office staff.
 */
function Timeline({ job }: { job: StaffJob }) {
  const { accent } = useAccent();
  const reached = stageIndex(job);
  const times = [
    job.scheduled_date ? formatDateOnly(job.scheduled_date) : null,
    formatDateTime(job.started_at),
    formatDateTime(job.before_photos_at),
    formatDateTime(job.after_photos_at),
    formatDateTime(job.completed_at),
  ];

  return (
    <View>
      {STAGES.map((stage, i) => {
        const done = i < reached;
        const isLast = i === STAGES.length - 1;
        return (
          <View key={stage} style={detail.stageRow}>
            <View style={detail.stageRail}>
              <View style={[detail.stageDot, done && { backgroundColor: accent, borderColor: accent }]} />
              {!isLast ? (
                <View style={[detail.stageLine, done && i + 1 < reached && { backgroundColor: accent }]} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
              <Text style={[detail.stageLabel, done && { color: palette.ink }]}>{stage}</Text>
              <Text style={detail.stageTime}>{done ? times[i] || '—' : 'Pending'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// The photo rows are virtualised (src/components/PhotoStripList.tsx): only the photos on or
// next to the screen mount and download, the first two at high priority, with a spinner while
// loading and tap-to-retry on failure. The old version mounted every photo at once (full-
// resolution originals, no server thumbnails) — a dozen multi-MB downloads in parallel, which
// crawled on a weak connection and made the popup stutter as they decoded. `ready` (from
// useAfterOpen) holds the rows back until the popup has finished sliding in.
const PHOTO_W = 130;
const PHOTO_H = 100;

function PhotoRow({ title, urls, ready }: { title: string; urls: string[]; ready: boolean }) {
  if (urls.length === 0) return null;

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={detail.sectionTitle}>
        {title.toUpperCase()} · {urls.length}
      </Text>
      {ready ? (
        <PhotoStripList urls={urls} width={PHOTO_W} height={PHOTO_H} gap={8} radius={10} />
      ) : (
        <PhotoStripSkeleton width={PHOTO_W} height={PHOTO_H} radius={10} />
      )}
    </View>
  );
}

function JobDetailSheet({ job, onClose }: { job: StaffJob; onClose: () => void }) {
  const { accent } = useAccent();
  const meta = statusMeta(job.status);
  const pending = isPendingApproval(job);
  // The popup opens instantly with its text; the photos mount once the slide-in has finished.
  const ready = useAfterOpen();

  const beforeUrls = useMemo(() => photoUrls(job.before_photos), [job.before_photos]);
  const afterUrls = useMemo(() => photoUrls(job.after_photos), [job.after_photos]);
  // tbt_photos is already a clean array (shaped server-side — see the
  // StaffTbtPhoto comment in src/api/types.ts), so only photoUrl() itself is
  // needed here, not the JSON-parsing half of photoUrls().
  //
  // `?? []` on both this and job.attendance below: the TS type promises these
  // are always arrays, but that's a compile-time guarantee only — a backend
  // that hasn't been redeployed with the fields that produce them yet will
  // send a response without them at all, and `undefined.map(...)` crashes the
  // whole sheet instead of just showing an empty section.
  const tbtUrls = useMemo(
    () => (job.tbt_photos ?? []).map((p) => photoUrl(p.photo_url)).filter((u): u is string => !!u),
    [job.tbt_photos],
  );
  const attendance = job.attendance ?? [];

  const rawFindings: Array<[string, string | null]> = [
    ['Panel damage', job.panel_damage],
    ['Panel brand', job.panel_brand],
    ['Cable condition', job.cable_condition],
    ['Inverter alarm', job.inverter_alarm],
    ['Alarm code', job.alarm_code],
    ['Shading', job.potential_shading],
    ['Rusting', job.rusting],
    ['Bird droppings', job.bird_dropping],
    ['Moss & debris', job.mos_and_debris],
    ['Earthing', job.earthing],
  ];

  const findings: [string, string][] = rawFindings
    .filter((pair): pair is [string, string] => {
      const v = pair[1];
      return v !== null && v !== undefined && String(v).trim() !== '';
    })
    .map(([label, v]) => [label, String(v)]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* The backdrop tap is a SIBLING behind the sheet, not a Pressable wrapped around it: a Pressable
          around a ScrollView competes for the gesture and makes scrolling feel sticky on Android. */}
      <View style={detail.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={detail.sheet}>
          <View style={detail.head}>
            <View style={{ flex: 1 }}>
              <Text style={detail.headTitle} numberOfLines={1}>
                {job.site_name || 'Visit details'}
              </Text>
              <Text style={detail.headSub} numberOfLines={1}>
                {job.client_name || ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={detail.close}>
              <X size={18} color={palette.inkSoft} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={detail.factGrid}>
              <Fact label="Status" value={meta.label} />
              <Fact label="Scheduled" value={formatDateOnly(job.scheduled_date)} />
              <Fact label="Service #" value={String(job.service_number ?? '—')} />
              <Fact label="Crew lead" value={job.team_lead_name || '—'} />
              <Fact label="Approval" value={job.approval_status || '—'} />
              <Fact label="Priority" value={job.priority || '—'} />
            </View>

            {pending ? (
              <View style={detail.warnBlock}>
                <Text style={detail.warnText}>
                  Completed, but not yet approved — the client's own app will not show this visit
                  until it is.
                </Text>
              </View>
            ) : null}

            <Text style={detail.sectionTitle}>PROGRESS</Text>
            <Timeline job={job} />

            <PhotoRow title="Before" urls={beforeUrls} ready={ready} />
            <PhotoRow title="After" urls={afterUrls} ready={ready} />
            <PhotoRow title="Toolbox talk (TBT)" urls={tbtUrls} ready={ready} />

            {attendance.length > 0 ? (
              <>
                <Text style={detail.sectionTitle}>ATTENDANCE</Text>
                <View style={{ gap: 8 }}>
                  {attendance.map((a, i) => {
                    const clockInPhoto = photoUrl(a.clock_in_image_url);
                    const clockOutPhoto = photoUrl(a.clock_out_image_url);
                    return (
                      <View key={`${a.fo_name}-${i}`} style={detail.attendanceRow}>
                        <View style={{ flex: 1 }}>
                          <View style={detail.attendanceTop}>
                            <UserCheck size={13} color={palette.muted} />
                            <Text style={detail.attendanceName} numberOfLines={1}>
                              {a.fo_name}
                            </Text>
                          </View>
                          <Text style={detail.attendanceTimes}>
                            In {formatDateTime(a.clock_in_at)}
                            {a.clock_out_at ? `  ·  Out ${formatDateTime(a.clock_out_at)}` : ''}
                          </Text>
                          <Text style={detail.attendanceStatus}>{a.status}</Text>
                        </View>
                        {clockInPhoto || clockOutPhoto ? (
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {clockInPhoto && ready ? <PhotoThumb url={clockInPhoto} width={36} height={36} radius={8} priority="low" /> : null}
                            {clockOutPhoto && ready ? <PhotoThumb url={clockOutPhoto} width={36} height={36} radius={8} priority="low" /> : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {findings.length > 0 ? (
              <>
                <Text style={detail.sectionTitle}>WHAT THE CREW FOUND</Text>
                {findings.map(([label, value]) => (
                  <View key={label} style={detail.findingRow}>
                    <Text style={detail.findingLabel}>{label}</Text>
                    <Text style={detail.findingValue}>{value}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {job.additional_notes ? (
              <>
                <Text style={detail.sectionTitle}>CREW NOTES</Text>
                <Text style={detail.noteText}>{job.additional_notes}</Text>
              </>
            ) : null}

            {job.notes ? (
              <>
                <Text style={detail.sectionTitle}>SCHEDULE NOTES</Text>
                <Text style={detail.noteText}>{job.notes}</Text>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
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

  jobsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 140, gap: 8 },

  clientCard: {
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
  clientName: { fontSize: 14.5, fontWeight: '800', color: palette.ink },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  siteName: { flex: 1, fontSize: 14, fontWeight: '800', color: palette.ink },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  metaText: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight },
  pendingChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#F59E0B18',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingChipText: { fontSize: 10.5, fontWeight: '800', color: '#B45309' },

  emptyCard: { alignItems: 'center', gap: 6, marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginTop: 6 },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },
});

const detail = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: palette.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  headTitle: { fontSize: 17, fontWeight: '900', color: palette.ink },
  headSub: { fontSize: 12, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },
  errorText: {
    fontSize: 12.5,
    color: palette.danger,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
    borderRadius: 10,
    padding: 10,
  },
  factLabel: { fontSize: 9.5, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.6 },
  factValue: { fontSize: 13, fontWeight: '700', color: palette.ink, marginTop: 3 },

  warnBlock: {
    marginTop: 12,
    backgroundColor: '#F59E0B18',
    borderWidth: 1,
    borderColor: '#F59E0B4D',
    borderRadius: 10,
    padding: 12,
  },
  warnText: { fontSize: 12, color: '#B45309', fontWeight: '600', lineHeight: 17 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.mutedLight,
    letterSpacing: 0.9,
    marginTop: 20,
    marginBottom: 8,
  },
  stageRow: { flexDirection: 'row', gap: 12 },
  stageRail: { alignItems: 'center', width: 14 },
  stageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  stageLine: { flex: 1, width: 2, backgroundColor: palette.borderSubtle, marginTop: 2 },
  stageLabel: { fontSize: 13.5, fontWeight: '800', color: palette.mutedLight, marginTop: -2 },
  stageTime: { fontSize: 11.5, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },

  photo: { width: 130, height: 100, borderRadius: 10, backgroundColor: palette.borderSubtle },
  morePhotos: {
    width: 130,
    height: 100,
    borderRadius: 10,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePhotosText: { fontSize: 15, fontWeight: '900', color: palette.muted },

  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
    borderRadius: 10,
    padding: 10,
  },
  attendanceTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  attendanceName: { fontSize: 13, fontWeight: '800', color: palette.ink },
  attendanceTimes: { fontSize: 11.5, fontWeight: '600', color: palette.muted, marginTop: 3 },
  attendanceStatus: { fontSize: 10.5, fontWeight: '700', color: palette.mutedLight, marginTop: 2 },
  attendancePhoto: { width: 36, height: 36, borderRadius: 8, backgroundColor: palette.borderSubtle },

  findingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  findingLabel: { fontSize: 12.5, color: palette.muted, fontWeight: '700' },
  findingValue: { fontSize: 12.5, color: palette.ink, fontWeight: '700', textAlign: 'right' },

  noteText: { fontSize: 12.5, lineHeight: 19, color: palette.inkSoft },
});
