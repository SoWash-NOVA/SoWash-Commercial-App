// app/documentation/index.tsx
//
// "Documentation" menu: four destinations, none of them a new data model of
// their own except TBT and Safety Training.
//
//   Site SLD            → reuses the existing per-visit walkthrough as-is
//                          (documentation/site-sld.tsx lists completed visits
//                          that have one, same as the walkthrough entry point
//                          already used from job/[id].tsx).
//   TBT                  → documentation/tbt.tsx, new backend
//                          (GET /customer-portal/documentation/tbt).
//   Safety Training      → documentation/safety-training.tsx, new backend
//                          (GET /customer-portal/documentation/safety-training).
//   Equipment Inspection → deep-links straight into the existing /maintenance
//                          screen. No new screen: maintenance IS the
//                          equipment-inspection record, just under its
//                          existing name.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Footprints, Megaphone, ShieldCheck, Wrench } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';

const ITEMS: {
  key: string;
  title: string;
  sub: string;
  Icon: typeof Wrench;
  route: string;
}[] = [
  {
    key: 'site-sld',
    title: 'Site SLD',
    sub: 'Single-line diagram walkthrough',
    Icon: Footprints,
    route: '/documentation/site-sld',
  },
  {
    key: 'tbt',
    title: 'TBT',
    sub: 'Toolbox talk photos, by completed visit',
    Icon: Megaphone,
    route: '/documentation/tbt',
  },
  {
    key: 'safety-training',
    title: 'Safety Training',
    sub: 'Training photos with date and time',
    Icon: ShieldCheck,
    route: '/documentation/safety-training',
  },
  {
    key: 'equipment-inspection',
    title: 'Equipment Inspection',
    sub: 'From your maintenance records',
    Icon: Wrench,
    route: '/maintenance',
  },
];

export default function DocumentationScreen() {
  const router = useRouter();
  const { accent } = useAccent();

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Documentation</Text>
      </View>

      <ScrollView contentContainerStyle={local.list} showsVerticalScrollIndicator={false}>
        {ITEMS.map(({ key, title, sub, Icon, route }) => (
          <TouchableOpacity
            key={key}
            onPress={() => router.push(route as never)}
            style={local.card}
            activeOpacity={0.9}
          >
            <View style={[local.icon, { backgroundColor: `${accent}14` }]}>
              <Icon size={20} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={local.title}>{title}</Text>
              <Text style={local.sub}>{sub}</Text>
            </View>
            <ChevronRight size={18} color={palette.mutedLight} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    padding: 14,
  },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: palette.ink },
  sub: { fontSize: 12, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },
});
