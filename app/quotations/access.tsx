// app/quotations/access.tsx - the super admin chooses which office users may use Quotations on the phone.
// Saved on the server (quotation_app_access); the switch takes effect the next time that person opens the app.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { styles as shared, palette } from '../../src/theme';
import { errorMessage } from '../../src/api/client';
import PageHeader from '../../src/components/PageHeader';
import { useQuotationAccess } from '../../src/quotation/access';
import { AccessUser, listAccess, setAccess } from '../../src/quotation/api';

const DEPARTMENT: Record<string, string> = {
  ci_admin: 'C&I Admin', operations: 'Operations', admin: 'Admin', sales: 'Sales', accounts: 'Accounts',
};
const dept = (t: string) => DEPARTMENT[String(t || '').trim().toLowerCase()] ?? t;

export default function QuotationAccessScreen() {
  const router = useRouter();
  const { canManage, ready } = useQuotationAccess();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await listAccess());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the staff list.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (canManage) void load(); }, [canManage, load]);

  const toggle = async (u: AccessUser, granted: boolean) => {
    setBusy(u.id);
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, granted } : x))); // optimistic
    try {
      await setAccess(u.id, granted);
    } catch (e) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, granted: !granted } : x)));
      Alert.alert('Quotations access', errorMessage(e, 'Could not change access.'));
    } finally {
      setBusy(null);
    }
  };

  if (!canManage) {
    return (
      <View style={shared.screen}>
        <PageHeader title="Quotations access" onBack={() => router.back()} />
        {ready ? <Text style={[s.empty, { color: palette.muted }]}>Only the super admin can manage this.</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={palette.muted} />}
      </View>
    );
  }

  return (
    <View style={shared.screen}>
      <PageHeader title="Quotations access" subtitle="Choose who can create and share quotations on the app" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.muted} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          ListEmptyComponent={<Text style={[s.empty, { color: palette.muted }]}>{error ?? 'No office staff found.'}</Text>}
          renderItem={({ item }) => (
            <View style={[s.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: palette.ink }]} numberOfLines={1}>{item.name || item.email}</Text>
                <Text style={[s.meta, { color: palette.muted }]} numberOfLines={1}>{dept(item.type)}{item.email ? ` · ${item.email}` : ''}</Text>
              </View>
              <Switch value={item.granted} disabled={busy === item.id} onValueChange={(v) => void toggle(item, v)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 24, fontSize: 14 },
});
