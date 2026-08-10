// app/index.tsx
//
// Signed-in landing screen. Phase 1 proves the session end to end — the token
// is stored, restored across launches, and the client name comes back from an
// authenticated call.
//
// REPLACED IN PHASE 2 by the real dashboard, when the site selector, stats and
// job list arrive.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Building2, LogOut, CircleCheck, Clock } from 'lucide-react-native';
import { styles, palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import { useAuth, initialsOf } from '../src/auth/AuthContext';

const NEXT_UP = [
  'Phase 2 — site selector, dashboard, job history, photos',
  'Phase 3 — maintenance history, profile, privacy',
  'Phase 4 — SLD walkthrough',
  'Phase 5 — push notifications',
  'Phase 6 — support chat',
];

export default function HomeScreen() {
  const { accent } = useAccent();
  const { user, clientName, signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'You will need your email and password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.avatarBox, { backgroundColor: accent, marginTop: 8 }]}>
          <Text style={styles.avatarText}>{initialsOf(user?.firstName, user?.lastName)}</Text>
        </View>

        <Text style={[styles.titleExtrabold, { fontSize: 22, marginBottom: 4 }]}>
          {clientName || 'Your account'}
        </Text>
        <Text style={[styles.subText, { textAlign: 'center', marginBottom: 24 }]}>
          {user?.email || ''}
        </Text>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>SESSION</Text>
          <Row
            icon={<CircleCheck size={16} color={palette.good} />}
            label="Signed in"
            value={`Client #${user?.client_id ?? '—'}`}
          />
          <Row
            icon={<Building2 size={16} color={palette.muted} />}
            label="Client"
            value={clientName || 'Loading…'}
          />
          <Row
            icon={<Clock size={16} color={palette.muted} />}
            label="Session length"
            value="30 days"
            last
          />
        </View>

        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>NEXT UP</Text>
          {NEXT_UP.map((line) => (
            <Text key={line} style={local.next}>
              {line}
            </Text>
          ))}
        </View>

        <TouchableOpacity onPress={confirmSignOut} style={[styles.btnOutline, { marginTop: 24 }]}>
          <LogOut size={16} color={palette.danger} />
          <Text style={[styles.btnOutlineText, { color: palette.danger }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[local.row, last && { borderBottomWidth: 0 }]}>
      <View style={local.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={local.rowLabel}>{label}</Text>
        <Text style={local.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 11, fontWeight: '700', color: palette.mutedLight, letterSpacing: 0.5 },
  rowValue: { fontSize: 14, fontWeight: '600', color: palette.ink, marginTop: 2 },
  next: { fontSize: 13, lineHeight: 20, color: palette.inkSoft, fontWeight: '600' },
});
