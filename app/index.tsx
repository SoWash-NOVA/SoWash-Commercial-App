// app/index.tsx
//
// Phase 0 scaffold check. This screen exists to prove the shell is wired —
// router, theme, accent context, icons, safe areas — on a device or in the web
// preview, before any real screen is built on top of it.
//
// REPLACED IN PHASE 2 by the client dashboard. Nothing should import from here.

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Building2, CheckCircle2 } from 'lucide-react-native';
import { styles, palette } from '../src/theme';
import { useAccent } from '../src/theme-context';

const WIRED = [
  'expo-router + typed routes',
  'theme + accent context',
  'splash screen (teal-on-#F4F7FC)',
  'notification icon plugin',
  'image-picker with camera + mic blocked',
];

export default function ScaffoldScreen() {
  const { accent } = useAccent();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: 32 }]}>
        <View style={[styles.heroIconBox, { backgroundColor: accent, alignSelf: 'center' }]}>
          <Building2 size={64} color="#fff" />
        </View>

        <Text style={styles.titleExtrabold}>SoWash Commercial</Text>
        <Text style={styles.subTextCenter}>
          Phase 0 scaffold. Sign-in arrives in Phase 1, the site dashboard in Phase 2.
        </Text>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>WIRED UP</Text>
          {WIRED.map((item) => (
            <View
              key={item}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}
            >
              <CheckCircle2 size={16} color={accent} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: palette.inkSoft, flex: 1 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
