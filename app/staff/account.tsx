// app/staff/account.tsx — Office Account.
//
// The one staff screen that has to be real from day one, not a placeholder:
// without a working sign-out, anyone testing the office session is stuck
// signed in until they clear app storage by hand.

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchSummary } from '../../src/phonebook';
import { BookUser, ChevronRight, FolderOpen, LogOut, Mail, Shield } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useAuth, initialsOf } from '../../src/auth/AuthContext';
import PageHeader from '../../src/components/PageHeader';
import AppearanceCard from '../../src/components/AppearanceCard';

/** "ci_admin" -> "CI Admin", for display. */
function formatRole(role: string | null | undefined): string {
  if (!role) return 'Office';
  return role
    .split('_')
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export default function StaffAccountScreen() {
  const { accent } = useAccent();
  const { user, signOut } = useAuth();
  const router = useRouter();
  // approvers see how many restore requests are waiting for them
  const [waiting, setWaiting] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchSummary()
        .then((s) => live && setWaiting(s.pending_requests ?? 0))
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'You will need your email and password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <PageHeader title="Account" subtitle={formatRole(user?.role)} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.avatarBox, { backgroundColor: accent, marginTop: 8 }]}>
          <Text style={styles.avatarText}>{initialsOf(user?.firstName, user?.lastName)}</Text>
        </View>
        <Text style={[styles.titleExtrabold, { fontSize: 21, marginBottom: 4 }]}>
          {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Office account'}
        </Text>
        <View style={[local.roleBadge, { backgroundColor: `${accent}14`, alignSelf: 'center' }]}>
          <Shield size={12} color={accent} />
          <Text style={[local.roleBadgeText, { color: accent }]}>{formatRole(user?.role)}</Text>
        </View>

        <View style={local.card}>
          <View style={local.row}>
            <Mail size={16} color={palette.muted} />
            <Text style={local.rowText}>{user?.email || '—'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[local.card, local.linkRow]}
          activeOpacity={0.85}
          onPress={() => router.push('/phonebook' as never)}
        >
          <View style={[local.linkIcon, { backgroundColor: `${accent}14` }]}>
            <BookUser size={18} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={local.linkTitle}>Phone Book</Text>
            <Text style={local.linkSub}>
              {waiting > 0
                ? `${waiting} restore request${waiting === 1 ? '' : 's'} waiting for you`
                : 'Your phone’s contacts, backed up automatically'}
            </Text>
          </View>
          {waiting > 0 ? (
            <View style={local.linkBadge}>
              <Text style={local.linkBadgeText}>{waiting}</Text>
            </View>
          ) : null}
          <ChevronRight size={18} color={palette.mutedLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[local.card, local.linkRow]}
          activeOpacity={0.85}
          onPress={() => router.push('/files' as never)}
        >
          <View style={[local.linkIcon, { backgroundColor: `${accent}14` }]}>
            <FolderOpen size={18} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={local.linkTitle}>Shared Files</Text>
            <Text style={local.linkSub}>Files sent in chats — share again without uploading</Text>
          </View>
          <ChevronRight size={18} color={palette.mutedLight} />
        </TouchableOpacity>

        <AppearanceCard style={{ marginBottom: 20 }} />

        <TouchableOpacity style={local.signOutBtn} activeOpacity={0.85} onPress={confirmSignOut}>
          <LogOut size={17} color={palette.danger} />
          <Text style={local.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 24,
  },
  roleBadgeText: { fontSize: 11.5, fontWeight: '800' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
    padding: 14,
    marginBottom: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  linkBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBadgeText: { color: '#fff', fontSize: 11.5, fontWeight: '900' },
  linkTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  linkSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2 },
  rowText: { fontSize: 14, fontWeight: '600', color: palette.ink },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingVertical: 14,
  },
  signOutText: { fontSize: 14.5, fontWeight: '800', color: palette.danger },
});
