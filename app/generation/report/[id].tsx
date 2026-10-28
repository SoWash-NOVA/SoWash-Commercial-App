// app/generation/report/[id].tsx
//
// One PUBLISHED report, drawn inside the app with the same dashboard the Generation centre uses (interactive donut, scrub-able
// daily chart, PR per plant, inverters with their production curve). The figures are the report's own published rows
// (GET /customer-portal/generation/reports/:id/data). "Share / print the full report" hands the original HTML to the phone.

import React, { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleAlert, FileText } from 'lucide-react-native';
import { styles, palette } from '../../../src/theme';
import { useAccent } from '../../../src/theme-context';
import { useGenerationReportData, openGenerationReport } from '../../../src/hooks';
import PageHeader from '../../../src/components/PageHeader';
import GenerationDashboard from '../../../src/components/GenerationDashboard';
import { dayLabel } from '../../../src/components/GenerationParts';

export default function GenerationReportScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = Number(id);
  const q = useGenerationReportData(reportId);
  const [opening, setOpening] = useState(false);
  const data = q.data;

  const dates = (data?.plants ?? []).flatMap((p) => p.days.map((d) => d.date)).filter(Boolean).sort() as string[];
  const period =
    dates.length > 0
      ? `${dayLabel(dates[0])}${dates[dates.length - 1] !== dates[0] ? ` – ${dayLabel(dates[dates.length - 1])}` : ''}`
      : data?.report.period_label ?? '';

  const openFull = async () => {
    try {
      setOpening(true);
      await openGenerationReport(reportId, data?.report.title ?? 'Report');
    } catch (e) {
      Alert.alert('Could not open the report', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.screen}>
      <PageHeader
        title={data?.report.title ?? 'Report'}
        subtitle={data?.report.period_label ?? undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/generation' as never))}
      />
      <ScrollView
        contentContainerStyle={local.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={accent} />}
      >
        {q.loading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
        ) : q.error && !data ? (
          <View style={local.empty}>
            <CircleAlert size={22} color={palette.danger} />
            <Text style={local.emptyTitle}>Could not load this report</Text>
            <Text style={local.emptyBody}>{q.error}</Text>
          </View>
        ) : data ? (
          <>
            <GenerationDashboard
              plants={data.plants.map((p) => ({ plant_id: p.plant_id, name: p.name, dc_capacity_kwp: p.dc_capacity_kwp, days: p.days }))}
              inverters={data.inverters}
              periodLabel={period}
              accent={accent}
            />
            <TouchableOpacity onPress={openFull} disabled={opening} style={[local.fullBtn, { borderColor: accent }]}>
              {opening ? <ActivityIndicator color={accent} /> : <FileText size={16} color={accent} />}
              <Text style={[local.fullBtnText, { color: accent }]}>Share / print the full report</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
  fullBtn: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5 },
  fullBtnText: { fontSize: 14, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center' },
});
