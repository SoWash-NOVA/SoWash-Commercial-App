// src/components/GenerationDashboard.tsx
//
// One period of Generation & PR, drawn natively: the headline (energy, PR dial, vs-expected, offline), an interactive donut of
// the plants' shares, a scrub-able stacked daily chart, PR lines per plant, each plant's own block (tap to open) and the
// inverters with their production curves. Used by the Generation centre (a day / week / month the client picked) and by a
// published report's detail screen, so both read the same.

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, ChevronUp, Sun } from 'lucide-react-native';
import { styles, palette } from '../theme';
import { tc, keep } from '../themeEngine';
import { GenerationReportDay, GenerationReportInverter } from '../api/types';
import {
  BarRow, Donut, Inverters, PLANT_COLORS, PlantBlock, PrLines, Ring, StackedBars, dayLabel, fmt, num, prTone,
} from './GenerationParts';

export interface DashPlant {
  plant_id: number;
  name: string;
  client_name?: string;
  dc_capacity_kwp: string | number | null;
  days: GenerationReportDay[];
}

export default function GenerationDashboard({ plants, inverters, periodLabel, accent, staff }: {
  plants: DashPlant[];
  inverters: GenerationReportInverter[];
  periodLabel: string;
  accent: string;
  /** office staff: several clients at once - adds the client cards and shares the donut by client */
  staff?: boolean;
}) {
  const clientNames = useMemo(() => [...new Set(plants.map((p) => p.client_name ?? ''))].filter(Boolean), [plants]);
  const multiClient = clientNames.length > 1;
  const clientColor: Record<string, string> = useMemo(() => Object.fromEntries(clientNames.map((n, i) => [n, PLANT_COLORS[i % PLANT_COLORS.length]])), [clientNames]);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const color = (i: number) => PLANT_COLORS[i % PLANT_COLORS.length];

  const all = useMemo(() => plants.flatMap((p) => p.days), [plants]);
  const totalKwh = all.reduce((a, d) => a + (num(d.yield_kwh) ?? 0), 0);
  const onl = all.filter((d) => d.status === 'ONLINE' && num(d.pr_pct) !== null);
  const avgPr = onl.length ? onl.reduce((a, d) => a + (num(d.pr_pct) ?? 0), 0) / onl.length : null;
  const offlineDays = all.filter((d) => d.status !== 'ONLINE').length;
  const withExp = all.filter((d) => (num(d.expected_kwh) ?? 0) > 0);
  const expTotal = withExp.reduce((a, d) => a + (num(d.expected_kwh) ?? 0), 0);
  const vsExpected = expTotal > 0 ? (withExp.reduce((a, d) => a + (num(d.yield_kwh) ?? 0), 0) / expTotal) * 100 : null;

  // one row per date across every plant
  const dates = useMemo(() => [...new Set(all.map((d) => d.date).filter(Boolean) as string[])].sort(), [all]);
  const barRows: BarRow[] = useMemo(
    () => dates.map((date) => {
      const parts = plants.map((p, i) => {
        const d = p.days.find((x) => x.date === date);
        return { key: String(p.plant_id), name: p.name, color: color(i), kwh: d ? num(d.yield_kwh) ?? 0 : 0, offline: d ? d.status !== 'ONLINE' : false };
      });
      const prs = plants.map((p) => p.days.find((x) => x.date === date)).filter((d) => d && d.status === 'ONLINE' && num(d.pr_pct) !== null).map((d) => num(d?.pr_pct) as number);
      return { date, parts, pr: prs.length ? prs.reduce((a, b) => a + b, 0) / prs.length : null, expected: null };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates, plants],
  );
  const prSeries = plants.map((p, i) => ({
    key: String(p.plant_id), name: p.name, color: color(i),
    values: dates.map((date) => {
      const d = p.days.find((x) => x.date === date);
      return d && d.status === 'ONLINE' ? num(d.pr_pct) : null;
    }),
  }));
  const plantNames = Object.fromEntries(plants.map((p) => [p.plant_id, p.name]));

  return (
    <View>
      {/* ── headline ── */}
      <LinearGradient colors={['#1C9BE0', '#33B8F0', '#4CC9A0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={d.hero}>
        <View style={d.heroTop}>
          <View style={d.heroIcon}><Sun size={16} color={keep('#fff')} /></View>
          <Text style={d.heroPeriod}>{periodLabel}</Text>
        </View>
        <View style={d.heroBody}>
          <View style={{ flex: 1 }}>
            <Text style={d.heroLabel}>ENERGY GENERATED</Text>
            <Text style={d.heroValue}>{fmt(totalKwh)} <Text style={d.heroUnit}>kWh</Text></Text>
          </View>
          <Ring value={avgPr} size={92} stroke={9} color={keep('#fff')} track={keep('#1789C9')} label={avgPr === null ? '—' : `${avgPr.toFixed(1)}%`} sub="AVG PR" light />
        </View>
        <View style={d.pillRow}>
          <Pill text={`${plants.length} plant${plants.length === 1 ? '' : 's'}`} />
          <Pill text={`${dates.length} day${dates.length === 1 ? '' : 's'}`} />
          {vsExpected !== null ? <Pill text={`${vsExpected.toFixed(0)}% of expected`} /> : null}
          <Pill text={offlineDays ? `${offlineDays} offline day${offlineDays > 1 ? 's' : ''}` : 'always online'} />
        </View>
      </LinearGradient>

      {/* ── one card per client (staff, several clients) ── */}
      {staff && multiClient ? <ClientCards plants={plants} colorOf={clientColor} /> : null}

      {/* ── who produced what (tap a slice): by client when there are several, else by plant ── */}
      {staff && multiClient ? (
        <Donut
          title="SHARE OF GENERATION BY CLIENT · TAP A SLICE"
          slices={clientNames.map((n, i) => ({
            key: n, name: n, color: clientColor[n] ?? color(i),
            value: plants.filter((p) => p.client_name === n).reduce((a, p) => a + p.days.reduce((b, x) => b + (num(x.yield_kwh) ?? 0), 0), 0),
            sub: `${plants.filter((p) => p.client_name === n).length} plant${plants.filter((p) => p.client_name === n).length === 1 ? '' : 's'}`,
          })).sort((a, b) => b.value - a.value)}
        />
      ) : plants.length > 1 ? (
        <Donut
          title="SHARE OF GENERATION · TAP A SLICE"
          slices={plants.map((p, i) => ({
            key: String(p.plant_id), name: p.name, color: color(i),
            value: p.days.reduce((a, x) => a + (num(x.yield_kwh) ?? 0), 0),
            sub: multiClient ? p.client_name : undefined,
          })).sort((a, b) => b.value - a.value)}
        />
      ) : null}

      {/* ── the days, together ── */}
      {dates.length > 1 ? (
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={d.cardTitle}>DAILY GENERATION (kWh){plants.length > 1 ? ' · BY PLANT' : ''}</Text>
          <StackedBars rows={barRows} />
          {plants.length > 1 ? (
            <View style={d.legend}>
              {plants.map((p, i) => (
                <View key={p.plant_id} style={d.legendItem}>
                  <View style={[d.sw, { backgroundColor: color(i) }]} />
                  <Text style={d.legendText}>{p.name}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={[d.cardTitle, { marginTop: 18 }]}>PERFORMANCE RATIO (%)</Text>
          <PrLines series={prSeries} dates={dates} />
        </View>
      ) : null}

      {/* ── each plant ── */}
      {plants.map((p, i) => {
        const expanded = plants.length === 1 || open[p.plant_id];
        const tot = p.days.reduce((a, x) => a + (num(x.yield_kwh) ?? 0), 0);
        const ol = p.days.filter((x) => x.status === 'ONLINE' && num(x.pr_pct) !== null);
        const pr = ol.length ? ol.reduce((a, x) => a + (num(x.pr_pct) ?? 0), 0) / ol.length : null;
        if (expanded) {
          return (
            <View key={p.plant_id}>
              {plants.length > 1 ? (
                <TouchableOpacity onPress={() => setOpen({ ...open, [p.plant_id]: false })} style={d.collapse}>
                  <Text style={[d.collapseText, { color: accent }]}>Hide {p.name}</Text>
                  <ChevronUp size={15} color={accent} />
                </TouchableOpacity>
              ) : null}
              <PlantBlock
                name={p.name}
                subtitle={multiClient ? p.client_name : undefined}
                capacity={num(p.dc_capacity_kwp)}
                days={p.days}
                color={color(i)}
                accent={color(i)}
              />
            </View>
          );
        }
        return (
          <TouchableOpacity key={p.plant_id} activeOpacity={0.85} onPress={() => setOpen({ ...open, [p.plant_id]: true })} style={[styles.card, d.plantRow, { borderLeftColor: color(i) }]}>
            <View style={{ flex: 1 }}>
              <Text style={d.plantRowName} numberOfLines={1}>{p.name}</Text>
              <Text style={d.plantRowSub} numberOfLines={1}>{multiClient ? `${p.client_name} · ` : ''}{fmt(tot)} kWh</Text>
            </View>
            <Text style={[d.plantRowPr, { color: prTone(pr) }]}>{pr === null ? '—' : `${pr.toFixed(1)}%`}</Text>
            <ChevronDown size={18} color={tc(palette.mutedLight)} />
          </TouchableOpacity>
        );
      })}

      {/* ── inverters ── */}
      {inverters.length > 0 ? (
        <View style={[styles.card, { marginTop: 14 }]}>
          <Inverters inverters={inverters} plantNames={plantNames} staff={staff} />
        </View>
      ) : null}

      {dates.length > 0 ? <Text style={d.foot}>{dayLabel(dates[0])}{dates.length > 1 ? ` – ${dayLabel(dates[dates.length - 1])}` : ''} · published figures</Text> : null}
    </View>
  );
}

/** A card per client: total, average PR, offline days and its plants - what the super admin scans first. */
function ClientCards({ plants, colorOf }: { plants: DashPlant[]; colorOf: Record<string, string> }) {
  const names = [...new Set(plants.map((p) => p.client_name ?? ''))].filter(Boolean);
  const rows = names.map((n) => {
    const mine = plants.filter((p) => p.client_name === n);
    const days = mine.flatMap((p) => p.days);
    const kwh = days.reduce((a, x) => a + (num(x.yield_kwh) ?? 0), 0);
    const onl = days.filter((x) => x.status === 'ONLINE' && num(x.pr_pct) !== null);
    const pr = onl.length ? onl.reduce((a, x) => a + (num(x.pr_pct) ?? 0), 0) / onl.length : null;
    return { n, mine, kwh, pr, offline: days.filter((x) => x.status !== 'ONLINE').length };
  }).sort((a, b) => b.kwh - a.kwh);
  const max = rows[0]?.kwh || 1;
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={d.cardTitle}>CLIENTS</Text>
      {rows.map((r, i) => (
        <View key={r.n} style={[styles.card, { marginBottom: 10, borderLeftWidth: 4, borderLeftColor: colorOf[r.n] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ring value={r.pr} size={62} stroke={7} color={prTone(r.pr)} track={tc(palette.borderSubtle)} label={r.pr === null ? '—' : `${Math.round(r.pr)}`} sub="PR" />
            <View style={{ flex: 1 }}>
              <Text style={d.plantRowName} numberOfLines={2}>{i < 3 ? `${medal[i]} ` : ''}{r.n}</Text>
              <Text style={d.clientKwh}>{fmt(r.kwh)} kWh</Text>
            </View>
          </View>
          <View style={d.track}><View style={[d.fillBar, { width: `${Math.max((r.kwh / max) * 100, 3)}%`, backgroundColor: colorOf[r.n] }]} /></View>
          <Text style={d.plantRowSub}>
            {r.mine.map((p) => p.name).join(' · ')}{r.offline ? ` · ${r.offline} offline day${r.offline > 1 ? 's' : ''}` : ' · always online'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View style={d.pill}>
      <Text style={d.pillText}>{text}</Text>
    </View>
  );
}

const d = StyleSheet.create({
  hero: { borderRadius: 22, padding: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: keep('#1789C9'), alignItems: 'center', justifyContent: 'center' },
  heroPeriod: { flex: 1, fontSize: 13, fontWeight: '800', color: keep('#fff'), letterSpacing: 0.3 },
  heroBody: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  heroLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: keep('#EAF6FF') },
  heroValue: { fontSize: 34, fontWeight: '900', color: keep('#fff'), marginTop: 2, letterSpacing: -0.5 },
  heroUnit: { fontSize: 14, fontWeight: '700', color: keep('#EAF6FF') },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: keep('#1789C9') },
  pillText: { fontSize: 12, fontWeight: '800', color: keep('#fff') },
  cardTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, color: palette.mutedLight, marginBottom: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sw: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11.5, fontWeight: '700', color: palette.muted },
  plantRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 4 },
  plantRowName: { fontSize: 15, fontWeight: '800', color: palette.ink },
  plantRowSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2 },
  plantRowPr: { fontSize: 16, fontWeight: '900' },
  collapse: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  collapseText: { fontSize: 12.5, fontWeight: '800' },
  clientKwh: { fontSize: 20, fontWeight: '900', color: palette.ink, marginTop: 2, letterSpacing: -0.3 },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.borderSubtle, marginTop: 10, marginBottom: 8, overflow: 'hidden' },
  fillBar: { height: 6, borderRadius: 3 },
  foot: { fontSize: 11, fontWeight: '600', color: palette.mutedLight, textAlign: 'center', marginTop: 16 },
});
