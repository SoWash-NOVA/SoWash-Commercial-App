// src/components/GenerationCentre.tsx
//
// (Shared by app/generation/index.tsx for a client and app/generation/staff.tsx for office staff.)
//
// The Generation centre. The client picks a Day, a Week or a Month - only periods that have a PUBLISHED report are offered
// (the pickers are built from GET /customer-portal/generation/calendar) - and the screen shows that period as an interactive
// dashboard. "View report" opens the iNOVAA HTML report for exactly that selection, inside the app (app/generation/view.tsx);
// this replaces the report the team used to email by hand. Published reports are still listed at the bottom.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, FileText, Sun } from 'lucide-react-native';
import { styles, palette } from '../theme';
import { useAccent } from '../theme-context';
import { tc, keep } from '../themeEngine';
import { HEADER_GRADIENT } from '../brand';
import { GenerationScope, useGenerationCalendar, useGenerationRange, useGenerationReports } from '../hooks';
import PageHeader from '../components/PageHeader';
import GenerationDashboard from '../components/GenerationDashboard';
import { fmt, num } from '../components/GenerationParts';

type Mode = 'day' | 'week' | 'month';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// dates are handled as plain YYYY-MM-DD strings / UTC parts, never through the phone's timezone
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const toIso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const utc = (iso: string) => { const [y, m, d] = parts(iso); return Date.UTC(y, m - 1, d); };
const addDays = (iso: string, n: number) => { const t = new Date(utc(iso) + n * 86400000); return toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
const mondayOf = (iso: string) => { const dow = (new Date(utc(iso)).getUTCDay() + 6) % 7; return addDays(iso, -dow); };
const lastOfMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return toIso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()); };
const longDay = (iso: string) => { const [y, m, d] = parts(iso); return `${d} ${MONTHS[m - 1]} ${y}`; };
const shortDay = (iso: string) => { const [, m, d] = parts(iso); return `${d} ${MON3[m - 1]}`; };
const monthName = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

const GRADIENT = HEADER_GRADIENT.colors as unknown as [string, string, ...string[]];
const GRADIENT_AT = HEADER_GRADIENT.locations as unknown as [number, number, ...number[]];

export default function GenerationCentre({ scope = 'client' }: { scope?: GenerationScope }) {
  const staff = scope === 'staff';
  const router = useRouter();
  const { accent } = useAccent();
  const insets = useSafeAreaInsets();
  const [clientId, setClientId] = useState<number | null>(null); // staff: one client, or null = all clients
  const cal = useGenerationCalendar(scope, clientId);
  const days = useMemo(() => cal.data?.days ?? [], [cal.data]);

  const [mode, setMode] = useState<Mode>('month');
  const [selMonth, setSelMonth] = useState('');
  const [selWeek, setSelWeek] = useState('');
  const [selDay, setSelDay] = useState('');
  const [calMonth, setCalMonth] = useState('');

  // what exists: per day, and rolled up into weeks and months
  const { dayMap, months, weeks, latest } = useMemo(() => {
    const dm = new Map<string, { kwh: number; pr: number | null }>();
    const mm = new Map<string, number>();
    const wm = new Map<string, number>();
    for (const d of days) {
      const kwh = num(d.kwh) ?? 0;
      dm.set(d.date, { kwh, pr: num(d.pr) });
      mm.set(d.date.slice(0, 7), (mm.get(d.date.slice(0, 7)) ?? 0) + kwh);
      const w = mondayOf(d.date);
      wm.set(w, (wm.get(w) ?? 0) + kwh);
    }
    return {
      dayMap: dm,
      months: [...mm.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, kwh]) => ({ key: k, kwh })),
      weeks: [...wm.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, kwh]) => ({ key: k, kwh })),
      latest: days.length ? days[days.length - 1].date : '',
    };
  }, [days]);

  // another client chosen: start again from that client's newest published day
  useEffect(() => {
    setSelMonth('');
  }, [clientId]);

  // open on the newest published day
  useEffect(() => {
    if (!latest || selMonth) return;
    setSelMonth(latest.slice(0, 7));
    setSelWeek(mondayOf(latest));
    setSelDay(latest);
    setCalMonth(latest.slice(0, 7));
  }, [latest, selMonth]);

  const range = useMemo(() => {
    if (mode === 'day' && selDay) return { from: selDay, to: selDay, label: longDay(selDay) };
    if (mode === 'week' && selWeek) {
      const end = addDays(selWeek, 6);
      return { from: selWeek, to: end, label: `${shortDay(selWeek)} – ${shortDay(end)} ${parts(end)[0]}` };
    }
    if (mode === 'month' && selMonth) return { from: `${selMonth}-01`, to: lastOfMonth(selMonth), label: monthName(selMonth) };
    return { from: '', to: '', label: '' };
  }, [mode, selDay, selWeek, selMonth]);

  const data = useGenerationRange(range.from, range.to, scope, clientId);
  const plants = data.data?.plants ?? [];
  const hasData = plants.some((p) => p.days.length > 0);

  const openReport = () =>
    router.push({ pathname: '/generation/view', params: { from: range.from, to: range.to, label: range.label, scope, client_id: clientId ? String(clientId) : '' } } as never);
  const refreshing = cal.refreshing || data.refreshing;
  const onRefresh = () => { void cal.refresh(); void data.refresh(); };

  return (
    <View style={styles.screen}>
      <PageHeader title="Generation & PR" subtitle={staff ? 'All clients · pick a day, week or month' : 'Pick a day, week or month'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />

      <ScrollView
        contentContainerStyle={[local.content, { paddingBottom: 130 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {cal.loading && !cal.data ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
        ) : cal.error && !cal.data ? (
          <View style={local.empty}>
            <CircleAlert size={22} color={palette.danger} />
            <Text style={local.emptyTitle}>Could not load</Text>
            <Text style={local.emptyBody}>{cal.error}</Text>
          </View>
        ) : days.length === 0 ? (
          <View style={local.empty}>
            <Sun size={24} color={palette.mutedLight} />
            <Text style={local.emptyTitle}>No reports published yet</Text>
            <Text style={local.emptyBody}>Your generation reports appear here as soon as SoWash publishes them.</Text>
          </View>
        ) : (
          <>
            {/* ── staff: which client ── */}
            {staff && (cal.data?.clients?.length ?? 0) > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <ChipRow
                  items={[{ key: 'all', title: 'All clients', sub: `${cal.data?.clients?.length ?? 0} clients` }, ...(cal.data?.clients ?? []).map((c) => ({ key: String(c.id), title: c.name, sub: '' }))]}
                  value={clientId ? String(clientId) : 'all'}
                  onPick={(k) => setClientId(k === 'all' ? null : Number(k))}
                  accent={accent}
                />
              </View>
            ) : null}

            {/* ── Day / Week / Month ── */}
            <View style={local.seg}>
              {(['day', 'week', 'month'] as Mode[]).map((m) => {
                const on = mode === m;
                return (
                  <TouchableOpacity key={m} onPress={() => setMode(m)} activeOpacity={0.85} style={local.segItem}>
                    {on ? <LinearGradient colors={GRADIENT} locations={GRADIENT_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={local.segFill} /> : null}
                    <Text style={[local.segText, on && { color: keep('#fff') }]}>{m === 'day' ? 'Day' : m === 'week' ? 'Week' : 'Month'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── the picker: only periods that have published data ── */}
            {mode === 'month' ? (
              <ChipRow
                items={months.map((m) => ({ key: m.key, title: `${MON3[parts(`${m.key}-01`)[1] - 1]} ${parts(`${m.key}-01`)[0]}`, sub: `${fmt(m.kwh)} kWh` }))}
                value={selMonth}
                onPick={setSelMonth}
                accent={accent}
              />
            ) : null}
            {mode === 'week' ? (
              <ChipRow
                items={weeks.map((w) => ({ key: w.key, title: `${parts(w.key)[2]} ${MON3[parts(w.key)[1] - 1]} – ${shortDay(addDays(w.key, 6))}`, sub: `${fmt(w.kwh)} kWh` }))}
                value={selWeek}
                onPick={setSelWeek}
                accent={accent}
              />
            ) : null}
            {mode === 'day' ? (
              <DayCalendar
                month={calMonth}
                months={months.map((m) => m.key).sort()}
                onMonth={setCalMonth}
                dayMap={dayMap}
                selected={selDay}
                onPick={setSelDay}
                accent={accent}
              />
            ) : null}

            <View style={local.summary}>
              <CalendarDays size={15} color={accent} />
              <Text style={local.summaryText}>{range.label}</Text>
            </View>

            {/* ── the selected period ── */}
            {data.loading && !data.data ? (
              <ActivityIndicator style={{ marginTop: 30 }} color={accent} />
            ) : data.error && !data.data ? (
              <View style={local.empty}>
                <CircleAlert size={22} color={palette.danger} />
                <Text style={local.emptyTitle}>Could not load this period</Text>
                <Text style={local.emptyBody}>{data.error}</Text>
              </View>
            ) : !hasData ? (
              <View style={local.empty}>
                <Sun size={22} color={palette.mutedLight} />
                <Text style={local.emptyTitle}>No published data in this period</Text>
                <Text style={local.emptyBody}>Choose another {mode}.</Text>
              </View>
            ) : (
              <GenerationDashboard plants={plants} inverters={data.data?.inverters ?? []} periodLabel={range.label} accent={accent} staff={staff} />
            )}

            {/* ── published reports (each opens its own detail) - a client's own list ── */}
            {!staff ? <PublishedReports accent={accent} /> : null}
          </>
        )}
      </ScrollView>

      {/* ── the action: the iNOVAA report for exactly this selection ── */}
      {hasData ? (
        <View style={[local.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity onPress={openReport} activeOpacity={0.9} style={{ flex: 1 }}>
            <LinearGradient colors={GRADIENT} locations={GRADIENT_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={local.cta}>
              <FileText size={18} color={keep('#fff')} />
              <Text style={local.ctaText}>View report · {range.label}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function PublishedReports({ accent }: { accent: string }) {
  const router = useRouter();
  const reports = useGenerationReports();
  const published = reports.data?.reports ?? [];
  if (published.length === 0) return null;
  return (
    <>
      <Text style={local.sectionTitle}>PUBLISHED REPORTS</Text>
      {published.slice(0, 20).map((rep) => (
        <TouchableOpacity key={rep.id} style={[styles.card, local.reportRow]} onPress={() => router.push(`/generation/report/${rep.id}` as never)}>
          <View style={[local.reportIcon, { backgroundColor: `${accent}18` }]}>
            <FileText size={18} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={local.reportTitle} numberOfLines={1}>{rep.title}</Text>
            <Text style={local.reportMeta} numberOfLines={1}>{rep.period_label || '—'}</Text>
          </View>
          <ChevronRight size={18} color={tc(palette.mutedLight)} />
        </TouchableOpacity>
      ))}
    </>
  );
}

function ChipRow({ items, value, onPick, accent }: { items: { key: string; title: string; sub: string }[]; value: string; onPick: (k: string) => void; accent: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onPick(it.key)}
            activeOpacity={0.85}
            style={[local.chip, on && { backgroundColor: accent, borderColor: accent }]}
          >
            <Text style={[local.chipTitle, on && { color: keep('#fff') }]}>{it.title}</Text>
            <Text style={[local.chipSub, on && { color: keep('#EAF6FF') }]}>{it.sub}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** Month grid; a day with published data is filled (stronger = more energy), the rest are greyed and cannot be picked. */
function DayCalendar({ month, months, onMonth, dayMap, selected, onPick, accent }: {
  month: string; months: string[]; onMonth: (m: string) => void; dayMap: Map<string, { kwh: number; pr: number | null }>;
  selected: string; onPick: (d: string) => void; accent: string;
}) {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const idx = months.indexOf(month);
  const max = Math.max(1, ...[...dayMap.entries()].filter(([k]) => k.startsWith(month)).map(([, v]) => v.kwh));
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <View style={[styles.card, { padding: 12 }]}>
      <View style={local.calHead}>
        <TouchableOpacity onPress={() => idx > 0 && onMonth(months[idx - 1])} disabled={idx <= 0} hitSlop={10}>
          <ChevronLeft size={22} color={idx <= 0 ? tc(palette.borderSubtle) : tc(palette.ink)} />
        </TouchableOpacity>
        <Text style={local.calTitle}>{monthName(month)}</Text>
        <TouchableOpacity onPress={() => idx < months.length - 1 && onMonth(months[idx + 1])} disabled={idx >= months.length - 1} hitSlop={10}>
          <ChevronRight size={22} color={idx >= months.length - 1 ? tc(palette.borderSubtle) : tc(palette.ink)} />
        </TouchableOpacity>
      </View>
      <View style={local.calRow}>
        {WEEKDAYS.map((w, i) => <Text key={i} style={local.calDow}>{w}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={local.calRow}>
          {cells.slice(r * 7, r * 7 + 7).map((d, c) => {
            if (!d) return <View key={c} style={local.calCell} />;
            const iso = toIso(y, m, d);
            const info = dayMap.get(iso);
            const on = iso === selected;
            const strength = info ? 0.18 + 0.5 * (info.kwh / max) : 0;
            return (
              <TouchableOpacity key={c} disabled={!info} onPress={() => onPick(iso)} activeOpacity={0.8} style={local.calCell}>
                <View style={[local.calDay, info ? { backgroundColor: on ? accent : `${accent}${Math.round(strength * 255).toString(16).padStart(2, '0')}` } : null]}>
                  <Text style={[local.calNum, !info && { color: tc(palette.borderSubtle) }, info && { color: palette.ink, fontWeight: '800' }, on && { color: keep('#fff') }]}>{d}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <Text style={local.calHint}>Coloured days have a published report</Text>
    </View>
  );
}

const local = StyleSheet.create({
  content: { padding: 16 },
  seg: { flexDirection: 'row', backgroundColor: palette.surface, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: palette.border, marginBottom: 12 },
  segItem: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  segFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 },
  segText: { fontSize: 14, fontWeight: '800', color: palette.muted },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', minWidth: 96 },
  chipTitle: { fontSize: 13.5, fontWeight: '800', color: palette.ink },
  chipSub: { fontSize: 11, fontWeight: '700', color: palette.muted, marginTop: 2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 12 },
  summaryText: { fontSize: 15, fontWeight: '800', color: palette.ink },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  calTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  calRow: { flexDirection: 'row' },
  calDow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: palette.mutedLight, paddingVertical: 4 },
  calCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDay: { width: '100%', height: '100%', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calNum: { fontSize: 13, fontWeight: '600', color: palette.muted },
  calHint: { fontSize: 11, fontWeight: '600', color: palette.mutedLight, textAlign: 'center', marginTop: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: palette.mutedLight, marginTop: 24, marginBottom: 10 },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  reportIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reportTitle: { fontSize: 14, fontWeight: '800', color: palette.ink },
  reportMeta: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.borderSubtle, flexDirection: 'row' },
  cta: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { fontSize: 15, fontWeight: '800', color: keep('#fff') },
});
