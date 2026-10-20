// app/phonebook.tsx — Staff Phone Book.
//
// Back up the company phone's contacts to the server, and restore them onto a
// new phone. A root-level stack page (not a tab), reached from the staff
// Account tab; app/_layout.tsx lists it in STAFF_STACK_SEGMENTS so the staff
// guard lets it through and a client session is turned away.
//
// All the logic is in src/phonebook.ts (read its header for the rules). This
// screen only: shows what is in the backup (searchable, paged), runs
// Back up / Restore with a progress bar and a plain-language result, and lets
// the user remove a contact from the backup (long-press).
//
// A quiet auto-backup runs when the page opens IF the user has already backed
// up once, the contacts permission is already granted, and the last backup is
// over 24 h old. The first backup is always an explicit tap + confirmation.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CircleAlert, CloudDownload, CloudUpload, Phone, Search, ShieldCheck } from 'lucide-react-native';
import { palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import PageHeader from '../src/components/PageHeader';
import { errorMessage } from '../src/api/client';
import { formatDateTime } from '../src/hooks';
import {
  BackupResult,
  PhonebookContact,
  PhonebookError,
  PhonebookSummary,
  Progress,
  RestoreResult,
  backupContacts,
  contactsPermissionGranted,
  deleteContact,
  fetchContacts,
  fetchSummary,
  restoreContacts,
} from '../src/phonebook';

const PAGE = 50;
const AUTO_BACKUP_AFTER_MS = 24 * 60 * 60 * 1000;
const TINTS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#14b8a6'];

const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();
function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function backupMessage(r: BackupResult): string {
  if (r.sent === 0) {
    return r.deviceTotal === 0
      ? 'There are no contacts on this phone. Your existing backup was not changed.'
      : 'None of the contacts on this phone have a phone number. Your existing backup was not changed.';
  }
  const parts = [`${r.inserted} new`, `${r.updated} updated`, `${r.unchanged} already backed up`];
  let msg = `Backed up ${r.sent} contact${r.sent === 1 ? '' : 's'} (${parts.join(', ')}).`;
  if (r.noNumber) msg += ` ${r.noNumber} without a phone number ${r.noNumber === 1 ? 'was' : 'were'} skipped.`;
  if (r.skippedDeleted) msg += ` ${r.skippedDeleted} you removed earlier stayed removed.`;
  return msg;
}

function restoreMessage(r: RestoreResult): string {
  if (r.total === 0) return 'Your backup is empty — nothing to restore yet. Back up the old phone first.';
  let msg = `Added ${r.added} contact${r.added === 1 ? '' : 's'} to this phone.`;
  if (r.alreadyOnPhone) msg += ` ${r.alreadyOnPhone} ${r.alreadyOnPhone === 1 ? 'was' : 'were'} already on the phone.`;
  if (r.failed) msg += ` ${r.failed} could not be added.`;
  return msg;
}

export default function PhonebookScreen() {
  const router = useRouter();
  const { accent } = useAccent();

  const [summary, setSummary] = useState<PhonebookSummary | null>(null);
  const [contacts, setContacts] = useState<PhonebookContact[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const mounted = useRef(true);
  const requestId = useRef(0); // drops answers that belong to an older search
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── loading the list ──
  const load = useCallback(async (q: string, offset: number, mode: 'replace' | 'append') => {
    const id = ++requestId.current;
    try {
      const page = await fetchContacts({ q, limit: PAGE, offset, sort: 'name' });
      if (!mounted.current || id !== requestId.current) return;
      setContacts((prev) => (mode === 'append' ? [...prev, ...page.contacts] : page.contacts));
      setTotal(page.total);
      setHasMore(page.has_more);
      setError(null);
    } catch (err) {
      if (!mounted.current || id !== requestId.current) return;
      setError(errorMessage(err, 'Could not load your phone book.'));
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const s = await fetchSummary();
      if (mounted.current) setSummary(s);
      return s;
    } catch {
      return null; // the list's own error state covers a dead connection
    }
  }, []);

  // search is debounced so typing does not fire a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => void load(query.trim(), 0, 'replace'), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadSummary(), load(query.trim(), 0, 'replace')]);
  }, [loadSummary, load, query]);

  // ── back up ──
  const runBackup = useCallback(
    async (silent: boolean) => {
      setBusy('backup');
      setProgress(null);
      if (!silent) setNotice(null);
      try {
        const r = await backupContacts((p) => mounted.current && setProgress(p));
        if (!mounted.current) return;
        setNotice({ kind: 'ok', text: backupMessage(r) });
        await reloadAll();
      } catch (err) {
        if (!mounted.current) return;
        // a permission refusal already explained itself; a silent run stays quiet
        if (silent) return;
        setNotice({
          kind: 'error',
          text: err instanceof PhonebookError ? err.message : errorMessage(err, 'Could not back up contacts.'),
        });
      } finally {
        if (mounted.current) {
          setBusy(null);
          setProgress(null);
        }
      }
    },
    [reloadAll],
  );

  const onBackup = () => {
    if (summary?.last_synced_at) {
      void runBackup(false);
      return;
    }
    // first time: say plainly what leaves the phone
    Alert.alert(
      'Back up this phone’s contacts?',
      'The names, phone numbers, emails and company of the contacts on this phone will be saved to SoWash’s server, private to your account, so you can restore them on a new phone. Nothing is removed from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Back up', onPress: () => void runBackup(false) },
      ],
    );
  };

  // ── restore ──
  const runRestore = useCallback(async () => {
    setBusy('restore');
    setProgress(null);
    setNotice(null);
    try {
      const r = await restoreContacts((p) => mounted.current && setProgress(p));
      if (mounted.current) setNotice({ kind: 'ok', text: restoreMessage(r) });
    } catch (err) {
      if (mounted.current) {
        setNotice({
          kind: 'error',
          text: err instanceof PhonebookError ? err.message : errorMessage(err, 'Could not restore contacts.'),
        });
      }
    } finally {
      if (mounted.current) {
        setBusy(null);
        setProgress(null);
      }
    }
  }, []);

  const onRestore = () => {
    const n = summary?.total ?? total;
    if (!n) {
      setNotice({ kind: 'error', text: 'Your backup is empty. Back up the old phone first.' });
      return;
    }
    Alert.alert(
      'Restore contacts to this phone?',
      `${n} contact${n === 1 ? '' : 's'} from your backup will be added to this phone. Contacts already here are skipped — nothing is changed or deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => void runRestore() },
      ],
    );
  };

  // first load + quiet auto-backup
  useEffect(() => {
    void (async () => {
      const s = await loadSummary();
      if (!s?.last_synced_at) return;
      // the server stores a timestamp WITHOUT a zone; both sides use the same clock, so compare loosely
      const age = Date.now() - new Date(s.last_synced_at).getTime();
      if (age > AUTO_BACKUP_AFTER_MS && (await contactsPermissionGranted()) && mounted.current) {
        void runBackup(true);
      }
    })();
    // once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── per-contact actions ──
  const confirmRemove = (c: PhonebookContact) => {
    Alert.alert(
      'Remove from backup?',
      `${c.display_name} will be removed from your backup and will not be added back by later backups. It stays on this phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContact(c.id);
              setContacts((prev) => prev.filter((x) => x.id !== c.id));
              setTotal((t) => Math.max(0, t - 1));
              void loadSummary();
            } catch (err) {
              Alert.alert('Could not remove', errorMessage(err));
            }
          },
        },
      ],
    );
  };

  const call = (number: string) => {
    void Linking.openURL(`tel:${number.replace(/[^\d+*#]/g, '')}`).catch(() => {});
  };

  const pct = progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  const subtitle = useMemo(() => {
    const n = summary?.total ?? total;
    return `${n} contact${n === 1 ? '' : 's'} backed up`;
  }, [summary, total]);

  const header = (
    <View>
      <View style={s.card}>
        <View style={s.statusRow}>
          <View style={[s.statusIcon, { backgroundColor: `${accent}14` }]}>
            <ShieldCheck size={18} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statusTitle}>
              {summary?.last_synced_at ? `Last backed up ${formatDateTime(summary.last_synced_at)}` : 'Not backed up yet'}
            </Text>
            <Text style={s.statusSub}>
              {summary?.last_device_count != null
                ? `${summary.last_device_count} contacts were on the phone then.`
                : 'Back up so a lost or broken phone never loses your contacts.'}
            </Text>
          </View>
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: accent }, busy ? s.btnOff : null]}
            activeOpacity={0.85}
            disabled={!!busy}
            onPress={onBackup}
          >
            {busy === 'backup' ? <ActivityIndicator size="small" color="#fff" /> : <CloudUpload size={17} color="#fff" />}
            <Text style={s.btnText}>Back up now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnOutline, { borderColor: accent }, busy ? s.btnOff : null]}
            activeOpacity={0.85}
            disabled={!!busy}
            onPress={onRestore}
          >
            {busy === 'restore' ? <ActivityIndicator size="small" color={accent} /> : <CloudDownload size={17} color={accent} />}
            <Text style={[s.btnText, { color: accent }]}>Restore to phone</Text>
          </TouchableOpacity>
        </View>

        {busy ? (
          <View style={{ marginTop: 12 }}>
            <Text style={s.progressLabel}>{progress?.label || 'Starting…'}</Text>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: accent }]} />
            </View>
          </View>
        ) : null}

        {notice ? (
          <View style={[s.notice, notice.kind === 'error' ? s.noticeError : s.noticeOk]}>
            <Text style={[s.noticeText, notice.kind === 'error' ? { color: palette.danger } : { color: palette.inkSoft }]}>
              {notice.text}
            </Text>
          </View>
        ) : null}

        <Text style={s.fineprint}>
          Only contacts with a phone number are saved. A contact missing from this phone is never deleted from your
          backup, and one you remove here stays removed. Your backup is private to your account.
        </Text>
      </View>

      <View style={s.searchWrap}>
        <Search size={16} color={palette.mutedLight} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, company or number…"
          placeholderTextColor={palette.mutedLight}
          style={s.searchInput}
          autoCorrect={false}
        />
      </View>
    </View>
  );

  return (
    <View style={s.screen}>
      <PageHeader title="Phone Book" subtitle={subtitle} onBack={() => router.back()} />

      {loading && contacts.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={accent}
              onRefresh={() => {
                setRefreshing(true);
                void reloadAll();
              }}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!hasMore || loadingMore || loading) return;
            setLoadingMore(true);
            void load(query.trim(), contacts.length, 'append');
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 14 }} color={accent} /> : null}
          initialNumToRender={14}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => {
            const first = item.phones[0]?.number;
            const sub = [item.company, item.job_title].filter(Boolean).join(' · ');
            return (
              <TouchableOpacity
                style={s.row}
                activeOpacity={0.85}
                onLongPress={() => confirmRemove(item)}
                delayLongPress={350}
              >
                <View style={[s.avatar, { backgroundColor: colorFor(item.display_name) }]}>
                  <Text style={s.avatarText}>{initial(item.display_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  {sub ? (
                    <Text style={s.meta} numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                  {item.phones.slice(0, 2).map((p, i) => (
                    <Text key={`${p.number}-${i}`} style={s.number} numberOfLines={1}>
                      {p.number}
                      <Text style={s.label}>{`  ${p.label}`}</Text>
                    </Text>
                  ))}
                  {item.phones.length > 2 ? <Text style={s.meta}>+{item.phones.length - 2} more</Text> : null}
                </View>
                {first ? (
                  <TouchableOpacity
                    style={[s.callBtn, { backgroundColor: `${accent}14` }]}
                    onPress={() => call(first)}
                    hitSlop={8}
                    accessibilityLabel={`Call ${item.display_name}`}
                  >
                    <Phone size={17} color={accent} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            error ? (
              <View style={s.empty}>
                <CircleAlert size={22} color={palette.danger} />
                <Text style={s.emptyTitle}>Could not load your phone book</Text>
                <Text style={s.emptyBody}>{error}</Text>
              </View>
            ) : (
              <View style={s.empty}>
                <Phone size={22} color={palette.mutedLight} />
                <Text style={s.emptyTitle}>{query ? 'No matches' : 'Nothing backed up yet'}</Text>
                <Text style={s.emptyBody}>
                  {query ? 'Try a different search.' : 'Tap “Back up now” to save this phone’s contacts.'}
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40, gap: 8 },

  card: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
    padding: 14,
    marginBottom: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 14, fontWeight: '800', color: palette.ink },
  statusSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2, lineHeight: 17 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    paddingVertical: 12,
  },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },

  progressLabel: { fontSize: 12, fontWeight: '700', color: palette.muted, marginBottom: 6 },
  track: { height: 7, borderRadius: 4, backgroundColor: palette.borderSubtle, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },

  notice: { marginTop: 12, borderRadius: 12, padding: 11, borderWidth: 1 },
  noticeOk: { backgroundColor: palette.bg, borderColor: palette.border },
  noticeError: { backgroundColor: palette.bg, borderColor: palette.danger },
  noticeText: { fontSize: 12.5, fontWeight: '600', lineHeight: 18 },

  fineprint: { fontSize: 11.5, color: palette.mutedLight, lineHeight: 16, marginTop: 12 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.ink, padding: 0 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  name: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  meta: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },
  number: { fontSize: 12.5, fontWeight: '700', color: palette.inkSoft, marginTop: 3 },
  label: { fontSize: 11, fontWeight: '600', color: palette.mutedLight },
  callBtn: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', gap: 6, marginTop: 40, paddingHorizontal: 28 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginTop: 6 },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },
});
