// app/walkthrough/[id].tsx
//
// Full-screen host for the SLD walkthrough of one visit.
//
// A route rather than a panel inside app/job/[id].tsx for two reasons: the
// stage is dark and immersive where the detail screen is a light card list, and
// dragging around a diagram inside a ScrollView means fighting the parent for
// every gesture. A screen of its own has neither problem.
//
// `site` comes in as a param because the job detail screen already knows it —
// asking /:schedule_id/detail again just for a name would be a second request
// for a string we were handed.
//
// The empty state here is not dead code. The detail screen only shows the entry
// button when sldHasWalk() is true, but this route is reachable directly via
// the sowashcommercial:// scheme, and a visit with no walkthrough has to say so
// rather than render an empty map.

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Footprints } from 'lucide-react-native';
import { styles, palette, ACCENT_DEFAULT } from '../../src/theme';
import { useSldWalkthrough, sldHasWalk } from '../../src/hooks';
import SldWalkthrough from '../../src/components/SldWalkthrough';

export default function WalkthroughScreen() {
  const { id, site } = useLocalSearchParams<{ id: string; site?: string }>();
  const router = useRouter();
  const { data, loading, error } = useSldWalkthrough(id ?? null);

  const exit = () => (router.canGoBack() ? router.back() : router.replace(`/job/${id}`));

  if (loading) {
    return (
      <View style={styles.screen}>
        <Chrome onExit={exit} />
        <View style={local.centre}>
          <ActivityIndicator size="large" color={ACCENT_DEFAULT} />
        </View>
      </View>
    );
  }

  if (error || !data || !sldHasWalk(data)) {
    return (
      <View style={styles.screen}>
        <Chrome onExit={exit} />
        <View style={local.centre}>
          <Footprints size={26} color={palette.mutedLight} />
          <Text style={local.title}>No walkthrough for this visit</Text>
          <Text style={local.body}>
            {error ||
              'The crew photographed this visit as a set of before and after shots rather than point by point. They are on the visit page.'}
          </Text>
          <TouchableOpacity onPress={exit} style={local.btn} activeOpacity={0.8}>
            <Text style={local.btnText}>Back to the visit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // sldHasWalk() has already established diagram is non-null.
  return (
    <SldWalkthrough
      diagram={data.diagram!}
      points={data.points}
      siteName={site}
      onExit={exit}
    />
  );
}

function Chrome({ onExit }: { onExit: () => void }) {
  return (
    <View style={styles.stubHeader}>
      <TouchableOpacity onPress={onExit} style={styles.stubBackBtn}>
        <ChevronLeft size={20} color={palette.inkSoft} />
      </TouchableOpacity>
      <Text style={styles.stubTitle}>Site walkthrough</Text>
    </View>
  );
}

const local = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  title: { fontSize: 15, fontWeight: '800', color: palette.ink },
  body: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },
  btn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  btnText: { fontSize: 13, fontWeight: '800', color: palette.inkSoft },
});
