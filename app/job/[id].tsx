// app/job/[id].tsx
//
// One service visit in full: where and when, how far along it got, the
// before/after photos, and the field service report the crew filed.
//
// Two things the endpoint does that this screen has to respect:
//   • it returns 404 for a job that is neither approved nor scheduled today,
//     so "not found" here usually means "not approved yet", and the empty
//     state says so rather than implying the job does not exist.
//   • before_photos / after_photos are text columns holding JSON arrays, so
//     they go through photoUrls() — never straight into <Image>.
//
// The walkthrough entry is decided by fetching /sld/:schedule_id, NOT by
// job.has_sld_walkthrough — that flag is computed only in /history's SELECT and
// does not exist on this payload (see the Omit on JobDetail in api/types.ts).
// It costs one small extra request per visit and needs no backend change.
//
// The walkthrough does not replace the photo grid below it. They are different
// photo sets: commercial_sld_point_photos is what the crew shot at each point
// on the diagram, site_schedules.before_photos is the visit's general coverage.
// The web portal swaps one for the other; doing that here would hide photos.

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Footprints,
  ImageOff,
  MapPin,
  User,
} from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import {
  useJobDetail,
  useSldWalkthrough,
  sldHasWalk,
  formatDateOnly,
  formatDateTime,
  statusMeta,
  stageIndex,
  STAGES,
} from '../../src/hooks';
import { photoUrls } from '../../src/api/client';
import { JobDetail } from '../../src/api/types';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accent } = useAccent();
  const { data, loading, error, refreshing, refresh } = useJobDetail(id ?? null);
  const { data: sld } = useSldWalkthrough(id ?? null);

  const job = data?.job;
  const walkPoints = sldHasWalk(sld)
    ? (sld?.points ?? []).filter((p) => p.before_url || p.after_url).length
    : 0;

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Visit details</Text>
      </View>

      {loading && !data ? (
        <View style={local.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : !job ? (
        <View style={local.centre}>
          <CircleAlert size={26} color={palette.mutedLight} />
          <Text style={local.emptyTitle}>Not available</Text>
          <Text style={local.emptyBody}>
            {error ||
              'This visit is not available yet. Completed visits appear once CI admin has approved them.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
          }
        >
          <Header job={job} />
          <Timeline job={job} accent={accent} />
          {walkPoints > 0 ? (
            <WalkCard
              count={walkPoints}
              accent={accent}
              onPress={() =>
                router.push({
                  pathname: '/walkthrough/[id]',
                  params: { id: String(id), site: job.site_name ?? '' },
                })
              }
            />
          ) : null}
          <Photos job={job} />
          <Findings job={job} />
        </ScrollView>
      )}
    </View>
  );
}

/* ── header ──────────────────────────────────────────────────────────── */

function Header({ job }: { job: JobDetail }) {
  const meta = statusMeta(job.status);
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={local.site}>{job.site_name || 'Site'}</Text>
          {job.address ? (
            <View style={local.metaRow}>
              <MapPin size={12} color={palette.mutedLight} />
              <Text style={local.meta} numberOfLines={2}>
                {[job.address, job.city, job.state].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[local.pill, { backgroundColor: meta.bg }]}>
          <Text style={[local.pillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={local.headerFacts}>
        <View style={local.metaRow}>
          <CalendarDays size={12} color={palette.mutedLight} />
          <Text style={local.meta}>{formatDateOnly(job.scheduled_date)}</Text>
        </View>
        {job.team_lead_name ? (
          <View style={local.metaRow}>
            <User size={12} color={palette.mutedLight} />
            <Text style={local.meta}>{job.team_lead_name}</Text>
          </View>
        ) : null}
        {job.service_number ? (
          <View style={local.metaRow}>
            <Clock size={12} color={palette.mutedLight} />
            <Text style={local.meta}>Service #{job.service_number}</Text>
          </View>
        ) : null}
      </View>

      {job.reschedule_reason ? (
        <View style={local.note}>
          <Text style={local.noteLabel}>RESCHEDULED</Text>
          <Text style={local.noteText}>
            {job.reschedule_reason}
            {job.original_date ? ` (originally ${formatDateOnly(job.original_date)})` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ── timeline ────────────────────────────────────────────────────────── */

function Timeline({ job, accent }: { job: JobDetail; accent: string }) {
  const reached = stageIndex(job);
  const times = [
    job.scheduled_date ? formatDateOnly(job.scheduled_date) : null,
    formatDateTime(job.started_at),
    formatDateTime(job.before_photos_at),
    formatDateTime(job.after_photos_at),
    formatDateTime(job.completed_at),
  ];

  return (
    <View style={[styles.card, { marginTop: 16 }]}>
      <Text style={[styles.cardTitle, { marginBottom: 14 }]}>PROGRESS</Text>
      {STAGES.map((stage, i) => {
        const done = i < reached;
        const isLast = i === STAGES.length - 1;
        return (
          <View key={stage} style={local.stageRow}>
            <View style={local.stageRail}>
              <View style={[local.dot, done && { backgroundColor: accent, borderColor: accent }]} />
              {!isLast ? (
                <View style={[local.rail, done && i + 1 < reached && { backgroundColor: accent }]} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
              <Text style={[local.stageLabel, done && { color: palette.ink }]}>{stage}</Text>
              <Text style={local.stageTime}>{done ? times[i] || '—' : 'Pending'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ── walkthrough entry ───────────────────────────────────────────────── */

function WalkCard({
  count,
  accent,
  onPress,
}: {
  count: number;
  accent: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.card, { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
    >
      <View style={[local.walkIcon, { backgroundColor: `${accent}18` }]}>
        <Footprints size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={local.walkTitle}>Walk the site</Text>
        <Text style={local.walkBody}>
          {count} {count === 1 ? 'point' : 'points'} on the single-line diagram, photographed before
          and after
        </Text>
      </View>
      <ChevronRight size={18} color={palette.mutedLight} />
    </TouchableOpacity>
  );
}

/* ── photos ──────────────────────────────────────────────────────────── */

function Photos({ job }: { job: JobDetail }) {
  const before = photoUrls(job.before_photos);
  const after = photoUrls(job.after_photos);

  if (before.length === 0 && after.length === 0) {
    return (
      <View style={[styles.card, { marginTop: 16, alignItems: 'center', gap: 6 }]}>
        <ImageOff size={22} color={palette.mutedLight} />
        <Text style={local.emptyTitle}>No photos</Text>
        <Text style={local.emptyBody}>
          The crew had not uploaded photos for this visit.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { marginTop: 16 }]}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>PHOTOS</Text>
      {before.length > 0 ? <PhotoStrip title="Before" urls={before} at={job.before_photos_at} /> : null}
      {after.length > 0 ? <PhotoStrip title="After" urls={after} at={job.after_photos_at} /> : null}
    </View>
  );
}

function PhotoStrip({
  title,
  urls,
  at,
}: {
  title: string;
  urls: string[];
  at: string | null;
}) {
  const { width } = useWindowDimensions();
  // Two-up on a phone, leaving room for the card padding and the gap.
  const size = Math.max(120, (width - 40 - 40 - 10) / 2);

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={local.stripHeader}>
        <Text style={local.stripTitle}>{title}</Text>
        <Text style={local.stripMeta}>
          {urls.length} · {at ? formatDateTime(at) : '—'}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {urls.map((url) => (
          <Image
            key={url}
            source={{ uri: url }}
            style={{ width: size, height: size * 0.75, borderRadius: 14, backgroundColor: '#f1f5f9' }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
    </View>
  );
}

/* ── field service report ────────────────────────────────────────────── */

/**
 * Only rows the crew actually filled in are shown. A blank FSR field means
 * "not inspected", and rendering it as a dash next to real findings reads as
 * "checked, nothing wrong" — which would be a claim nobody made.
 */
const FINDINGS: { key: keyof JobDetail; label: string }[] = [
  { key: 'panel_damage', label: 'Panel damage' },
  { key: 'panel_brand', label: 'Panel brand' },
  { key: 'cable_condition', label: 'Cable condition' },
  { key: 'cable_quantity', label: 'Cable quantity' },
  { key: 'inverter_alarm', label: 'Inverter alarm' },
  { key: 'alarm_code', label: 'Alarm code' },
  { key: 'potential_shading', label: 'Shading' },
  { key: 'shading_details', label: 'Shading details' },
  { key: 'rusting', label: 'Rusting' },
  { key: 'bird_dropping', label: 'Bird droppings' },
  { key: 'mos_and_debris', label: 'Moss and debris' },
  { key: 'earthing', label: 'Earthing' },
];

function Findings({ job }: { job: JobDetail }) {
  const rows = FINDINGS.map((f) => ({ ...f, value: job[f.key] })).filter(
    (r) => r.value !== null && r.value !== undefined && String(r.value).trim() !== '',
  );

  if (rows.length === 0 && !job.additional_notes && !job.notes) return null;

  return (
    <View style={[styles.card, { marginTop: 16, marginBottom: 8 }]}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>WHAT THE CREW FOUND</Text>

      {rows.map((r, i) => (
        <View key={String(r.key)} style={[local.factRow, i === rows.length - 1 && !job.additional_notes && { borderBottomWidth: 0 }]}>
          <Text style={local.factLabel}>{r.label}</Text>
          <Text style={local.factValue}>{String(r.value)}</Text>
        </View>
      ))}

      {job.additional_notes ? (
        <View style={local.note}>
          <Text style={local.noteLabel}>CREW NOTES</Text>
          <Text style={local.noteText}>{job.additional_notes}</Text>
        </View>
      ) : null}

      {job.notes ? (
        <View style={local.note}>
          <Text style={local.noteLabel}>SCHEDULE NOTES</Text>
          <Text style={local.noteText}>{job.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  site: { fontSize: 18, fontWeight: '900', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { flex: 1, fontSize: 12.5, color: palette.muted, fontWeight: '600' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  pillText: { fontSize: 10, fontWeight: '800' },
  headerFacts: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
    paddingTop: 10,
    gap: 2,
  },
  stageRow: { flexDirection: 'row', gap: 12 },
  stageRail: { alignItems: 'center', width: 14 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  rail: { flex: 1, width: 2, backgroundColor: palette.borderSubtle, marginTop: 2 },
  stageLabel: { fontSize: 13.5, fontWeight: '800', color: palette.mutedLight, marginTop: -2 },
  stageTime: { fontSize: 11.5, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },
  walkIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  walkTitle: { fontSize: 15, fontWeight: '900', color: palette.ink },
  walkBody: { fontSize: 12.5, lineHeight: 17, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stripTitle: { fontSize: 13, fontWeight: '800', color: palette.ink },
  stripMeta: { fontSize: 11, fontWeight: '600', color: palette.mutedLight },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  factLabel: { fontSize: 12.5, fontWeight: '700', color: palette.mutedLight, flex: 1 },
  factValue: { fontSize: 13, fontWeight: '700', color: palette.ink, flex: 1, textAlign: 'right' },
  note: { marginTop: 12, backgroundColor: '#f8fafc', borderRadius: 14, padding: 12 },
  noteLabel: { fontSize: 9.5, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.8 },
  noteText: { fontSize: 13, lineHeight: 19, color: palette.inkSoft, marginTop: 4, fontWeight: '600' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});
