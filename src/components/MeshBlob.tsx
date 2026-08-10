import React from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Soft out-of-focus colour wash used behind the onboarding and login screens. */
export function MeshBlob({ style, colors }: { style?: StyleProp<ViewStyle>; colors: readonly [string, string, ...string[]] }) {
  return (
    <View style={[StyleSheet.absoluteFill, style, { overflow: 'hidden' }]}>
      <LinearGradient colors={colors} style={{ flex: 1, opacity: 0.15, borderRadius: 999 }} />
    </View>
  );
}
