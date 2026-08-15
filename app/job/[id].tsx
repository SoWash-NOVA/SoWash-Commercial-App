// app/job/[id].tsx
//
// One service visit in full, as a route.
//
// The five sections live in src/components/JobDetailBody.tsx, because the chat
// screen opens the same report in a popup and two copies would drift. What
// stays here is what is specific to being a SCREEN: the back bar, the loading
// state, and pull-to-refresh.
//
// One thing the endpoint does that this screen has to respect: it returns 404
// for a job that is neither approved nor scheduled today, so "not found" here
// usually means "not approved yet", and the empty state says so rather than
// implying the job does not exist.
//
// The walkthrough entry is decided by fetching /sld/:schedule_id, NOT by
// job.has_sld_walkthrough — that flag is computed only in /history's SELECT and
// does not exist on this payload (see the Omit on JobDetail in api/types.ts).
// It costs one small extra request per visit and needs no backend change.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, CircleAlert } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useJobDetail, useSldWalkthrough, sldHasWalk } from '../../src/hooks';
import JobDetailBody, { detailStyles } from '../../src/components/JobDetailBody';

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
        <View style={detailStyles.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : !job ? (
        <View style={detailStyles.centre}>
          <CircleAlert size={26} color={palette.mutedLight} />
          <Text style={detailStyles.emptyTitle}>Not available</Text>
          <Text style={detailStyles.emptyBody}>
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
          <JobDetailBody
            job={job}
            walkPoints={walkPoints}
            onWalk={() =>
              router.push({
                pathname: '/walkthrough/[id]',
                params: { id: String(id), site: job.site_name ?? '' },
              })
            }
          />
        </ScrollView>
      )}
    </View>
  );
}
