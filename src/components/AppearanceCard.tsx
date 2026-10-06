// src/components/AppearanceCard.tsx
//
// Account → Appearance: pick Light or Dark. Shared by the client and staff Account
// screens. The choice is persisted and applied app-wide by src/theme-mode.tsx (the app
// tree remounts, then navigation comes back to this screen).

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { Check, Moon, Sun } from 'lucide-react-native';
import { styles, palette } from '../theme';
import { useThemeMode } from '../theme-mode';
import type { ThemeMode } from '../themeEngine';

const BLUE = '#1C9BE0';

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
];

/* Fixed preview colours — each tile shows what that theme looks like, whichever is active. */
const PREVIEW = {
  light: { bg: '#F4F7FC', card: '#FFFFFF', line: '#E2E8F0', ink: '#1E293B' },
  dark: { bg: '#0E1520', card: '#172131', line: '#2A3649', ink: '#E6EDF5' },
};

export default function AppearanceCard({ style }: { style?: object }) {
  const { mode, setMode } = useThemeMode();
  const pathname = usePathname();

  return (
    <View style={[styles.card, style]}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>APPEARANCE</Text>
      <View style={local.row}>
        {OPTIONS.map(({ mode: m, label, Icon }) => {
          const active = mode === m;
          const pv = PREVIEW[m];
          return (
            <TouchableOpacity
              key={m}
              activeOpacity={0.85}
              onPress={() => setMode(m, pathname)}
              style={[local.option, active && local.optionActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label} theme`}
            >
              {/* a tiny mock screen in that theme's colours */}
              <View style={[local.preview, { backgroundColor: pv.bg, borderColor: pv.line }]}>
                <View style={local.previewHeader} />
                <View style={[local.previewCard, { backgroundColor: pv.card, borderColor: pv.line }]}>
                  <View style={[local.previewLine, { backgroundColor: pv.ink, width: '70%' }]} />
                  <View style={[local.previewLine, { backgroundColor: pv.line, width: '45%' }]} />
                </View>
              </View>
              <View style={local.labelRow}>
                <Icon size={15} color={active ? BLUE : palette.muted} />
                <Text style={[local.label, active && { color: BLUE }]}>{label}</Text>
                {active ? (
                  <View style={local.check}>
                    <Check size={11} color="#fff" strokeWidth={3} />
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  option: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: palette.border,
    padding: 8,
  },
  optionActive: { borderColor: BLUE },
  preview: { height: 74, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  previewHeader: { height: 18, backgroundColor: BLUE },
  previewCard: { margin: 7, borderRadius: 6, borderWidth: 1, padding: 6, gap: 5 },
  previewLine: { height: 4, borderRadius: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, paddingHorizontal: 2 },
  label: { flex: 1, fontSize: 13.5, fontWeight: '800', color: palette.inkSoft },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
});
