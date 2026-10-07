// src/components/JobDetailBody.tsx
//
// Everything about one service visit, as a scrollable body: where and when (with the same
// facts the staff Jobs sheet shows — service #, crew lead, approval, priority, panels cleaned),
// how far it got, the before/after/TBT photos, who from the crew clocked in and out
// (attendance), and the field service report the crew filed.
//
// TBT photos come from job.tbt_photos when the backend sends them, otherwise from the
// client's own /documentation/tbt list filtered to this visit. Attendance only exists when
// the backend patch docs/backend-patches/2026-10-07-client-visit-attendance.md is deployed;
// until then that section simply doesn't render.
//
// Lifted verbatim out of app/job/[id].tsx when the chat gained a "view
// details" popup. Both now render THIS — the screen wraps it in a route, the
// popup wraps it in a Modal. Two copies of a five-section job report would
// drift within a week, and a customer reading the same visit in two places
// would be shown two different things.
//
// Two facts from the endpoint that this component has to respect:
//   • before_photos / after_photos are text columns holding JSON arrays, so
//     they go through photoUrls() — never straight into <Image>.
//   • a blank FSR field means "not inspected", so blanks are dropped rather
//     than rendered as a dash. A dash beside real findings reads as "checked,
//     nothing wrong", which is a claim nobody made.
//
// The walkthrough card does NOT replace the photo grid. They are different
// photo sets: commercial_sld_point_photos is what the crew shot at each point
// on the diagram, site_schedules.before_photos is the visit's general
// coverage. The web portal swaps one for the other; doing that here would hide
// photos.

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Footprints,
  ImageOff,
  MapPin,
  User,
  UserCheck,
} from 'lucide-react-native';
import { styles, palette } from '../theme';
// Read here rather than threaded down as a prop: both callers already sit
// under the provider, and the screen used to pass it through two layers.
import { useAccent } from '../theme-context';
import { photoUrl, photoUrls } from '../api/client';
import { PhotoStripList, PhotoStripSkeleton, PhotoThumb, useAfterOpen } from './PhotoStripList';
import { JobDetail, StaffAttendanceRecord } from '../api/types';
import { formatDateOnly, formatDateTime, statusMeta, stageIndex, STAGES, useTbtPhotos } from '../hooks';

/** "approved" → "Approved", "in_progress" → "In progress". */
function titleCase(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const t = String(v).replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface Props {
  job: JobDetail;
  /**
   * How many diagram points have a photo. 0 hides the walkthrough card
   * entirely — see useSldWalkthrough/sldHasWalk in hooks.ts, and note that
   * /detail does NOT carry has_sld_walkthrough.
   */
  walkPoints?: number;
  /** Omitted by the popup when it has nowhere to navigate to. */
  onWalk?: () => void;
}

export default function JobDetailBody({ job, walkPoints = 0, onWalk }: Props) {
  return (
    <>
      <Header job={job} />
      <Timeline job={job} />
      {walkPoints > 0 && onWalk ? <WalkCard count={walkPoints} onPress={onWalk} /> : null}
      <Photos job={job} />
      <Attendance records={job.attendance} />
      <Findings job={job} />
    </>
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

      {/* the same facts the staff Jobs sheet shows; empty ones are left out */}
      <View style={local.factGrid}>
        <Fact icon={<CalendarDays size={12} color={palette.mutedLight} />} label="Scheduled" value={formatDateOnly(job.scheduled_date)} />
        <Fact icon={<Clock size={12} color={palette.mutedLight} />} label="Service #" value={job.service_number ? String(job.service_number) : null} />
        <Fact icon={<User size={12} color={palette.mutedLight} />} label="Crew lead" value={job.team_lead_name} />
        <Fact label="Approval" value={titleCase(job.approval_status)} />
        <Fact label="Priority" value={titleCase(job.priority)} />
        <Fact
          label="Panels cleaned"
          value={job.total_panels_cleaned != null && String(job.total_panels_cleaned).trim() !== '' ? String(job.total_panels_cleaned) : null}
        />
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

function Fact({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={local.fact}>
      <View style={local.factTop}>
        {icon}
        <Text style={local.factCellLabel}>{label}</Text>
      </View>
      <Text style={local.factCellValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ── timeline ────────────────────────────────────────────────────────── */

function Timeline({ job }: { job: JobDetail }) {
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

function WalkCard({ count, onPress }: { count: number; onPress: () => void }) {
  const { accent } = useAccent();
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

/**
 * This visit's toolbox-talk photos: from the detail response when the backend includes them,
 * otherwise from the client's own TBT list (/documentation/tbt, completed + approved visits),
 * filtered to this schedule.
 */
function useVisitTbt(job: JobDetail): { urls: string[]; at: string | null } {
  const fromDetail = job.tbt_photos;
  const list = useTbtPhotos(job.site_id ?? null);
  return useMemo(() => {
    if (fromDetail) {
      const urls = fromDetail.map((p) => photoUrl(p.photo_url)).filter((u): u is string => !!u);
      return { urls, at: fromDetail[0]?.captured_at ?? null };
    }
    const entry = list.data?.jobs?.find((j) => j.schedule_id === job.schedule_id);
    if (!entry) return { urls: [], at: null };
    const urls = entry.photos.map((p) => photoUrl(p.photo_url)).filter((u): u is string => !!u);
    return { urls, at: entry.photos[0]?.captured_at ?? null };
  }, [fromDetail, list.data, job.schedule_id]);
}

function Photos({ job }: { job: JobDetail }) {
  const before = photoUrls(job.before_photos);
  const after = photoUrls(job.after_photos);
  const tbt = useVisitTbt(job);
  // Text first, photos a beat later — so opening the report (or its popup) isn't competing with a
  // pile of downloads and decodes while it animates in. See src/components/PhotoStripList.tsx.
  const ready = useAfterOpen(160);

  if (before.length === 0 && after.length === 0 && tbt.urls.length === 0) {
    return (
      <View style={[styles.card, { marginTop: 16, alignItems: 'center', gap: 6 }]}>
        <ImageOff size={22} color={palette.mutedLight} />
        <Text style={detailStyles.emptyTitle}>No photos</Text>
        <Text style={detailStyles.emptyBody}>The crew had not uploaded photos for this visit.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { marginTop: 16 }]}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>PHOTOS</Text>
      {before.length > 0 ? (
        <PhotoStrip title="Before" urls={before} at={job.before_photos_at} ready={ready} />
      ) : null}
      {after.length > 0 ? <PhotoStrip title="After" urls={after} at={job.after_photos_at} ready={ready} /> : null}
      {tbt.urls.length > 0 ? <PhotoStrip title="Toolbox talk (TBT)" urls={tbt.urls} at={tbt.at} ready={ready} /> : null}
    </View>
  );
}

/* ── attendance ──────────────────────────────────────────────────────── */

/** "2h 35m" between two timestamps, or null. */
function duration(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function Attendance({ records }: { records: StaffAttendanceRecord[] | undefined }) {
  const ready = useAfterOpen(160);
  if (!records || records.length === 0) return null;
  return (
    <View style={[styles.card, { marginTop: 16 }]}>
      <Text style={[styles.cardTitle, { marginBottom: 10 }]}>ATTENDANCE · {records.length} ON SITE</Text>
      {records.map((a, i) => {
        const inPhoto = photoUrl(a.clock_in_image_url);
        const outPhoto = photoUrl(a.clock_out_image_url);
        const worked = duration(a.clock_in_at, a.clock_out_at);
        return (
          <View key={`${a.fo_name}-${i}`} style={[local.attRow, i === records.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={local.attTop}>
                <UserCheck size={14} color={palette.muted} />
                <Text style={local.attName} numberOfLines={1}>
                  {a.fo_name}
                </Text>
                {a.status ? <Text style={local.attStatus}>{titleCase(a.status)}</Text> : null}
              </View>
              <Text style={local.attTimes}>
                In {formatDateTime(a.clock_in_at)}
                {a.clock_out_at ? `  ·  Out ${formatDateTime(a.clock_out_at)}` : '  ·  still on site'}
              </Text>
              {worked ? <Text style={local.attWorked}>On site {worked}</Text> : null}
            </View>
            {ready && (inPhoto || outPhoto) ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {inPhoto ? <PhotoThumb url={inPhoto} width={40} height={40} radius={10} priority="low" /> : null}
                {outPhoto ? <PhotoThumb url={outPhoto} width={40} height={40} radius={10} priority="low" /> : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function PhotoStrip({
  title,
  urls,
  at,
  ready,
}: {
  title: string;
  urls: string[];
  at: string | null;
  ready: boolean;
}) {
  const { width } = useWindowDimensions();
  // Two-up on a phone, leaving room for the card padding and the gap.
  const size = Math.max(120, (width - 40 - 40 - 10) / 2);
  const height = size * 0.75;

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={local.stripHeader}>
        <Text style={local.stripTitle}>{title}</Text>
        <Text style={local.stripMeta}>
          {urls.length} · {at ? formatDateTime(at) : '—'}
        </Text>
      </View>
      {/* Virtualised: only the photos on/near the screen load; the first two get priority;
          a failed one shows tap-to-retry. */}
      {ready ? (
        <PhotoStripList urls={urls} width={size} height={height} gap={10} radius={14} />
      ) : (
        <PhotoStripSkeleton width={size} height={height} radius={14} />
      )}
    </View>
  );
}

/* ── field service report ────────────────────────────────────────────── */

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
        <View
          key={String(r.key)}
          style={[
            local.factRow,
            i === rows.length - 1 && !job.additional_notes && { borderBottomWidth: 0 },
          ]}
        >
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

/**
 * The centred loading / empty look, shared by the detail SCREEN and the chat
 * POPUP so "not available yet" reads the same in both.
 */
export const detailStyles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});

const local = StyleSheet.create({
  site: { fontSize: 18, fontWeight: '900', color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { flex: 1, fontSize: 12.5, color: palette.muted, fontWeight: '600' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  pillText: { fontSize: 10, fontWeight: '800' },
  factGrid: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
    paddingTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  fact: { width: '50%', paddingRight: 8 },
  factTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factCellLabel: { fontSize: 10.5, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.3 },
  factCellValue: { fontSize: 13.5, fontWeight: '800', color: palette.ink, marginTop: 2 },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  attTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attName: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: palette.ink },
  attStatus: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.muted,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  attTimes: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 3 },
  attWorked: { fontSize: 11.5, fontWeight: '700', color: palette.mutedLight, marginTop: 2 },
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
});
