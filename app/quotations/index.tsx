// app/quotations/index.tsx - Quotations list (super admin only). Same saved quotations as the web console's
// Sales > Quotations (GET /api/quotations). Tap a row to open/edit it, "New" to create one.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FileText, Plus, Search, Share2, Users } from 'lucide-react-native';
import { styles as shared, palette } from '../../src/theme';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import PageHeader from '../../src/components/PageHeader';
import { useQuotationAccess } from '../../src/quotation/access';
import { QuotationRow, STATUSES, getQuotation, listQuotations, setQuotationStatus, statusOf } from '../../src/quotation/api';
import { shareQuotationPdf } from '../../src/quotation/pdf';
import { formatDateOnly } from '../../src/hooks';

const money = (n: string | number) => Math.round(Number(n) || 0).toLocaleString('en-US');

export default function QuotationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { allowed, canManage, ready } = useQuotationAccess();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const seq = useRef(0); // guards against a slow earlier response overwriting a newer one

  const load = useCallback(
    async (p: number, replace: boolean) => {
      const mine = ++seq.current;
      try {
        const r = await listQuotations({ page: p, search: query.trim(), status });
        if (mine !== seq.current) return;
        setRows((prev) => (replace ? r.quotations : [...prev, ...r.quotations]));
        setPage(p);
        setPages(r.totalPages);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(errorMessage(e, 'Could not load quotations.'));
      } finally {
        if (mine === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [query, status],
  );

  // debounce search/status changes; the focus effect reloads when coming back from the form
  useEffect(() => {
    if (!allowed) return undefined;
    setLoading(true);
    const t = setTimeout(() => void load(1, true), 300);
    return () => clearTimeout(t);
  }, [allowed, load]);
  useFocusEffect(
    useCallback(() => {
      if (allowed) void load(1, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed]),
  );

  // share a saved quotation as a PDF straight from the list
  const share = async (row: QuotationRow) => {
    setSharingId(row.id);
    try {
      const q = await getQuotation(row.id);
      await shareQuotationPdf({ ...q.data, quoteNo: q.data?.quoteNo || q.quote_no, clientName: q.data?.clientName || q.client_name }, [user?.firstName, user?.lastName].filter(Boolean).join(' '));
      // the share sheet gives no "sent" signal, so ask
      if (row.status === 'draft') {
        Alert.alert('Mark as Sent?', 'Did you send this quotation to the client?', [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'Mark as Sent',
            onPress: () =>
              setQuotationStatus(row.id, 'sent')
                .then((u) => setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, status: u.status } : r))))
                .catch((e) => Alert.alert('Quotation', errorMessage(e, 'Could not update the status.'))),
          },
        ]);
      }
    } catch (e) {
      Alert.alert('Quotation', errorMessage(e, 'Could not share the quotation.'));
    } finally {
      setSharingId(null);
    }
  };

  if (!allowed) {
    return (
      <View style={shared.screen}>
        <PageHeader title="Quotations" onBack={() => router.back()} />
        {ready ? (
          <Text style={[s.empty, { color: palette.muted }]}>Quotations are not enabled for your account. Ask the super admin.</Text>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.muted} />
        )}
      </View>
    );
  }

  return (
    <View style={shared.screen}>
      <PageHeader
        title="Quotations"
        subtitle="Create and manage client quotations"
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {canManage ? (
              <TouchableOpacity style={s.newBtn} onPress={() => router.push('/quotations/access' as never)} accessibilityLabel="Who can use Quotations">
                <Users size={16} color="#fff" />
                <Text style={s.newBtnText}>Access</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.newBtn} onPress={() => router.push('/quotations/new' as never)} accessibilityLabel="New quotation">
              <Plus size={16} color="#fff" />
              <Text style={s.newBtnText}>New</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <View style={[s.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Search size={16} color={palette.muted} />
        <TextInput
          style={[s.searchInput, { color: palette.ink }]}
          placeholder="Search client, site or quote no."
          placeholderTextColor={palette.mutedLight}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>

      <View style={s.chips}>
        {[{ value: '', label: 'All', color: palette.ink }, ...STATUSES].map((c) => {
          const on = status === c.value;
          return (
            <TouchableOpacity
              key={c.value || 'all'}
              onPress={() => setStatus(c.value)}
              style={[s.chip, { borderColor: c.color, backgroundColor: on ? c.color : 'transparent' }]}
            >
              <Text style={[s.chipText, { color: on ? '#fff' : c.color }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.muted} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(1, true); }} />}
          onEndReached={() => { if (!loading && page < pages) void load(page + 1, false); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={[s.empty, { color: palette.muted }]}>
              {error ?? (query || status ? 'No quotations match these filters.' : 'No quotations saved yet.')}
            </Text>
          }
          renderItem={({ item }) => {
            const st = statusOf(item.status);
            return (
              <TouchableOpacity
                style={[s.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
                onPress={() => router.push(`/quotations/${item.id}` as never)}
                activeOpacity={0.8}
              >
                <View style={s.icon}><FileText size={18} color="#1C9BE0" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.client, { color: palette.ink }]} numberOfLines={1}>{item.client_name}</Text>
                  <Text style={[s.meta, { color: palette.muted }]} numberOfLines={1}>
                    {item.quote_no}{item.site ? ` · ${item.site}` : ''}
                  </Text>
                  <Text style={[s.meta, { color: palette.mutedLight }]}>
                    {item.quote_date ? formatDateOnly(item.quote_date.slice(0, 10)) : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[s.total, { color: palette.ink }]}>{item.currency} {money(item.total)}</Text>
                  <View style={[s.pill, { borderColor: st.color }]}>
                    <Text style={[s.pillText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <TouchableOpacity style={s.shareBtn} onPress={() => void share(item)} disabled={sharingId !== null} hitSlop={6}
                  accessibilityLabel={`Share quotation ${item.quote_no}`}>
                  {sharingId === item.id ? <ActivityIndicator size="small" /> : <Share2 size={18} color="#1C9BE0" />}
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  newBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8, paddingHorizontal: 14, height: 46, borderRadius: 14, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  shareBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(51,184,240,0.14)', alignItems: 'center', justifyContent: 'center' },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(51,184,240,0.14)', alignItems: 'center', justifyContent: 'center' },
  client: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 2 },
  total: { fontSize: 14, fontWeight: '800' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 24, fontSize: 14 },
});
