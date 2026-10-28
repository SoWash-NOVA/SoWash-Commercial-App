// src/components/GenerationParts.tsx
//
// The building blocks of the Generation & PR screens (the period centre, a published report's detail): PR dial, interactive donut,
// scrub-able stacked bars, PR lines, day table, inverter cards with the production-curve picture, and the per-plant block.
// Everything is react-native-svg + plain views (no chart library), and every neutral colour goes through tc() so dark mode works.

import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Zap } from 'lucide-react-native';
import { styles, palette } from '../theme';
import { tc, keep } from '../themeEngine';
import { SERVER_BASE, getToken } from '../api/client';
import { GenerationReportDay, GenerationReportInverter } from '../api/types';

export const PR_TARGET = 80;
export const PLANT_COLORS = ['#3B82F6', '#22D3A5', '#F59E0B', '#A78BFA', '#F472B6', '#38BDF8', '#FB7185', '#84CC16'];
export const INV_COLORS = ['#38BDF8', '#F59E0B', '#A78BFA', '#F472B6'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const fmt = (n: number | null, d = 0) =>
  n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
export const dayLabel = (iso: string | null, fallback = '') => {
  if (!iso) return fallback;
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
export const prTone = (v: number | null) =>
  v === null ? palette.muted : v >= 85 ? palette.good : v >= PR_TARGET ? '#4ADE80' : v >= 70 ? palette.warn : palette.danger;

/* ───────────────────────────── PR dial ───────────────────────────── */

export function Ring({ value, size, stroke, color, track, label, sub, light }: {
  value: number | null; size: number; stroke: number; color: string; track: string; label: string; sub?: string; light?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const ang = (PR_TARGET / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${cx}, ${cx}`}>
          <Circle cx={cx} cy={cx} r={r} stroke={track} strokeWidth={stroke} fill="none" />
          <Circle cx={cx} cy={cx} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - v / 100)} />
        </G>
        <Line
          x1={cx + (r - stroke) * Math.cos(ang)} y1={cx + (r - stroke) * Math.sin(ang)}
          x2={cx + (r + stroke * 0.7) * Math.cos(ang)} y2={cx + (r + stroke * 0.7) * Math.sin(ang)}
          stroke="#FBBF24" strokeWidth={2.5} strokeLinecap="round"
        />
      </Svg>
      <View style={st.ringCenter} pointerEvents="none">
        <Text style={[st.ringLabel, { color: light ? keep('#fff') : palette.ink, fontSize: size * 0.2 }]}>{label}</Text>
        {sub ? <Text style={[st.ringSub, { color: light ? keep('#EAF6FF') : palette.mutedLight }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/* ───────────────────────────── interactive donut ───────────────────────────── */

export interface Slice { key: string; name: string; value: number; color: string; sub?: string }

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1},${r1} 0 ${big} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${big} 0 ${p(r0, a0)} Z`;
}

/** Tap a slice (or its legend row) to see its figure in the middle; tap again to clear. */
export function Donut({ slices, unit = 'kWh', title }: { slices: Slice[]; unit?: string; title: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const SIZE = 190;
  const cx = SIZE / 2;
  const shown = slices.find((s) => s.key === sel);
  let a = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = total > 0 ? (s.value / total) * Math.PI * 2 : 0;
    const out = { s, a0: a, a1: a + Math.max(sweep - 0.02, 0.001) };
    a += sweep;
    return out;
  });
  return (
    <View style={[styles.card, { marginTop: 14 }]}>
      <Text style={st.chartTitle2}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE}>
            {arcs.length === 1 ? (
              <Circle cx={cx} cy={cx} r={(cx - 4 + 52) / 2} stroke={arcs[0].s.color} strokeWidth={cx - 4 - 52} fill="none" onPress={() => setSel(sel ? null : arcs[0].s.key)} />
            ) : (
              arcs.map(({ s, a0, a1 }) => (
                <Path
                  key={s.key}
                  d={arc(cx, cx, 52, s.key === sel ? cx - 1 : cx - 7, a0, a1)}
                  fill={s.color}
                  opacity={sel && s.key !== sel ? 0.35 : 1}
                  onPress={() => setSel(sel === s.key ? null : s.key)}
                />
              ))
            )}
          </Svg>
          <View style={st.ringCenter} pointerEvents="none">
            <Text style={st.donutTop}>{shown ? shown.name : 'TOTAL'}</Text>
            <Text style={st.donutValue}>{fmt(shown ? shown.value : total)}</Text>
            <Text style={st.donutSub}>{shown ? `${total ? ((shown.value / total) * 100).toFixed(1) : 0}% · ${unit}` : unit}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          {slices.map((s) => (
            <TouchableOpacity key={s.key} onPress={() => setSel(sel === s.key ? null : s.key)} style={[st.legendRow, sel === s.key && { backgroundColor: tc(palette.borderSubtle) }]} activeOpacity={0.7}>
              <View style={[st.dot, { backgroundColor: s.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={st.legendName} numberOfLines={1}>{s.name}</Text>
                {s.sub ? <Text style={st.legendSub} numberOfLines={1}>{s.sub}</Text> : null}
              </View>
              <Text style={st.legendPct}>{total ? ((s.value / total) * 100).toFixed(0) : 0}%</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────────── stacked bars you can scrub ───────────────────────────── */

export interface BarRow {
  date: string;
  parts: { key: string; name: string; color: string; kwh: number; offline: boolean }[];
  pr: number | null;
  expected: number | null;
}

/** Touch / drag across the bars to read any day: its total, each plant's share, and the PR. */
export function StackedBars({ rows }: { rows: BarRow[] }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const H = 130;
  const totals = rows.map((r) => r.parts.reduce((a, p) => a + p.kwh, 0));
  const max = Math.max(1, ...totals, ...rows.map((r) => r.expected ?? 0));
  const gap = rows.length > 40 ? 1 : 3;
  const bw = w > 0 ? Math.max(2, (w - gap * (rows.length - 1)) / rows.length) : 0;
  const hasExp = rows.some((r) => (r.expected ?? 0) > 0);
  const at = (x: number) => Math.max(0, Math.min(rows.length - 1, Math.floor((x / Math.max(w, 1)) * rows.length)));
  const cur = sel !== null ? rows[sel] : null;

  return (
    <View>
      {/* the reading for the touched day (or a hint) */}
      <View style={st.readout}>
        {cur ? (
          <>
            <Text style={st.readTitle}>{dayLabel(cur.date)} · {fmt(totals[sel as number])} kWh{cur.pr !== null ? ` · PR ${cur.pr.toFixed(1)}%` : ''}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 3 }}>
              {cur.parts.map((p) => (
                <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={[st.dot, { backgroundColor: p.offline ? palette.danger : p.color }]} />
                  <Text style={st.readPart}>{p.name} {p.offline ? 'offline' : fmt(p.kwh)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={st.readHint}>Touch and drag across the bars to read each day</Text>
        )}
      </View>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setSel(at(e.nativeEvent.locationX))}
        onResponderMove={(e) => setSel(at(e.nativeEvent.locationX))}
        onResponderRelease={() => setSel(null)}
        onResponderTerminate={() => setSel(null)}
      >
        {w > 0 ? (
          <Svg width={w} height={H + 4}>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={w} y1={H - f * (H - 8)} y2={H - f * (H - 8)} stroke={tc(palette.borderSubtle)} strokeWidth={1} />
            ))}
            {rows.map((r, i) => {
              let y = H;
              const dim = sel !== null && sel !== i;
              return (
                <G key={`${r.date}-${i}`} opacity={dim ? 0.4 : 1}>
                  {r.parts.map((p, k) => {
                    const h = p.offline ? 3 : Math.max(p.kwh > 0 ? 2 : 0, (p.kwh / max) * (H - 8));
                    y -= h;
                    return <Rect key={p.key} x={i * (bw + gap)} y={y} width={bw} height={h} rx={k === r.parts.length - 1 ? 1.5 : 0} fill={p.offline ? palette.danger : p.color} />;
                  })}
                </G>
              );
            })}
            {hasExp ? (
              <Path
                d={rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${i * (bw + gap) + bw / 2},${H - ((r.expected ?? 0) / max) * (H - 8)}`).join(' ')}
                stroke="#F59E0B" strokeWidth={1.8} strokeDasharray="4 3" fill="none"
              />
            ) : null}
            {sel !== null ? <Line x1={sel * (bw + gap) + bw / 2} x2={sel * (bw + gap) + bw / 2} y1={0} y2={H} stroke={tc(palette.ink)} strokeWidth={1} opacity={0.35} /> : null}
          </Svg>
        ) : null}
      </View>
      <View style={st.axis}>
        <Text style={st.axisText}>{dayLabel(rows[0].date)}</Text>
        <Text style={st.axisText}>peak {fmt(Math.max(...totals))} kWh</Text>
        <Text style={st.axisText}>{dayLabel(rows[rows.length - 1].date)}</Text>
      </View>
    </View>
  );
}

/* ───────────────────────────── PR lines ───────────────────────────── */

export function PrLines({ series, dates }: { series: { key: string; name: string; color: string; values: (number | null)[] }[]; dates: string[] }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const H = 120;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (all.length === 0) return <Text style={st.hint}>No PR figures in this period.</Text>;
  const top = Math.max(100, ...all);
  const n = dates.length;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 8) + 4);
  const y = (v: number) => H - (v / top) * (H - 8);
  const at = (px: number) => Math.max(0, Math.min(n - 1, Math.round(((px - 4) / Math.max(w - 8, 1)) * (n - 1))));
  return (
    <View>
      <View style={st.readout}>
        {sel !== null ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Text style={st.readTitle}>{dayLabel(dates[sel])}</Text>
            {series.map((s) => (
              <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={[st.dot, { backgroundColor: s.color }]} />
                <Text style={st.readPart}>{s.name} {s.values[sel] === null ? '—' : `${(s.values[sel] as number).toFixed(1)}%`}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={st.readHint}>Touch and drag to compare plants · dashed = {PR_TARGET}% target</Text>
        )}
      </View>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setSel(at(e.nativeEvent.locationX))}
        onResponderMove={(e) => setSel(at(e.nativeEvent.locationX))}
        onResponderRelease={() => setSel(null)}
        onResponderTerminate={() => setSel(null)}
      >
        {w > 0 ? (
          <Svg width={w} height={H + 4}>
            <Line x1={0} x2={w} y1={y(PR_TARGET)} y2={y(PR_TARGET)} stroke="#FBBF24" strokeWidth={1.5} strokeDasharray="5 4" />
            <SvgText x={w - 2} y={y(PR_TARGET) - 4} fontSize={10} fontWeight="700" fill="#FBBF24" textAnchor="end">{`${PR_TARGET}% target`}</SvgText>
            {series.map((s) => {
              const pts = s.values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
              if (pts.length === 0) return null;
              const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ');
              return (
                <G key={s.key}>
                  <Path d={d} stroke={s.color} strokeWidth={2.3} fill="none" strokeLinejoin="round" />
                  {pts.length <= 31 ? pts.map((p) => <Circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2.6} fill={s.color} />) : null}
                </G>
              );
            })}
            {sel !== null ? <Line x1={x(sel)} x2={x(sel)} y1={0} y2={H} stroke={tc(palette.ink)} strokeWidth={1} opacity={0.35} /> : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/* ───────────────────────────── day table ───────────────────────────── */

export function DayTable({ days }: { days: GenerationReportDay[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={[st.trow, { borderBottomColor: tc(palette.border) }]}>
        {['Day', 'kWh', 'PR', 'Status'].map((h, i) => <Text key={h} style={[st.th, i === 0 && { flex: 1.1 }]}>{h}</Text>)}
      </View>
      {days.map((d, i) => {
        const pr = num(d.pr_pct);
        return (
          <View key={`${d.date}-${i}`} style={st.trow}>
            <Text style={[st.td, { flex: 1.1 }]}>{dayLabel(d.date)}</Text>
            <Text style={st.td}>{fmt(num(d.yield_kwh))}</Text>
            <Text style={[st.td, { color: prTone(pr), fontWeight: '800' }]}>{pr === null ? '—' : `${pr.toFixed(1)}%`}</Text>
            <Text style={[st.td, { color: d.status === 'ONLINE' ? palette.good : palette.danger }]}>{d.status === 'ONLINE' ? 'Online' : 'Offline'}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ───────────────────────────── inverters ───────────────────────────── */

export function Inverters({ inverters, plantNames, staff }: { inverters: GenerationReportInverter[]; plantNames?: Record<number, string>; staff?: boolean }) {
  // one card per inverter; across several days the same inverter is summed and the newest day's picture is shown
  const groups = useMemo(() => {
    const m = new Map<string, GenerationReportInverter[]>();
    for (const i of inverters) {
      const k = `${i.plant_id}|${i.name}`;
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.values()].map((list) => {
      const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
      return { latest: sorted[0], list: sorted, kwh: list.reduce((a, i) => a + (num(i.yield_kwh) ?? 0), 0) };
    });
  }, [inverters]);
  const total = groups.reduce((a, g) => a + g.kwh, 0) || 1;
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { void getToken().then(setToken); }, []);
  if (groups.length === 0) return null;
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={st.chartTitle2}>INVERTERS</Text>
      {groups.map((g, i) => {
        const color = INV_COLORS[i % INV_COLORS.length];
        const share = (g.kwh / total) * 100;
        const dips = g.latest.curve?.dips ?? [];
        return (
          <View key={`${g.latest.plant_id}|${g.latest.name}`} style={st.invCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[st.dot, { backgroundColor: color }]} />
              <Text style={st.invName}>{plantNames?.[g.latest.plant_id] ? `${plantNames[g.latest.plant_id]} · ` : ''}{g.latest.name}</Text>
              <Text style={st.invShare}>{share.toFixed(0)}%</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Zap size={14} color={color} />
              <Text style={st.invKwh}>{fmt(g.kwh, 1)} kWh</Text>
            </View>
            <View style={st.track}><View style={[st.fill, { width: `${Math.max(share, 2)}%`, backgroundColor: color }]} /></View>
            {g.latest.has_picture && token ? <CurvePicture id={g.latest.id} token={token} staff={staff} /> : null}
            {g.latest.curve ? (
              <Text style={st.hint}>
                {g.list.length > 1 ? `${dayLabel(g.latest.date)} · ` : ''}Peak ~{g.latest.curve.peak.kw} kW ·{' '}
                {dips.length === 0 ? 'smooth curve, no dips' : `${dips.length} dip${dips.length > 1 ? 's' : ''} marked — the inverter follows the site's load, so a dip is the load falling, not a fault`}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function CurvePicture({ id, token, staff }: { id: number; token: string; staff?: boolean }) {
  const uri = `${SERVER_BASE}/api/${staff ? 'generation' : 'customer-portal/generation'}/inverter-picture/${id}`;
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [ratio, setRatio] = useState(3.4);
  useEffect(() => {
    Image.getSizeWithHeaders(uri, headers, (w, h) => h > 0 && setRatio(w / h), () => undefined);
  }, [uri, headers]);
  return (
    <Image
      source={{ uri, headers }}
      style={{ width: '100%', aspectRatio: ratio, marginTop: 10, borderRadius: 10, backgroundColor: keep('#FFFFFF') }}
      resizeMode="contain"
      accessibilityLabel="Inverter production curve"
    />
  );
}

/* ───────────────────────────── one plant ───────────────────────────── */

export function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[st.kpiValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={st.kpiLabel}>{label}</Text>
    </View>
  );
}

/** One-day figures: generated against expected as two bars (what a one-day Salitex report is). */
export function SingleDay({ day, accent }: { day: GenerationReportDay; accent: string }) {
  const y = num(day.yield_kwh) ?? 0;
  const e = num(day.expected_kwh);
  const max = Math.max(y, e ?? 0, 1);
  const row = (label: string, v: number, color: string) => (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={st.barLabel}>{label}</Text>
        <Text style={st.barValue}>{fmt(v)} kWh</Text>
      </View>
      <View style={st.track}><View style={[st.fill, { width: `${Math.max((v / max) * 100, 2)}%`, backgroundColor: color }]} /></View>
    </View>
  );
  const variance = e !== null ? y - e : null;
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={st.chartTitle2}>{dayLabel(day.date, day.label).toUpperCase()}</Text>
      {row('Generated', y, accent)}
      {e !== null ? row('Expected', e, '#F59E0B') : null}
      {variance !== null ? (
        <Text style={[st.hint, { color: variance >= 0 ? palette.good : palette.danger }]}>
          {variance >= 0 ? '+' : ''}{fmt(variance, 1)} kWh {variance >= 0 ? 'above' : 'below'} expected
        </Text>
      ) : null}
      {num(day.irradiance) !== null ? <Text style={st.hint}>Irradiance {fmt(num(day.irradiance), 2)} kWh/m²</Text> : null}
    </View>
  );
}

export function PlantBlock({ name, subtitle, capacity, days, color, accent }: {
  name: string; subtitle?: string; capacity: number | null; days: GenerationReportDay[]; color: string; accent: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const dated = days.filter((d) => d.date);
  const total = days.reduce((a, d) => a + (num(d.yield_kwh) ?? 0), 0);
  const onl = days.filter((d) => d.status === 'ONLINE' && num(d.pr_pct) !== null);
  const pr = onl.length ? onl.reduce((a, d) => a + (num(d.pr_pct) ?? 0), 0) / onl.length : null;
  const offline = days.filter((d) => d.status !== 'ONLINE').length;
  const expDays = days.filter((d) => (num(d.expected_kwh) ?? 0) > 0);
  const exp = expDays.reduce((a, d) => a + (num(d.expected_kwh) ?? 0), 0);
  const vs = exp > 0 ? (expDays.reduce((a, d) => a + (num(d.yield_kwh) ?? 0), 0) / exp) * 100 : null;
  const single = dated.length <= 1;
  const rows: BarRow[] = dated.map((d) => ({
    date: d.date as string,
    parts: [{ key: name, name, color, kwh: num(d.yield_kwh) ?? 0, offline: d.status !== 'ONLINE' }],
    pr: d.status === 'ONLINE' ? num(d.pr_pct) : null,
    expected: num(d.expected_kwh),
  }));

  return (
    <View style={[styles.card, { marginTop: 14, borderLeftWidth: 4, borderLeftColor: color }]}>
      <View style={st.plantHead}>
        <View style={{ flex: 1 }}>
          <Text style={st.plantName}>{name}</Text>
          <Text style={st.plantSub}>{[subtitle, capacity ? `${fmt(capacity)} kWp` : null].filter(Boolean).join(' · ')}</Text>
        </View>
        <Ring value={pr} size={64} stroke={7} color={prTone(pr)} track={tc(palette.borderSubtle)} label={pr === null ? '—' : `${Math.round(pr)}`} sub="PR" />
      </View>
      <View style={st.kpiRow}>
        <Kpi label="GENERATION" value={`${fmt(total)} kWh`} />
        <View style={st.kpiDivider} />
        <Kpi label={vs !== null ? 'OF EXPECTED' : 'AVG PR'} value={vs !== null ? `${vs.toFixed(0)}%` : pr === null ? '—' : `${pr.toFixed(1)}%`} color={vs !== null ? (vs >= 100 ? palette.good : vs >= 90 ? palette.ink : palette.warn) : prTone(pr)} />
        <View style={st.kpiDivider} />
        <Kpi label="OFFLINE DAYS" value={String(offline)} color={offline ? palette.danger : palette.ink} />
      </View>
      {single ? (
        dated[0] ? <SingleDay day={dated[0]} accent={color} /> : null
      ) : (
        <>
          <Text style={st.chartTitle2}>DAILY GENERATION (kWh)</Text>
          <StackedBars rows={rows} />
          <Text style={st.chartTitle2}>PERFORMANCE RATIO (%)</Text>
          <PrLines series={[{ key: name, name, color: accent, values: rows.map((r) => r.pr) }]} dates={rows.map((r) => r.date)} />
          <TouchableOpacity onPress={() => setShowTable(!showTable)} style={{ marginTop: 10 }}>
            <Text style={[st.link, { color: accent }]}>{showTable ? 'Hide' : 'Show'} day-by-day table</Text>
          </TouchableOpacity>
          {showTable ? <DayTable days={dated} /> : null}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  ringCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { fontWeight: '900' },
  ringSub: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.6 },
  donutTop: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, color: palette.mutedLight, maxWidth: 90, textAlign: 'center' },
  donutValue: { fontSize: 22, fontWeight: '900', color: palette.ink, letterSpacing: -0.4 },
  donutSub: { fontSize: 10.5, fontWeight: '700', color: palette.muted },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 10 },
  legendName: { fontSize: 12.5, fontWeight: '800', color: palette.ink },
  legendSub: { fontSize: 10.5, fontWeight: '600', color: palette.muted, marginTop: 1 },
  legendPct: { fontSize: 12.5, fontWeight: '900', color: palette.ink },
  dot: { width: 10, height: 10, borderRadius: 3 },
  readout: { minHeight: 38, justifyContent: 'center', marginBottom: 6 },
  readTitle: { fontSize: 13, fontWeight: '800', color: palette.ink },
  readPart: { fontSize: 11.5, fontWeight: '700', color: palette.muted },
  readHint: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 10, fontWeight: '700', color: palette.mutedLight },
  chartTitle2: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, color: palette.mutedLight, marginTop: 16, marginBottom: 8 },
  hint: { fontSize: 11.5, fontWeight: '600', color: palette.muted, marginTop: 8, lineHeight: 16 },
  link: { fontSize: 13, fontWeight: '800' },
  trow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle },
  th: { flex: 1, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: palette.mutedLight },
  td: { flex: 1, fontSize: 12.5, fontWeight: '600', color: palette.ink },
  barLabel: { fontSize: 12.5, fontWeight: '700', color: palette.muted },
  barValue: { fontSize: 12.5, fontWeight: '800', color: palette.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: palette.borderSubtle, marginTop: 6, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  invCard: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.borderSubtle },
  invName: { flex: 1, fontSize: 14, fontWeight: '800', color: palette.ink },
  invShare: { fontSize: 12, fontWeight: '800', color: palette.muted },
  invKwh: { fontSize: 20, fontWeight: '900', color: palette.ink, marginTop: 6 },
  plantHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  plantName: { fontSize: 17, fontWeight: '800', color: palette.ink },
  plantSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2 },
  kpiRow: { flexDirection: 'row', marginTop: 14, alignItems: 'center' },
  kpiDivider: { width: 1, height: 28, backgroundColor: palette.border },
  kpiValue: { fontSize: 16, fontWeight: '800', color: palette.ink },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, color: palette.mutedLight, marginTop: 3 },
});
