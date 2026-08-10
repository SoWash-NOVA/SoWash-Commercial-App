// app/maintenance/[id].tsx
//
// One maintenance task: what it covers, when it ran, and the single before /
// after photo pair the crew uploaded.
//
// Site is not shown, for the reason set out in app/maintenance/index.tsx —
// maintenance_schedules has no site column and the endpoint's site fields are
// the client's alphabetically-first site, not the one the work happened at.

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
import { ChevronLeft, CircleAlert, ImageOff, ListChecks } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useMaintenanceDetail, formatDateOnly, formatDateTime, statusMeta } from '../../src/hooks';
import { photoUrl } from '../../src/api/client';

export default function MaintenanceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accent } = useAccent();
  const { width } = useWindowDimensions();
  const { data, loading, error, refreshing, refresh } = useMaintenanceDetail(id ?? null);

  const job = data?.job;
  const before = photoUrl(job?.before_photo_url);
  const after = photoUrl(job?.after_photo_url);
  const photoW = (width - 40 - 40 - 10) / 2;

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/maintenance'))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Maintenance task</Text>
      </View>

      {loading && !data ? (
        <View style={local.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : !job ? (
        <View style={local.centre}>
          <CircleAlert size={26} color={palette.mutedLight} />
          <Text style={local.emptyTitle}>Not available</Text>
          <Text style={local.emptyBody}>{error || 'This task could not be loaded.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
          }
        >
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Text style={local.task}>{job.task_name || 'Maintenance task'}</Text>
              <View style={[local.pill, { backgroundColor: statusMeta(job.status).bg }]}>
                <Text style={[local.pillText, { color: statusMeta(job.status).color }]}>
                  {statusMeta(job.status).label}
                </Text>
              </View>
            </View>

            <View style={local.facts}>
              <Fact label="Scheduled" value={formatDateOnly(job.scheduled_date)} />
              <Fact label="Started" value={formatDateTime(job.started_at)} />
              <Fact label="Completed" value={formatDateTime(job.completed_at)} />
              <Fact label="Team lead" value={job.team_lead_name} />
              <Fact
                label="Service"
                value={job.service_number ? `#${job.service_number}` : null}
                last
              />
            </View>
          </View>

          {job.task_description ? (
            <View style={[styles.card, { marginTop: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <ListChecks size={15} color={accent} />
                <Text style={styles.cardTitle}>WHAT THIS COVERS</Text>
              </View>
              <Text style={local.body}>{job.task_description}</Text>
            </View>
          ) : null}

          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={[styles.cardTitle, { marginBottom: 12 }]}>PHOTOS</Text>
            {before || after ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {before ? (
                  <Shot
                    uri={before}
                    label="Before"
                    at={job.before_photo_at}
                    width={after ? photoW : photoW * 2 + 10}
                  />
                ) : null}
                {after ? (
                  <Shot
                    uri={after}
                    label="After"
                    at={job.after_photo_at}
                    width={before ? photoW : photoW * 2 + 10}
                  />
                ) : null}
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 6, paddingVertical: 10 }}>
                <ImageOff size={20} color={palette.mutedLight} />
                <Text style={local.emptyBody}>No photos were uploaded for this task.</Text>
              </View>
            )}
          </View>

          {job.remarks ? (
            <View style={[styles.card, { marginTop: 16, marginBottom: 8 }]}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>REMARKS</Text>
              <Text style={local.body}>{job.remarks}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Shot({
  uri,
  label,
  at,
  width,
}: {
  uri: string;
  label: string;
  at: string | null;
  width: number;
}) {
  return (
    <View style={{ width }}>
      <Image
        source={{ uri }}
        style={{ width, height: width * 0.75, borderRadius: 14, backgroundColor: '#f1f5f9' }}
        resizeMode="cover"
      />
      <Text style={local.shotLabel}>{label}</Text>
      <Text style={local.shotMeta}>{at ? formatDateTime(at) : '—'}</Text>
    </View>
  );
}

function Fact({
  label,
  value,
  last,
}: {
  label: string;
  value: string | null | undefined;
  last?: boolean;
}) {
  if (!value || value === '—') return null;
  return (
    <View style={[local.factRow, last && { borderBottomWidth: 0 }]}>
      <Text style={local.factLabel}>{label}</Text>
      <Text style={local.factValue}>{value}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  task: { flex: 1, fontSize: 18, fontWeight: '900', color: palette.ink },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  pillText: { fontSize: 10, fontWeight: '800' },
  facts: { marginTop: 14, borderTopWidth: 1, borderTopColor: palette.borderSubtle },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  factLabel: { fontSize: 12.5, fontWeight: '700', color: palette.mutedLight },
  factValue: { fontSize: 13, fontWeight: '700', color: palette.ink, flex: 1, textAlign: 'right' },
  body: { fontSize: 13.5, lineHeight: 20, color: palette.inkSoft, fontWeight: '600' },
  shotLabel: { fontSize: 12, fontWeight: '800', color: palette.ink, marginTop: 7 },
  shotMeta: { fontSize: 11, fontWeight: '600', color: palette.mutedLight, marginTop: 1 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  emptyBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
});
