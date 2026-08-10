// app/(tabs)/profile.tsx
//
// The account: who is signed in, and the contract behind it.
//
// Phase 3 adds the privacy policy link and the deletion request path. This is
// the contract-facing half.

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import {
  Building2,
  CalendarDays,
  CreditCard,
  Hash,
  LogOut,
  Mail,
  Phone,
  User,
  Zap,
} from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useAuth, initialsOf } from '../../src/auth/AuthContext';
import { useClient, formatDateOnly, formatSystemSize } from '../../src/hooks';
import { useSiteContext } from '../../src/site-context';

/** Accent options, matching the residential app's picker. Teal leads here. */
const ACCENTS = ['#0F766E', '#2E6BFF', '#7C3AED', '#B45309', '#BE123C'];

export default function ProfileScreen() {
  const { accent, setAccent } = useAccent();
  const { user, clientName, signOut } = useAuth();
  const { sites } = useSiteContext();
  const { data, loading, error, refreshing, refresh } = useClient();

  const c = data?.customer;

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'You will need your email and password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  if (loading && !data) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
        }
      >
        <View style={[styles.avatarBox, { backgroundColor: accent, marginTop: 8 }]}>
          <Text style={styles.avatarText}>{initialsOf(user?.firstName, user?.lastName)}</Text>
        </View>
        <Text style={[styles.titleExtrabold, { fontSize: 21, marginBottom: 4 }]}>
          {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Your account'}
        </Text>
        <Text style={[styles.subText, { textAlign: 'center', marginBottom: 24 }]}>
          {clientName || c?.client_name || ''}
        </Text>

        {error && !data ? (
          <View style={styles.card}>
            <Text style={local.error}>{error}</Text>
            <TouchableOpacity
              onPress={refresh}
              style={[styles.btnPrimary, { backgroundColor: accent, marginTop: 14 }]}
            >
              <Text style={styles.btnPrimaryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Signed-in user ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>SIGNED IN AS</Text>
          <Row icon={<User size={16} color={palette.muted} />} label="Name"
               value={[user?.firstName, user?.lastName].filter(Boolean).join(' ')} />
          <Row icon={<Mail size={16} color={palette.muted} />} label="Email" value={user?.email} last />
        </View>

        {/* ── Contract ───────────────────────────────────────────────── */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>YOUR CONTRACT</Text>
          <Row icon={<Building2 size={16} color={palette.muted} />} label="Client" value={c?.client_name} />
          <Row icon={<Hash size={16} color={palette.muted} />} label="Contract type" value={c?.contract_type} />
          <Row icon={<CreditCard size={16} color={palette.muted} />} label="Billing" value={c?.billing_type} />
          <Row
            icon={<CalendarDays size={16} color={palette.muted} />}
            label="Started"
            value={c?.contract_start_date ? formatDateOnly(c.contract_start_date) : null}
          />
          <Row
            icon={<Zap size={16} color={palette.muted} />}
            label="System size"
            value={c?.total_system_size ? formatSystemSize(c.total_system_size) : null}
          />
          <Row
            icon={<Building2 size={16} color={palette.muted} />}
            label="Sites"
            value={sites.length ? String(sites.length) : null}
          />
          <Row
            icon={<Hash size={16} color={palette.muted} />}
            label="Panels"
            value={c?.total_panel_count ? String(c.total_panel_count) : null}
            last
          />
        </View>

        {/* ── Who to call ────────────────────────────────────────────── */}
        {c?.contact_person || c?.contact_number || c?.sales_agent ? (
          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={[styles.cardTitle, { marginBottom: 12 }]}>CONTACTS</Text>
            <Row icon={<User size={16} color={palette.muted} />} label="Your contact" value={c?.contact_person} />
            <Row icon={<Phone size={16} color={palette.muted} />} label="Phone" value={c?.contact_number} />
            <Row icon={<User size={16} color={palette.muted} />} label="Account manager" value={c?.sales_agent} last />
          </View>
        ) : null}

        {/* ── Accent ─────────────────────────────────────────────────── */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>APP COLOUR</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {ACCENTS.map((col) => (
              <TouchableOpacity
                key={col}
                onPress={() => setAccent(col)}
                style={[
                  local.swatch,
                  { backgroundColor: col },
                  accent === col && { borderWidth: 3, borderColor: palette.ink },
                ]}
                accessibilityLabel={`Set accent colour ${col}`}
              />
            ))}
          </View>
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
  value: string | null | undefined;
  last?: boolean;
}) {
  if (!value) return null;
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
  swatch: { width: 40, height: 40, borderRadius: 20 },
  error: { fontSize: 13, color: palette.danger, fontWeight: '600', textAlign: 'center' },
});
