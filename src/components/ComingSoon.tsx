// src/components/ComingSoon.tsx
//
// Placeholder body for an office/staff tab whose real content lands in a
// later phase (see app/staff/*). Shared rather than copy-pasted four times so
// the four placeholder screens stay visually identical while they're empty.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette } from '../theme';
import { useAccent } from '../theme-context';

interface Props {
  icon: React.ReactNode;
  title: string;
  body: string;
}

export default function ComingSoon({ icon, title, body }: Props) {
  const { accent } = useAccent();

  return (
    <View style={s.wrap}>
      <View style={[s.iconBox, { backgroundColor: `${accent}14` }]}>{icon}</View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: palette.bg,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '900', color: palette.ink, marginBottom: 8 },
  body: { fontSize: 13.5, color: palette.muted, textAlign: 'center', lineHeight: 20 },
});
